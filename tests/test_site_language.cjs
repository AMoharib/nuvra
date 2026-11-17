const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.join(__dirname, '../site');
const en = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const ar = fs.readFileSync(path.join(site, 'ar/index.html'), 'utf8');
assert.match(ar, /<html[^>]+lang="ar"[^>]+dir="rtl"/);
assert.match(ar, /hreflang="en"[^>]*>English<\/a>/);
assert.match(en, /href="ar\/" lang="ar" hreflang="ar">العربية/);
assert.match(ar, /class="answer-text" lang="en" dir="ltr"/);
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).sort();
assert.deepEqual(ids(en), ids(ar), 'Both languages expose the same interaction targets');
for (const [html, folder] of [[en, site], [ar, path.join(site, 'ar')]]) {
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith('#')) assert.ok(ids(html).includes(url.slice(1)), url);
    else if (!/^https?:/.test(url)) assert.ok(fs.existsSync(path.resolve(folder, url.split('#')[0])), url);
  }
  assert.equal((html.match(/data-platform-download/g) || []).length, 4);
  assert.equal((html.match(/data-platform-key=/g) || []).length, 3);
  assert.ok(!html.includes('ArabicRelay-Setup'), 'Legacy naming FAQ is removed');
  assert.ok(html.indexOf('platform.js') < html.indexOf('main.js'));
  assert.ok(html.indexOf('platform.js') < html.indexOf('downloads.js'));
}
const source = fs.readFileSync(path.join(site, 'main.js'), 'utf8');
const platformSource = fs.readFileSync(path.join(site, 'platform.js'), 'utf8');
function boot(language, browser = { platform: 'Win32' }) {
  const element = () => ({ value: '', textContent: '', innerHTML: '', dataset: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
    addEventListener(event, callback) { this.listeners[event] = callback; } });
  const input = element(), output = element(), note = element(), otherDownloads = element();
  input.value = 'راجع صفحة الـ login وحسّن الـ error messages';
  const modes = ['inline', 'structured'].map(mode => Object.assign(element(), { dataset: { mode } }));
  const examples = [0, 1, 2, 3].map(example => Object.assign(element(), { dataset: { example } }));
  const keys = ['control', 'alt', 'finish'].map(platformKey => Object.assign(element(), { dataset: { platformKey } }));
  const copy = ['start', 'finish', 'send', 'demoSend', 'faqTitle', 'faqAnswer', 'downloadIntro'].map(platformCopy => Object.assign(element(), { dataset: { platformCopy } }));
  const context = vm.createContext({
    navigator: browser,
    window: { matchMedia: () => ({ matches: true }) },
    IntersectionObserver: class { observe() {} },
    document: { documentElement: { lang: language, dataset: {} }, addEventListener() {},
      getElementById: id => ({ say: input, 'answer-text': output, 'answer-note': note, 'other-platform-downloads': otherDownloads })[id],
      querySelectorAll: selector => selector === '.answer-mode' ? modes : selector === '[data-example]' ? examples : selector === '[data-platform-key]' ? keys : selector === '[data-platform-copy]' ? copy : [] },
  });
  vm.runInContext(platformSource, context);
  vm.runInContext(source, context);
  return { input, output, note, modes, examples, keys, copy, otherDownloads, platform: context.window.nuvraPlatform };
}
for (const language of ['en', 'ar']) {
  const r = boot(language);
  assert.match(r.output.innerHTML, /Review the/);
  assert.equal(/[\u0600-\u06ff]/.test(r.note.textContent), language === 'ar');
  r.modes[1].listeners.click();
  assert.match(r.output.innerHTML, /Review the login/);
  assert.equal(/[\u0600-\u06ff]/.test(r.note.textContent), language === 'ar');
  r.input.value = '<script>test</script>'; r.input.listeners.input();
  assert.ok(!r.output.innerHTML.includes('<script>'));
  assert.equal(/[\u0600-\u06ff]/.test(r.note.textContent), language === 'ar');
  r.input.value = ''; r.input.listeners.input();
  assert.equal(/[\u0600-\u06ff]/.test(r.output.innerHTML), language === 'ar');
  r.modes[0].listeners.click();
  r.input.value = 'حسّن الواجهة'; r.input.listeners.input();
  assert.equal(/[\u0600-\u06ff]/.test(r.note.textContent), language === 'ar');
  r.examples[1].listeners.click();
  assert.match(r.output.innerHTML, /dark mode/);
}
for (const language of ['en', 'ar']) {
  for (const [platform, expected] of [['MacIntel', ['Control', 'Option', 'Return']], ['Win32', ['Ctrl', 'Alt', 'Enter']]]) {
    const r = boot(language, { platform });
    assert.equal(r.otherDownloads.open, false);
    assert.equal(r.otherDownloads.hidden, platform === 'Win32');
    assert.equal(r.copy[6].textContent.includes('macOS'), platform === 'MacIntel');
    assert.deepEqual(r.keys.map(k => k.textContent), expected);
    assert.match(r.copy[0].innerHTML, new RegExp(`<kbd>${expected[1]}</kbd>`));
    assert.match(r.copy[1].innerHTML, new RegExp(`<kbd>${expected[2]}</kbd>`));
    for (const node of r.copy.slice(2, 6)) assert.ok(node.textContent.includes(expected[2]));
    assert.ok(r.note.textContent.includes(expected[2]));
    r.modes[1].listeners.click();
    assert.ok(r.note.textContent.includes(expected[2]));
    if (platform === 'MacIntel') assert.ok(!r.copy.map(n => n.textContent + n.innerHTML).join('').includes('Enter'));
  }
  for (const browser of [{ platform: 'MacIntel', maxTouchPoints: 5 }, { userAgent: 'Android' }, { platform: 'Linux x86_64' }]) {
    const r = boot(language, browser);
    assert.equal(r.platform.os, 'other');
    assert.equal(r.otherDownloads.open, true);
    assert.equal(r.otherDownloads.hidden, false);
    assert.ok(r.keys.every(k => k.textContent === ''), 'Unsupported devices retain static dual-platform instructions');
  }
}
console.log('Landing languages passed: RTL page, reciprocal links, local assets, shared controls, translated demo states and English output.');
