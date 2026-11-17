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
  assert.equal((html.match(/data-platform-download/g) || []).length, 3);
}
const source = fs.readFileSync(path.join(site, 'main.js'), 'utf8');
function boot(language) {
  const element = () => ({ value: '', textContent: '', innerHTML: '', dataset: {}, listeners: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
    addEventListener(event, callback) { this.listeners[event] = callback; } });
  const input = element(), output = element(), note = element();
  input.value = 'راجع صفحة الـ login وحسّن الـ error messages';
  const modes = ['inline', 'structured'].map(mode => Object.assign(element(), { dataset: { mode } }));
  const examples = [0, 1, 2, 3].map(example => Object.assign(element(), { dataset: { example } }));
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: true }) },
    IntersectionObserver: class { observe() {} },
    document: { documentElement: { lang: language }, addEventListener() {},
      getElementById: id => ({ say: input, 'answer-text': output, 'answer-note': note })[id],
      querySelectorAll: selector => selector === '.answer-mode' ? modes : selector === '[data-example]' ? examples : [] },
  });
  vm.runInContext(source, context);
  return { input, output, note, modes, examples };
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
console.log('Landing languages passed: RTL page, reciprocal links, local assets, shared controls, translated demo states and English output.');
