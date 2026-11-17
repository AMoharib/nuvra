// Release downloads must never advertise an asset that has not been published.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../site/downloads.js'), 'utf8');
const root = 'https://github.com/Mahmoud6901/nuvra/releases/download/v0.5.5/';
const asset = arch => {
  const name = `Nuvra-0.5.5-macos-${arch}.dmg`;
  return { name, browser_download_url: root + name };
};
async function run(release, failure) {
  const status = { textContent: 'Check the release page for macOS preview builds.' };
  const buttons = ['arm64', 'x86_64'].map(arch => ({ hidden: true, dataset: { macosArch: arch } }));
  const links = { hidden: true, querySelectorAll: () => buttons };
  const context = vm.createContext({
    document: { getElementById: id => id === 'mac-release-status' ? status : links },
    AbortSignal,
    fetch: async url => {
      assert.equal(url, 'https://api.github.com/repos/Mahmoud6901/nuvra/releases/latest');
      if (failure === 'offline') throw new Error('offline');
      return { ok: !failure, json: async () => release };
    },
  });
  await vm.runInContext(source, context);
  return { status, links, buttons };
}
(async () => {
  const release = { tag_name: 'v0.5.5', assets: [asset('arm64'), asset('x86_64')] };
  let result = await run(release);
  assert.equal(result.links.hidden, false);
  for (const button of result.buttons) {
    assert.equal(button.hidden, false);
    assert.equal(button.href, root + `Nuvra-0.5.5-macos-${button.dataset.macosArch}.dmg`);
  }
  result = await run({ ...release, assets: [asset('arm64')] });
  assert.equal(result.buttons[0].hidden, false);
  assert.equal(result.buttons[1].hidden, true);
  assert.match(result.status.textContent, /one architecture/);
  result = await run({ ...release, assets: [] });
  assert.equal(result.links.hidden, true);
  assert.match(result.status.textContent, /not available/);
  for (const modified of [
    { ...release, draft: true }, { ...release, prerelease: true }, { ...release, tag_name: '../../bad' },
    { ...release, assets: [{ ...asset('arm64'), browser_download_url: 'https://example.invalid/download' }] },
    { ...release, assets: [{ ...asset('arm64'), name: 'Nuvra-0.5.4-macos-arm64.dmg' }] },
  ]) {
    result = await run(modified);
    assert.equal(result.links.hidden, true);
    assert.ok(result.buttons.every(button => !button.href));
  }
  for (const failure of ['offline', 'rate-limit']) {
    result = await run(release, failure);
    assert.equal(result.links.hidden, true);
    assert.match(result.status.textContent, /Check the release page/);
  }
  console.log('Site download tests passed: published, partial, absent, invalid and unavailable releases.');
})().catch(error => { console.error(error); process.exitCode = 1; });
