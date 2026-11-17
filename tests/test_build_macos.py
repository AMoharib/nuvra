"""Packaging preflight checks, without creating or changing an app bundle."""
import importlib.util
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    'build_macos', Path(__file__).resolve().parents[1] / 'scripts/build_macos.py')
build_macos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_macos)


class CryptographyLinkage(unittest.TestCase):
    extension = '/site packages/cryptography/hazmat/bindings/_rust.abi3.so'

    def check_linkage(self, libraries):
        output = self.extension + ':\n' + ''.join(
            f'\t{library} (compatibility version 1.0.0, current version 1.0.0)\n'
            for library in libraries)
        with patch.object(build_macos, 'find_spec', return_value=SimpleNamespace(origin=self.extension)), \
                patch.object(build_macos.subprocess, 'check_output', return_value=output) as inspect:
            build_macos.verify_cryptography_linkage()
        inspect.assert_called_once_with(['otool', '-L', self.extension], text=True)

    def test_static_openssl_accepts_system_libraries(self):
        self.check_linkage([
            '@rpath/cryptography.hazmat.bindings._rust.abi3.so',
            '/usr/lib/libiconv.2.dylib', '/usr/lib/libSystem.B.dylib'])

    def test_rejects_dynamic_openssl_for_absolute_and_relative_paths(self):
        for library in (
            '/usr/local/opt/openssl@3/lib/libssl.3.dylib',
            '/opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib',
            '@rpath/libssl.3.dylib', '@loader_path/libcrypto.3.dylib',
        ):
            with self.subTest(library=library), self.assertRaises(SystemExit) as error:
                self.check_linkage([library])
            self.assertIn(library, str(error.exception))
            self.assertIn('OPENSSL_STATIC=1', str(error.exception))
            self.assertIn('--force-reinstall --no-cache-dir', str(error.exception))

    def test_missing_extension_stops_build(self):
        with patch.object(build_macos, 'find_spec', return_value=None), \
                self.assertRaisesRegex(SystemExit, 'Install the macOS build dependencies'):
            build_macos.verify_cryptography_linkage()

    def test_otool_failure_is_not_treated_as_static_linkage(self):
        with patch.object(build_macos, 'find_spec', return_value=SimpleNamespace(origin=self.extension)), \
                patch.object(build_macos.subprocess, 'check_output',
                             side_effect=subprocess.CalledProcessError(1, 'otool')), \
                self.assertRaises(subprocess.CalledProcessError):
            build_macos.verify_cryptography_linkage()

    def test_bad_linkage_stops_before_touching_build_outputs(self):
        with patch.object(build_macos.sys, 'platform', 'darwin'), \
                patch.object(build_macos.platform, 'machine', return_value='x86_64'), \
                patch.object(build_macos, 'verify_cryptography_linkage', side_effect=SystemExit('dynamic OpenSSL')), \
                patch.object(build_macos.Path, 'mkdir') as mkdir, \
                patch.object(build_macos, 'run') as run, \
                self.assertRaisesRegex(SystemExit, 'dynamic OpenSSL'):
            build_macos.main()
        mkdir.assert_not_called()
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
