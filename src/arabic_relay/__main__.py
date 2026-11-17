import os
import sys


def main():
    import multiprocessing
    multiprocessing.freeze_support()  # Frozen macOS workers must not reopen the desktop app.
    if sys.platform == 'darwin':
        # Finder's PATH omits Homebrew and user-installed CLI tools.
        from pathlib import Path
        extra = [str(Path.home() / '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']
        os.environ['PATH'] = os.pathsep.join([*extra, os.environ.get('PATH', '/usr/bin:/bin:/usr/sbin:/sbin')])
    # A windowed (frozen) exe starts without console streams; print() and logging must still work.
    sys.stdout = sys.stdout or open(os.devnull, 'w')
    sys.stderr = sys.stderr or open(os.devnull, 'w')
    # Background roles first: they must never import the window toolkit.
    if '--speech-worker' in sys.argv:
        from .speech_worker import cli
        cli(sys.argv[sys.argv.index('--speech-worker') + 1:])
    elif '--setup' in sys.argv:
        from .models import setup_main
        sys.exit(setup_main(sys.argv[sys.argv.index('--setup') + 1:]))
    elif '--self-test-gui' in sys.argv:
        from .diagnostics import self_test_gui
        sys.exit(self_test_gui())
    elif '--self-test' in sys.argv:
        from .diagnostics import self_test
        sys.exit(self_test())
    elif '--browser' in sys.argv:
        from .server import main as serve
        serve(open_browser=True)
    else:
        from .desktop import main as window
        window()


if __name__ == '__main__':
    main()
