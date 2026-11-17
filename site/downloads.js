// Keep the preview honest: show architecture downloads only once a release actually contains them.
(async () => {
  const status = document.getElementById('mac-release-status');
  const links = document.getElementById('mac-download-links');
  if (!status || !links) return;
  const repo = 'Mahmoud6901/nuvra';
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return; // Static release/status links also work offline and when rate-limited.
    const release = await response.json();
    if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name) || release.draft || release.prerelease) return;
    const version = release.tag_name.slice(1);
    let available = 0;
    for (const link of links.querySelectorAll('[data-macos-arch]')) {
      const name = `Nuvra-${version}-macos-${link.dataset.macosArch}.dmg`;
      const expected = `https://github.com/${repo}/releases/download/${release.tag_name}/${name}`;
      const asset = (release.assets || []).find(asset => asset.name === name && asset.browser_download_url === expected);
      if (!asset) continue;
      link.href = expected;
      link.hidden = false;
      available++;
    }
    if (available) {
      links.hidden = false;
      status.textContent = `Nuvra ${version} · macOS preview${available === 1 ? ' · one architecture available' : ''}`;
    } else {
      status.textContent = 'macOS preview builds are not available in the latest release.';
    }
  } catch {
    // Leave the release-page fallback intact; no guessed version or broken asset URL.
  }
})();
