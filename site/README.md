# Landing page

Serve this folder with any static HTTP server. The English page is `index.html`; the Egyptian Arabic page is `ar/index.html`. Both use the same CSS, interactions, and download resolver.

After editing the English markup or `locales/ar.json`, regenerate the Arabic page:

```sh
python scripts/build_site_ar.py
python scripts/build_site_ar.py --check
node tests/test_site_language.cjs
node tests/test_site_downloads.cjs
```

Run these commands from the repository root. Keep translated download and demo messages in `downloads.js` and `main.js` in sync. English sample outputs intentionally remain English on both pages.

Download links resolve the latest stable GitHub release once per page load. A click downloads the exact published installer when the platform and asset match. Mac architecture uses browser Client Hints when available; it never assumes that `MacIntel` means an Intel processor. Without reliable hints, visitors choose Apple Silicon or Intel. Mobile and unsupported platforms retain the download chooser. API errors and missing assets show explicit fallbacks, without guessed asset URLs.

Platform icons are local SVG symbols. Attribution and the Bootstrap Icons license are in `assets/icons/`.
