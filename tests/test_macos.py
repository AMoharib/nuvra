"""macOS integration contracts. Never reads the user's clipboard or sends real keys."""
from contextlib import ExitStack
import importlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, Mock, patch

from arabic_relay import locate, paths, speech_worker, updates

if sys.platform == 'darwin':
    from arabic_relay import desktop, macos


@unittest.skipUnless(sys.platform == 'darwin', 'macOS integration')
class Platform(unittest.TestCase):
    def test_default_data_and_override(self):
        try:
            with patch.dict(os.environ, {}, clear=True):
                importlib.reload(paths)
                self.assertEqual(paths.DATA, Path.home() / 'Library/Application Support/Nuvra')
            with tempfile.TemporaryDirectory() as folder:
                with patch.dict(os.environ, {'ARABIC_RELAY_DATA_DIR': folder}):
                    importlib.reload(paths)
                    self.assertEqual(paths.DATA, Path(folder))
        finally:
            importlib.reload(paths)

    def test_cli_discovery_with_finder_path(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(locate.Path, 'home', return_value=Path(folder)), \
                patch.object(locate.shutil, 'which', return_value=None):
            executable = Path(folder) / '.local/bin/claude'
            executable.parent.mkdir(parents=True)
            executable.write_text('#!/bin/sh\n')
            executable.chmod(0o755)
            self.assertEqual(locate.claude_path(), str(executable))
            self.assertTrue(locate.valid_tool(executable, 'claude'))
            executable.chmod(0o644)
            self.assertFalse(locate.valid_tool(executable, 'claude'))

    def test_wispr_bundle_is_valid_without_exe(self):
        with tempfile.TemporaryDirectory() as folder:
            app = Path(folder) / 'Wispr Flow.app'
            (app / 'Contents').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(b'plist')
            self.assertTrue(locate.valid_tool(app, 'wispr'))
            self.assertFalse(locate.valid_tool(app, 'codex'))

    def test_updates_never_download_or_install_windows_executables(self):
        with patch.object(updates.store, 'get_setting', return_value='auto'):
            self.assertEqual(updates.mode(), 'notify')
            self.assertFalse(updates.install_on_quit_enabled())
            self.assertIsNone(updates.ready())
            self.assertTrue(updates.state()['manualOnly'])
        with self.assertRaisesRegex(ValueError, 'macOS DMG'):
            updates.download({}, '1.0.0')
        with self.assertRaisesRegex(ValueError, 'macOS DMG'):
            updates.install(True)

    def test_cpu_worker_avoids_windows_dll_calls(self):
        with patch.object(speech_worker, 'watch_parent') as watch, patch.dict(os.environ):
            self.assertIsNone(speech_worker.setup_runtime(os.getppid(), 'cpu'))
            watch.assert_called_once_with(os.getppid())
            self.assertEqual(os.environ['HF_HUB_OFFLINE'], '1')
            with self.assertRaisesRegex(ValueError, 'CPU'):
                speech_worker.setup_runtime(os.getppid(), 'cuda')

    def test_parent_exit_stops_worker(self):
        with patch.object(speech_worker.threading, 'Thread') as thread, \
                patch.object(speech_worker.os, 'getppid', side_effect=[123, 1]), \
                patch.object(speech_worker.time, 'sleep'), patch.object(speech_worker.os, '_exit') as stop:
            speech_worker.watch_parent(123)
            thread.call_args.kwargs['target']()
            stop.assert_called_once_with(90)

    def test_instance_lock_releases_on_close(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(paths, 'DATA', Path(folder)), \
                patch.object(desktop, 'MUTEX', None):
            self.assertTrue(desktop.single_instance('test'))
            first = desktop.MUTEX
            try:
                self.assertFalse(desktop.single_instance('test'))
            finally:
                first.close()
            self.assertTrue(desktop.single_instance('test'))
            desktop.MUTEX.close()

    def test_native_host_uses_cocoa(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(paths, 'DATA', Path(folder)), \
                patch.object(desktop.server, 'bind') as bind, patch.object(desktop, 'QuickCapture'), \
                patch.object(desktop.webview, 'create_window'), patch.object(desktop.webview, 'start') as start, \
                patch.object(desktop.speech, 'shutdown_engine'), patch.object(desktop.speech, 'cancel_preparation'):
            bind.return_value.server_address = ('127.0.0.1', 8791)
            desktop.run()
            self.assertEqual(start.call_args.kwargs['gui'], 'cocoa')


@unittest.skipUnless(sys.platform == 'darwin', 'macOS integration')
class Delivery(unittest.TestCase):
    def setUp(self):
        self.backend = macos.MacOS.__new__(macos.MacOS)
        self.backend.clipboard = MagicMock()
        self.target = macos.Target(123, object(), 'Editor')

    def test_changed_or_unreadable_focus_never_pastes(self):
        for current in (None, macos.Target(456, object(), 'Other'), macos.Target(123, None, 'Editor')):
            with patch.object(self.backend, 'capture', return_value=current), \
                    patch.object(macos.Q, 'CGEventPost') as post:
                with self.assertRaises(ValueError):
                    self.backend.gesture(self.target, Mock())
                post.assert_not_called()
        with patch.object(self.backend, 'capture', return_value=self.target), patch.object(macos, 'CFEqual', return_value=True):
            self.backend.check_target(self.target)
        with patch.object(self.backend, 'capture', return_value=self.target), patch.object(macos, 'CFEqual', return_value=False):
            with self.assertRaises(ValueError):
                self.backend.check_target(self.target)

    def test_switching_apps_prevents_focus_steal(self):
        with patch.object(macos.AX, 'AXIsProcessTrusted', return_value=True), \
                patch.object(macos.AppKit, 'NSWorkspace') as workspace, patch.object(macos, 'focus_window') as focus:
            workspace.sharedWorkspace.return_value.frontmostApplication.return_value.processIdentifier.return_value = 456
            with self.assertRaisesRegex(ValueError, 'switched'):
                self.backend.restore_target(self.target)
            focus.assert_not_called()

    def test_permission_denial_is_actionable(self):
        with patch.object(macos.AX, 'AXIsProcessTrusted', return_value=False):
            with self.assertRaisesRegex(ValueError, 'Accessibility'):
                self.backend.restore_target(self.target)

    def test_paste_sends_only_command_v_and_marks_attempt_first(self):
        order = []
        with patch.object(self.backend, 'check_target'), \
                patch.object(macos.Q, 'CGEventCreateKeyboardEvent', side_effect=['down', 'up']) as create, \
                patch.object(macos.Q, 'CGEventSetFlags') as flags, \
                patch.object(macos.Q, 'CGEventPost', side_effect=lambda *args: order.append(args[1])):
            self.backend.gesture(self.target, lambda: order.append('attempt'))
            self.assertEqual([c.args for c in create.call_args_list], [(None, 9, True), (None, 9, False)])
            self.assertEqual([c.args[1] for c in flags.call_args_list], [macos.Q.kCGEventFlagMaskCommand] * 2)
            self.assertEqual(order, ['attempt', 'down', 'up'])

    def test_clipboard_roundtrip_preserves_multiple_items_and_types(self):
        board = macos.AppKit.NSPasteboard.pasteboardWithUniqueName()
        try:
            self.backend.clipboard = board
            rows = [[('public.utf8-plain-text', b'original'), ('public.html', b'<b>original</b>')],
                    [('public.utf8-plain-text', 'عربي'.encode())]]
            self.backend.write(rows)
            snapshot = self.backend.snapshot()
            self.backend.put_text('new text')
            self.backend.write(snapshot)
            self.assertEqual(self.backend.snapshot(), rows)
        finally:
            board.releaseGlobally()

    def test_unreadable_or_oversized_clipboard_is_preserved(self):
        item = MagicMock()
        item.types.return_value = ['data']
        self.backend.clipboard.pasteboardItems.return_value = [item]
        for value in (None, b'123'):
            item.dataForType_.return_value = value
            with patch.object(macos, 'MAX_CLIPBOARD', 2), self.assertRaises(ValueError):
                self.backend.snapshot()
        self.backend.clipboard.clearContents.assert_not_called()


@unittest.skipUnless(sys.platform == 'darwin', 'macOS integration')
class Shortcuts(unittest.TestCase):
    def test_no_permission_leaves_visible_error(self):
        key = macos.RecordingHotkey(Mock())
        with patch.object(macos.AX, 'AXIsProcessTrusted', return_value=False):
            key._run()
        self.assertFalse(key.registered)
        self.assertTrue(key.ready.is_set())
        self.assertIn('Accessibility', key.error)

    def test_capture_consumes_repeat_and_key_up_during_shutdown(self):
        key = macos.CaptureHotkeys(Mock(), Mock())
        results = []
        with ExitStack() as stack:
            stack.enter_context(patch.object(macos.AX, 'AXIsProcessTrusted', return_value=True))
            create = stack.enter_context(patch.object(macos.Q, 'CGEventTapCreate', return_value='tap'))
            thread = stack.enter_context(patch.object(macos.threading, 'Thread'))
            for name in ('CFMachPortCreateRunLoopSource', 'CFRunLoopAddSource', 'CFRunLoopGetCurrent',
                         'CGEventTapEnable', 'CFMachPortInvalidate', 'CFRunLoopRemoveSource'):
                stack.enter_context(patch.object(macos.Q, name))
            stack.enter_context(patch.object(macos.Q, 'CGEventGetIntegerValueField', return_value=36))
            stack.enter_context(patch.object(macos.Q, 'CGEventGetFlags', return_value=0))
            def events(*args):
                callback = create.call_args.args[4]
                results.append(callback(None, macos.Q.kCGEventKeyDown, 'event', None))
                key.stopping.set()
                results.append(callback(None, macos.Q.kCGEventKeyDown, 'event', None))
                results.append(callback(None, macos.Q.kCGEventKeyUp, 'event', None))
            stack.enter_context(patch.object(macos.Q, 'CFRunLoopRunInMode', side_effect=events))
            key._run()
            self.assertEqual(results, [None, None, None])
            thread.assert_called_once_with(target=key.callback, daemon=True)
            self.assertFalse(key.registered)


@unittest.skipUnless(sys.platform == 'darwin', 'macOS integration')
class Credentials(unittest.TestCase):
    def test_encrypt_roundtrip_uses_keychain_key_and_refuses_tampering(self):
        from arabic_relay import macos_credentials as credentials
        from cryptography.fernet import Fernet
        with patch.object(credentials, 'key', return_value=Fernet.generate_key()) as key:
            encrypted = credentials.protect(b'private test credential')
            self.assertNotIn(b'private test credential', encrypted)
            self.assertEqual(credentials.protect(encrypted, True), b'private test credential')
            self.assertFalse(key.call_args.kwargs['create'])
            with self.assertRaises(ValueError):
                credentials.protect(b'invalid', True)

    def test_locked_keychain_does_not_fall_back_to_plaintext(self):
        from arabic_relay import macos_credentials as credentials
        with patch.object(credentials.Security, 'SecItemCopyMatching', return_value=(-1, None)):
            with self.assertRaisesRegex(ValueError, 'Keychain'):
                credentials.protect(b'private test credential')

    def test_missing_decryption_key_is_not_replaced(self):
        from arabic_relay import macos_credentials as credentials
        with patch.object(credentials.Security, 'SecItemCopyMatching',
                          return_value=(credentials.Security.errSecItemNotFound, None)), \
                patch.object(credentials.Security, 'SecItemAdd') as add:
            with self.assertRaises(ValueError):
                credentials.protect(b'encrypted', True)
            add.assert_not_called()


if __name__ == '__main__':
    unittest.main()
