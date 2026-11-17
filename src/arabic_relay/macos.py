"""macOS desktop integration. Imported only on macOS; no input is sent on import."""
from dataclasses import dataclass
import logging
import os
import threading
import time

import AppKit
import ApplicationServices as AX
import Quartz as Q
from Foundation import NSBundle
from CoreFoundation import CFEqual

from .hotkey import RecordingHotkey as WindowsHotkey
from .paste import MAX_CLIPBOARD


def configure_webview():
    # WebKit hides getUserMedia without a usage description, even in source runs.
    # Frozen builds also declare this in Info.plist so the OS can display its prompt.
    info = NSBundle.mainBundle().infoDictionary()
    if not info.get('NSMicrophoneUsageDescription'):
        info['NSMicrophoneUsageDescription'] = 'Nuvra records your voice to prepare and paste dictated text.'


def attribute(element, name):
    error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
    return value if error == AX.kAXErrorSuccess else None


def focus_window(pid):
    if not 0 < pid < 2**31:
        return False
    app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
    return bool(app and app.activateWithOptions_(AppKit.NSApplicationActivateIgnoringOtherApps))


@dataclass(frozen=True)
class Target:
    pid: int
    focus: object
    name: str


class MacOS:
    def __init__(self):
        self.clipboard = AppKit.NSPasteboard.generalPasteboard()

    def capture(self):
        app = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        if app is None or app.processIdentifier() == os.getpid():
            return None
        pid = app.processIdentifier()
        element = AX.AXUIElementCreateApplication(pid)
        return Target(pid, attribute(element, AX.kAXFocusedUIElementAttribute), app.localizedName())

    def check_target(self, target):
        current = self.capture()
        if (current is None or current.pid != target.pid or target.focus is None
                or current.focus is None or not CFEqual(current.focus, target.focus)):
            raise ValueError('The original text field changed or is inaccessible. Copy the prompt and paste it manually.')

    def restore_target(self, target):
        if not AX.AXIsProcessTrusted():
            raise ValueError('Allow Nuvra in System Settings > Privacy & Security > Accessibility, then restart Nuvra.')
        current = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        if current is None or current.processIdentifier() not in (target.pid, os.getpid()):
            raise ValueError('You switched to another app. Copy the prompt into the intended text field.')
        if not focus_window(target.pid):
            raise ValueError('The original app closed. Copy the prompt and paste it manually.')
        deadline = time.monotonic() + .8
        while time.monotonic() < deadline:
            try:
                self.check_target(target)
                return
            except ValueError:
                time.sleep(.02)
        self.check_target(target)

    def wait_modifiers(self):
        mask = Q.kCGEventFlagMaskShift | Q.kCGEventFlagMaskControl | Q.kCGEventFlagMaskAlternate | Q.kCGEventFlagMaskCommand
        deadline = time.monotonic() + 1.5
        while Q.CGEventSourceFlagsState(Q.kCGEventSourceStateCombinedSessionState) & mask:
            if time.monotonic() >= deadline:
                raise ValueError('Release the keyboard shortcut before pasting. Your text is preserved.')
            time.sleep(.02)

    def open_clipboard(self):
        pass  # NSPasteboard has no open/close transaction.

    def close_clipboard(self):
        pass

    def sequence(self):
        return self.clipboard.changeCount()

    def snapshot(self):
        rows, size = [], 0
        for item in self.clipboard.pasteboardItems() or []:
            row = []
            for kind in item.types():
                data = item.dataForType_(kind)
                if data is None:
                    raise ValueError('The clipboard cannot be preserved. Copy the prompt manually.')
                size += len(data)
                if size > MAX_CLIPBOARD:
                    raise ValueError('The clipboard is too large to preserve. Copy the prompt manually.')
                row.append((kind, bytes(data)))
            rows.append(row)
        return rows

    def write(self, rows):
        items = []
        for row in rows:
            item = AppKit.NSPasteboardItem.alloc().init()
            for kind, data in row:
                if not item.setData_forType_(data, kind):
                    raise ValueError('macOS could not prepare the clipboard.')
            items.append(item)
        self.clipboard.clearContents()
        if items and not self.clipboard.writeObjects_(items):
            raise ValueError('macOS could not update the clipboard.')

    def put_text(self, text):
        self.write([[(AppKit.NSPasteboardTypeString, text.encode('utf-8'))]])

    def settle_clipboard(self):
        time.sleep(.12)

    def gesture(self, target, attempted):
        self.check_target(target)
        down = Q.CGEventCreateKeyboardEvent(None, 9, True)  # physical V; Command+V only
        up = Q.CGEventCreateKeyboardEvent(None, 9, False)
        if down is None or up is None:
            raise ValueError('macOS could not create a paste shortcut.')
        Q.CGEventSetFlags(down, Q.kCGEventFlagMaskCommand)
        Q.CGEventSetFlags(up, Q.kCGEventFlagMaskCommand)
        attempted()
        Q.CGEventPost(Q.kCGHIDEventTap, down)
        Q.CGEventPost(Q.kCGHIDEventTap, up)


