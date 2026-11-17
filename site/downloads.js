// Resolve the latest published assets once. Downloads begin only when a visitor clicks.
(async () => {
  const arabic = document.documentElement.lang === 'ar';
  const t = (english, translated) => arabic ? translated : english;
  const assetPrefix = document.documentElement.dataset.assetPrefix || '';
  const repo = 'Mahmoud6901/nuvra';
  const releases = `https://github.com/${repo}/releases/latest`;
  const primary = [...document.querySelectorAll('[data-platform-download]')];
  const windows = document.getElementById('windows-download');
  const status = document.getElementById('download-status');
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
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  // iPadOS can report MacIntel; never offer it a desktop installer automatically.
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)
    || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1);
  const os = mobile ? 'other' : /Win/i.test(platform) || /Windows NT/i.test(ua) ? 'windows'
    : /Mac/i.test(platform) || /Macintosh/i.test(ua) ? 'mac' : 'other';
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
    const exe = assetURL(`ArabicRelay-Setup-${version}.exe`);
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
      : t('macOS preview builds are not available in the latest release.', 'نسخ الماك التجريبية مش متاحة في آخر إصدار.');
    for (const link of primary) {
      if (os === 'windows' && exe) update(link, exe, t('Download for Windows', 'تحميل لويندوز'), icon, t(`Download Nuvra ${version} for Windows (.exe)`, `تحميل Nuvra ${version} لويندوز (.exe)`));
      else if (os === 'mac' && arch && mac[arch]) {
        const chip = arch === 'arm64' ? 'Apple Silicon' : 'Intel';
        update(link, mac[arch], t('Download for Mac', 'تحميل للماك'), icon, t(`Download Nuvra ${version} for Mac (${chip}, .dmg)`, `تحميل Nuvra ${version} للماك (${chip}، .dmg)`));
      } else if (os === 'mac' && !available) update(link, fallback, t('macOS preview availability', 'شوف نسخ الماك التجريبية'), icon);
    }
  } catch {
    status.textContent = t('Could not load the latest installers. Use the release links to download manually.', 'ما قدرناش نحمّل روابط آخر إصدار. استخدم روابط الإصدارات للتحميل اليدوي.');
    macStatus.textContent = t('Could not check macOS downloads. See all releases, or try again later.', 'ما قدرناش نتحقق من تحميلات الماك. شوف كل الإصدارات أو جرّب تاني بعدين.');
    update(windows, releases, t('Windows releases', 'إصدارات ويندوز'), 'windows');
    // Keep primary links on the local chooser; do not guess an installer URL.
  }
})();
