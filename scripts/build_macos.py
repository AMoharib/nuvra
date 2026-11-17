"""Build and smoke-test a native Nuvra.app, then package a drag-to-install DMG and ZIP."""
import hashlib
from importlib.util import find_spec
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(*command, **kwargs):
    subprocess.run(command, cwd=ROOT, check=True, **kwargs)


def verify_cryptography_linkage():
    """Reject OpenSSL dependencies that collide with Python's bundled dylibs."""
    # Locate without importing the extension, which may already fail to load.
    spec = find_spec('cryptography.hazmat.bindings._rust')
    if spec is None or spec.origin is None:
        raise SystemExit('Install the macOS build dependencies before packaging.')
    linked = subprocess.check_output(['otool', '-L', spec.origin], text=True)
    for line in linked.splitlines()[1:]:
        library = line.strip().split(' (', 1)[0]
        if Path(library).name.startswith(('libssl.', 'libcrypto.')):
            raise SystemExit(
                f'cryptography dynamically links {library}, which can collide with '
                "Python's OpenSSL in the app bundle. Reinstall it with:\n"
                'OPENSSL_STATIC=1 ' + sys.executable + ' -m pip install '
                "--force-reinstall --no-cache-dir 'cryptography>=43'"
            )
    print('cryptography OpenSSL linkage verified: no shared libssl/libcrypto.')


def main():
    if sys.platform != 'darwin':
        raise SystemExit('Build macOS assets on a Mac, using the target architecture Python.')
    from arabic_relay import __version__
    arch = platform.machine()
    if arch not in ('arm64', 'x86_64'):
        raise SystemExit(f'Unsupported macOS architecture: {arch}')
    verify_cryptography_linkage()
    build = ROOT / 'build/macos'
    build.mkdir(parents=True, exist_ok=True)
    icons = build / 'Nuvra.iconset'
    icons.mkdir(exist_ok=True)
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            suffix = '@2x' if scale == 2 else ''
            run('sips', '-z', str(size * scale), str(size * scale),
                str(ROOT / 'src/arabic_relay/assets/icon.png'), '--out',
                str(icons / f'icon_{size}x{size}{suffix}.png'), stdout=subprocess.DEVNULL)
    run('iconutil', '-c', 'icns', str(icons), '-o', str(build / 'Nuvra.icns'))
    run(sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
        '--distpath', str(ROOT / 'dist'), '--workpath', str(build / 'pyinstaller'),
        str(ROOT / 'installer/Nuvra-macos.spec'))
    app = ROOT / 'dist/Nuvra.app'
    run('codesign', '--verify', '--deep', '--strict', str(app))
    with tempfile.TemporaryDirectory(prefix='nuvra-self-test-') as data:
        run(str(app / 'Contents/MacOS/Nuvra'), '--self-test',
            env={**os.environ, 'ARABIC_RELAY_DATA_DIR': data}, timeout=180)
        run(str(app / 'Contents/MacOS/Nuvra'), '--self-test-gui',
            env={**os.environ, 'ARABIC_RELAY_DATA_DIR': data}, timeout=60)
    # Only stage the app and Applications link; never package a developer's data or source.
    with tempfile.TemporaryDirectory(prefix='nuvra-dmg-') as stage:
        run('ditto', str(app), str(Path(stage) / 'Nuvra.app'))
        (Path(stage) / 'Applications').symlink_to('/Applications')
        dmg = ROOT / 'dist' / f'Nuvra-{__version__}-macos-{arch}.dmg'
        run('hdiutil', 'create', '-volname', 'Nuvra', '-srcfolder', stage,
            '-ov', '-format', 'UDZO', str(dmg))
    archive = ROOT / 'dist' / f'Nuvra-{__version__}-macos-{arch}.zip'
    archive.unlink(missing_ok=True)
    run('ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(app), str(archive))
    sums = ROOT / 'dist' / f'SHA256SUMS-macos-{arch}.txt'
    lines = []
    for path in (dmg, archive):
        with path.open('rb') as stream:
            lines.append(f'{hashlib.file_digest(stream, "sha256").hexdigest()}  {path.name}\n')
    sums.write_text(''.join(lines), encoding='ascii')
    print(f'Built {dmg.name}, {archive.name}, and {sums.name}.')


if __name__ == '__main__':
    main()