class RecordingHotkey(WindowsHotkey):
    CHOICES = {
        'ctrl-alt-space': ('Control + Option + Space', Q.kCGEventFlagMaskControl | Q.kCGEventFlagMaskAlternate, 49),
        'ctrl-alt-r': ('Control + Option + R', Q.kCGEventFlagMaskControl | Q.kCGEventFlagMaskAlternate, 15),
        'ctrl-shift-space': ('Control + Shift + Space', Q.kCGEventFlagMaskControl | Q.kCGEventFlagMaskShift, 49),
    }

    def _run(self):
        tap = source = None
        held = set()
        mask = Q.kCGEventFlagMaskShift | Q.kCGEventFlagMaskControl | Q.kCGEventFlagMaskAlternate | Q.kCGEventFlagMaskCommand
        bindings = self.bindings()

        def event_callback(proxy, kind, event, context):
            if kind in (Q.kCGEventTapDisabledByTimeout, Q.kCGEventTapDisabledByUserInput):
                Q.CGEventTapEnable(tap, True)
                return event
            key = Q.CGEventGetIntegerValueField(event, Q.kCGKeyboardEventKeycode)
            if key in held:
                if kind == Q.kCGEventKeyUp:
                    held.discard(key)
                return None  # Reserve key-up and repeats, including during shutdown.
            if not self.stopping.is_set() and kind == Q.kCGEventKeyDown:
                flags = Q.CGEventGetFlags(event) & mask
                for modifiers, code, callback in bindings.values():
                    if key == code and flags == modifiers:
                        held.add(key)
                        threading.Thread(target=callback, daemon=True).start()
                        return None
            return event

        try:
            if not AX.AXIsProcessTrusted():
                self.error = 'Allow Nuvra in System Settings > Privacy & Security > Accessibility, then restart Nuvra.'
                return
            tap = Q.CGEventTapCreate(Q.kCGSessionEventTap, Q.kCGHeadInsertEventTap, Q.kCGEventTapOptionDefault,
                                     (1 << Q.kCGEventKeyDown) | (1 << Q.kCGEventKeyUp), event_callback, None)
            if tap is None:
                self.error = 'Allow Nuvra in Privacy & Security > Accessibility and Input Monitoring, then restart Nuvra.'
                return
            source = Q.CFMachPortCreateRunLoopSource(None, tap, 0)
            Q.CFRunLoopAddSource(Q.CFRunLoopGetCurrent(), source, Q.kCFRunLoopCommonModes)
            Q.CGEventTapEnable(tap, True)
            self.registered = True
            self.ready.set()
            while not self.stopping.is_set() or held:
                Q.CFRunLoopRunInMode(Q.kCFRunLoopDefaultMode, .05, False)
        except Exception:
            self.error = 'The recording shortcut failed. Restart Nuvra and check its Accessibility permission.'
            logging.exception('macOS recording shortcut failed')
        finally:
            if tap is not None:
                Q.CGEventTapEnable(tap, False)
                Q.CFMachPortInvalidate(tap)
            if source is not None:
                Q.CFRunLoopRemoveSource(Q.CFRunLoopGetCurrent(), source, Q.kCFRunLoopCommonModes)
            self.registered = False
            self.ready.set()

    def stop(self):
        self.stopping.set()
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout=3)


class CaptureHotkeys(RecordingHotkey):
    def __init__(self, finish, cancel):
        super().__init__(finish)
        self.cancel = cancel
        self.label = 'Return / Escape'

    def bindings(self):
        return {1: (0, 36, self.callback), 2: (0, 53, self.cancel), 3: (0, 76, self.callback)}
