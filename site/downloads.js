// Resolve the latest published assets once. Downloads begin only when a visitor clicks.
(async () => {
  const arabic = document.documentElement.lang === 'ar';
  const t = (english, translated) => arabic ? translated : english;
  const assetPrefix = document.documentElement.dataset.assetPrefix || '';
  const repo = 'Mahmoud6901/nuvra';
  const releases = `https://github.com/${repo}/releases/latest`;
  const previews = `https://github.com/${repo}/actions/workflows/macos.yml?query=branch%3Amain+is%3Asuccess`;
  const primary = [...document.querySelectorAll('[data-platform-download]')];
  const windows = document.getElementById('windows-download');
  const status = document.getElementById('download-status');
  const primaryStatus = document.getElementById('primary-download-status');
  const macStatus = document.getElementById('mac-release-status');
  const macLinks = document.getElementById('mac-download-links');
  if (!windows || !status || !macStatus || !macLinks) return;

  function update(link, href, label, icon, description = label) {
    link.href = href;
    link.querySelector('[data-download-label]').textContent = link.hasAttribute('data-download-compact') ? t('Download', 'تحميل') : label;
    link.querySelector('use').setAttribute('href', `${assetPrefix}assets/icons/platforms.svg#${icon}`);
    link.setAttribute('aria-label', description);
    link.title = description;
  }
  const os = window.nuvraPlatform?.os || 'other';
  const icon = os === 'mac' ? 'apple' : os === 'windows' ? 'windows' : 'download';
  const fallback = os === 'mac' ? '#macos-download' : '#download';
  for (const link of primary) update(link, fallback, os === 'mac' ? t('Choose your Mac download', 'اختار نسخة الماك') : t('Choose your download', 'اختار نسخة جهازك'), icon);

  async function macArchitecture() {
    if (os !== 'mac' || !navigator.userAgentData?.getHighEntropyValues) return null;
    let timer;
    try {
      // Safari and Firefox may omit this API; do not infer Intel from their UA string.
      const hints = await Promise.race([
        navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']),
        new Promise(resolve => { timer = setTimeout(() => resolve({}), 1200); }),
      ]);
      if (hints?.bitness !== '64') return null;
      return hints.architecture === 'arm' ? 'arm64' : hints.architecture === 'x86' ? 'x86_64' : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  async function latestRelease() {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Release unavailable');
    const release = await response.json();
    if (!release || !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || release.draft || release.prerelease
        || !Array.isArray(release.assets)) throw new Error('Invalid release');
    return release;
  }
  try {
    const [release, arch] = await Promise.all([latestRelease(), macArchitecture()]);
    const version = release.tag_name.slice(1);
    function assetURL(name) {
      const expected = `https://github.com/${repo}/releases/download/${release.tag_name}/${name}`;
      return release.assets.some(asset => asset?.name === name && asset.browser_download_url === expected) ? expected : null;
    }
    const exe = assetURL(`Nuvra-Setup-${version}.exe`) || assetURL(`ArabicRelay-Setup-${version}.exe`);
    if (exe) update(windows, exe, t('Download for Windows', 'تحميل لويندوز'), 'windows', t(`Download Nuvra ${version} for Windows (.exe)`, `تحميل Nuvra ${version} لويندوز (.exe)`));
    status.textContent = exe ? t(`Nuvra ${version} · Windows 10/11, 64-bit. The download starts when you click.`, `Nuvra ${version} · ويندوز 10 و11، 64 بت. التحميل بيبدأ لما تدوس.`)
      : t('The latest release has no Windows installer. Check all releases for earlier versions.', 'آخر إصدار مفيهوش ملف تثبيت لويندوز. شوف كل الإصدارات للنسخ الأقدم.');
    const mac = {};
    for (const link of macLinks.querySelectorAll('[data-macos-arch]')) {
      const architecture = link.dataset.macosArch;
      if (!['arm64', 'x86_64'].includes(architecture)) continue;
      const url = assetURL(`Nuvra-${version}-macos-${architecture}.dmg`);
      if (!url) continue;
      mac[architecture] = url;
      const label = architecture === 'arm64' ? 'Apple Silicon' : 'Intel Mac';
      update(link, url, t(`Download for ${label}`, `تحميل لـ ${label}`), 'apple', t(`Download Nuvra ${version} for ${label} (.dmg)`, `تحميل Nuvra ${version} لـ ${label} (.dmg)`));
      link.hidden = false;
    }
    const available = Object.keys(mac).length;
    macLinks.hidden = !available;
    macStatus.textContent = available
      ? t(`Nuvra ${version} · macOS preview${available === 1 ? ' · one architecture available' : ''}. Find your chip in Apple menu → About This Mac.`, `Nuvra ${version} · نسخة الماك التجريبية${available === 1 ? ' · متاحة لنوع معالج واحد' : ''}. اعرف نوع معالجك من قائمة Apple ← حول هذا الـ Mac.`)
      : t('Mac downloads are currently shared as preview builds on GitHub. Sign in, open a successful build, and download macos-arm64 for Apple Silicon or macos-x86_64 for Intel.', 'تحميلات الماك متاحة حاليًا كنسخ تجريبية على GitHub. سجّل دخولك، افتح عملية بناء ناجحة، وحمّل macos-arm64 لـ Apple Silicon أو macos-x86_64 لـ Intel.');
    if (primaryStatus) primaryStatus.textContent = os === 'windows' ? status.textContent
      : os === 'mac' && !available ? t('Get the macOS preview on GitHub. Sign-in required.', 'حمّل نسخة الماك التجريبية من GitHub. تسجيل الدخول مطلوب.') : '';
    for (const link of primary) {
      if (os === 'windows' && exe) update(link, exe, t('Download for Windows', 'تحميل لويندوز'), icon, t(`Download Nuvra ${version} for Windows (.exe)`, `تحميل Nuvra ${version} لويندوز (.exe)`));
      else if (os === 'windows') update(link, releases, t('Windows releases', 'إصدارات ويندوز'), icon);
      else if (os === 'mac' && arch && mac[arch]) {
        const chip = arch === 'arm64' ? 'Apple Silicon' : 'Intel';
        update(link, mac[arch], t('Download for Mac', 'تحميل للماك'), icon, t(`Download Nuvra ${version} for Mac (${chip}, .dmg)`, `تحميل Nuvra ${version} للماك (${chip}، .dmg)`));
      } else if (os === 'mac' && !available) update(link, previews, t('Get Mac preview builds', 'تحميل نسخ الماك التجريبية'), icon,
        t('Get Mac preview builds on GitHub (sign-in required)', 'تحميل نسخ الماك التجريبية من GitHub (تسجيل الدخول مطلوب)'));
    }
  } catch {
    status.textContent = t('Could not load the latest installers. Use the release links to download manually.', 'ما قدرناش نحمّل روابط آخر إصدار. استخدم روابط الإصدارات للتحميل اليدوي.');
    macStatus.textContent = t('Could not check macOS downloads. See all releases, or try again later.', 'ما قدرناش نتحقق من تحميلات الماك. شوف كل الإصدارات أو جرّب تاني بعدين.');
    if (primaryStatus) primaryStatus.textContent = os === 'windows' ? status.textContent : os === 'mac' ? macStatus.textContent : '';
    update(windows, releases, t('Windows releases', 'إصدارات ويندوز'), 'windows');
    if (os === 'windows') for (const link of primary) update(link, releases, t('Windows releases', 'إصدارات ويندوز'), icon);
    // Mac and unsupported visitors retain the local chooser; never guess an installer URL.
  }
})();
