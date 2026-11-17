"""Build on the target Mac architecture via scripts/build_macos.py."""
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs
from arabic_relay import __version__

ROOT = Path(SPECPATH).parent
a = Analysis(
    [str(ROOT / 'installer/launch.py')],
    pathex=[str(ROOT / 'src')],
    datas=collect_data_files('arabic_relay', includes=['index.html', 'fonts/*', 'assets/*'])
          + collect_data_files('faster_whisper'),
    binaries=collect_dynamic_libs('ctranslate2'),
    hiddenimports=['webview.platforms.cocoa', 'ApplicationServices', 'Quartz'],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Nuvra', console=False,
          argv_emulation=False, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, upx=False, name='Nuvra')
app = BUNDLE(
    coll, name='Nuvra.app', icon=str(ROOT / 'build/macos/Nuvra.icns'),
    bundle_identifier='io.github.mahmoud6901.nuvra',
    info_plist={
        'CFBundleShortVersionString': __version__,
        'CFBundleVersion': __version__,
        'LSMinimumSystemVersion': '15.0',
        'NSHighResolutionCapable': True,
        'NSMicrophoneUsageDescription': 'Nuvra records your voice to prepare and paste dictated text.',
        'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
    },
)
