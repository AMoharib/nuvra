// Exercise the real download script with release responses and browser platform hints.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../site/downloads.js'), 'utf8');
const platformSource = fs.readFileSync(require('node:path').join(__dirname, '../site/platform.js'), 'utf8');
const root = 'https://github.com/Mahmoud6901/nuvra/releases/download/v0.5.5/';
const asset = name => ({ name, browser_download_url: root + name });
const exe = asset('Nuvra-Setup-0.5.5.exe');
const legacyExe = asset('ArabicRelay-Setup-0.5.5.exe');
const dmg = arch => asset(`Nuvra-0.5.5-macos-${arch}.dmg`);
const release = { tag_name: 'v0.5.5', assets: [exe, dmg('arm64'), dmg('x86_64')] };
const mac = architecture => ({ platform: 'MacIntel', userAgent: 'Macintosh; Intel Mac OS X 10_15_7',
  userAgentData: { platform: 'macOS', getHighEntropyValues: async () => ({ architecture, bitness: '64' }) } });
function button({ compact = false, arch } = {}) {
  const label = { textContent: '' }, icon = { setAttribute(name, value) { this[name] = value; } };
  return { hidden: !!arch, dataset: { macosArch: arch }, attributes: {}, label, icon,
    hasAttribute: name => name === 'data-download-compact' && compact,
    querySelector: selector => selector === 'use' ? icon : label,
    setAttribute(name, value) { this.attributes[name] = value; } };
}
async function run({ data = release, browser = {}, failure, instantTimeout = false, language = 'en' } = {}) {
  const primary = [button({ compact: true }), button(), button(), button()];
  const windows = button(); windows.href = 'https://github.com/Mahmoud6901/nuvra/releases/latest';
  const buttons = ['arm64', 'x86_64'].map(arch => button({ arch }));
  const links = { hidden: true, querySelectorAll: () => buttons };
  const status = {}, macStatus = {}, primaryStatus = {};
  const nodes = { 'primary-download-status': primaryStatus, 'windows-download': windows, 'download-status': status, 'mac-release-status': macStatus, 'mac-download-links': links };
  let requests = 0;
  const context = vm.createContext({
    document: { documentElement: { lang: language, dataset: { assetPrefix: language === 'ar' ? '../' : '' } }, getElementById: id => nodes[id], querySelectorAll: selector => selector === '[data-platform-download]' ? primary : [] }, navigator: browser, window: {},
    AbortSignal, setTimeout: instantTimeout ? callback => setTimeout(callback, 0) : setTimeout, clearTimeout,
    fetch: async url => {
      requests++;
      assert.equal(url, 'https://api.github.com/repos/Mahmoud6901/nuvra/releases/latest');
      if (failure === 'offline') throw new Error('offline');
      return { ok: !failure, json: async () => data };
    },
  });
  vm.runInContext(platformSource, context);
  await vm.runInContext(source, context);
  assert.equal(requests, 1, 'One release lookup serves every download button');
  return { primary, windows, buttons, links, status, macStatus, primaryStatus };
}
(async () => {
  for (const browser of [{ platform: 'Win32' }, { userAgent: 'Windows NT 10.0; Win64; x64' }, { userAgentData: { platform: 'Windows' } }]) {
    const r = await run({ browser });
    assert.equal(r.windows.href, exe.browser_download_url);
    for (const link of r.primary) {
      assert.equal(link.href, exe.browser_download_url);
      assert.match(link.icon.href, /#windows$/);
      assert.match(link.attributes['aria-label'], /Windows \(\.exe\)/);
    }
    assert.equal(r.primary[0].label.textContent, 'Download');
    assert.equal(r.primary[1].label.textContent, 'Download for Windows');
  }
  for (const assets of [[legacyExe], [legacyExe, exe]]) {
    const r = await run({ browser: { platform: 'Win32' }, data: { ...release, assets } });
    const expected = assets.includes(exe) ? exe : legacyExe;
    assert.ok(r.primary.every(link => link.href === expected.browser_download_url));
    assert.equal(r.primaryStatus.textContent, r.status.textContent);
  }
  for (const [hint, arch] of [['arm', 'arm64'], ['x86', 'x86_64']]) {
    const r = await run({ browser: mac(hint) });
    for (const link of r.primary) {
      assert.equal(link.href, dmg(arch).browser_download_url);
      assert.match(link.icon.href, /#apple$/);
      assert.equal(link.title, link.attributes['aria-label']);
    }
    assert.equal(r.links.hidden, false);
    assert.ok(r.buttons.every(link => !link.hidden && /#apple$/.test(link.icon.href)));
    assert.equal(r.windows.href, exe.browser_download_url, 'Other-platform downloads remain available');
  }
  for (const browser of [
    { platform: 'MacIntel', userAgent: 'Macintosh; Intel Mac OS X 10_15_7' },
    mac(''), mac('unknown'),
    { platform: 'MacIntel', userAgentData: { getHighEntropyValues: async () => { throw new Error('denied'); } } },
    { platform: 'MacIntel', userAgentData: { getHighEntropyValues: () => new Promise(() => {}) } },
  ]) {
    const r = await run({ browser, instantTimeout: true });
    assert.equal(r.primary[1].href, '#macos-download', 'Missing hints must not default an Apple Silicon Mac to Intel');
    assert.match(r.primary[1].label.textContent, /Choose your Mac/);
    assert.ok(r.buttons.every(link => !link.hidden));
  }
  for (const browser of [{ platform: 'Linux x86_64' }, { platform: 'MacIntel', maxTouchPoints: 5 },
    { userAgent: 'iPhone; CPU iPhone OS 18 like Mac OS X' }, { userAgent: 'Linux; Android 15' },
    { userAgentData: { platform: 'macOS', mobile: true } }, {}]) {
    const r = await run({ browser });
    assert.equal(r.primary[1].href, '#download');
    assert.match(r.primary[1].icon.href, /#download$/);
  }
  let r = await run({ data: { ...release, assets: [exe, dmg('arm64')] }, browser: mac('x86') });
  assert.equal(r.primary[1].href, '#macos-download', 'Never substitute the wrong Mac architecture');
  assert.match(r.macStatus.textContent, /one architecture/);
  assert.equal(r.buttons[1].hidden, true);
  r = await run({ data: { ...release, assets: [exe] }, browser: mac('arm') });
  assert.equal(r.links.hidden, true);
  assert.match(r.macStatus.textContent, /Sign in/);
  assert.match(r.primaryStatus.textContent, /Sign-in required/);
  assert.match(r.primary[1].label.textContent, /Get Mac preview/);
  assert.equal(r.primary[1].href, 'https://github.com/Mahmoud6901/nuvra/actions/workflows/macos.yml?query=branch%3Amain+is%3Asuccess');
  r = await run({ data: { ...release, assets: [] }, browser: { platform: 'Win32' } });
  assert.equal(r.primary[1].href, 'https://github.com/Mahmoud6901/nuvra/releases/latest');
  assert.match(r.status.textContent, /no Windows installer/);
  for (const data of [null, { ...release, draft: true }, { ...release, prerelease: true },
    { ...release, tag_name: '../../bad' }, { ...release, assets: {} },
    { ...release, assets: [null, { ...exe, browser_download_url: 'https://evil.invalid/file.exe' }] },
    { ...release, assets: [{ ...dmg('arm64'), browser_download_url: root + 'Nuvra-0.5.4-macos-arm64.dmg' }] },
  ]) {
    r = await run({ data, browser: mac('arm') });
    assert.equal(r.links.hidden, true);
    assert.ok(r.buttons.every(link => !link.href));
    assert.ok(r.primary[1].href === '#macos-download' || r.primary[1].href.includes('/actions/workflows/macos.yml'));
    assert.equal(r.windows.href, 'https://github.com/Mahmoud6901/nuvra/releases/latest');
  }
  for (const failure of ['offline', 'rate-limit']) {
    r = await run({ failure, browser: { platform: 'Win32' } });
    assert.equal(r.primary[1].href, 'https://github.com/Mahmoud6901/nuvra/releases/latest');
    assert.match(r.primary[1].label.textContent, /Windows releases/);
    assert.match(r.status.textContent, /download manually/);
    assert.equal(r.windows.label.textContent, 'Windows releases');
  }
  r = await run({ browser: mac('arm'), language: 'ar' });
  assert.equal(r.primary[1].label.textContent, 'تحميل للماك');
  assert.equal(r.primary[0].label.textContent, 'تحميل');
  assert.equal(r.primary[1].icon.href, '../assets/icons/platforms.svg#apple');
  assert.match(r.macStatus.textContent, /نسخة الماك التجريبية/);
  r = await run({ failure: 'offline', language: 'ar' });
  assert.match(r.status.textContent, /تحميل اليدوي/);
  console.log('Site downloads passed: direct Windows/Mac assets, platform icons, chip fallback, mobile, missing assets and API failures.');
})().catch(error => { console.error(error); process.exitCode = 1; });
