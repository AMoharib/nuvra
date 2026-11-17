"""Logs, crash capture and the Copy diagnostics report. Logs never hold transcripts or audio."""
import json
import logging
import logging.handlers
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import threading
import traceback
import urllib.request

from . import __version__, locate, models, paths, speech


def logs_dir():
    folder = paths.DATA / 'logs'
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def record_crash(text):
    (logs_dir() / 'crash.txt').write_text(text, encoding='utf-8')


def crashed():
    return (paths.DATA / 'logs' / 'crash.txt').is_file()


def dismiss_crash():
    (paths.DATA / 'logs' / 'crash.txt').unlink(missing_ok=True)
    return {'crashed': False}


def start_logging():
    handler = logging.handlers.RotatingFileHandler(logs_dir() / 'relay.log', maxBytes=1_000_000, backupCount=2, encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)

    def crash(kind, error, trace):
        logging.critical('Unexpected crash', exc_info=(kind, error, trace))
        record_crash(''.join(traceback.format_exception(kind, error, trace)))
    sys.excepthook = crash
    threading.excepthook = lambda args: crash(args.exc_type, args.exc_value, args.exc_traceback)


def scrub(text):
    """Paths under the user's home folder show `<user>` instead of the Windows user name."""
    pattern = r'([A-Za-z]:[\\/]+Users[\\/]+)' + re.escape(Path.home().name) + r'(?![\w.-])'
    text = re.sub(pattern, r'\1<user>', text, flags=re.IGNORECASE)
    return text.replace(str(Path.home()) + '/', '<user>/')


def tool_line(name, kind, version=True):
    path = locate.tool_path(kind)
    if path is None:
        return f'{name}: not found'
    if not version:
        return f'{name}: {path}'
    env = {k: v for k, v in os.environ.items() if k not in ('OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY')}
    try:
        with locate.external_runtime():
            done = subprocess.run([str(path), '--version'], capture_output=True, text=True, timeout=10, env=env,
                                  stdin=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        found = (done.stdout or done.stderr).strip().splitlines()[0][:80]
    except Exception:
        found = 'version unknown'
    return f'{name}: {path} ({found})'


def report():
    gpu = models.gpu_info()
    voice = speech.status()
    lines = [f"Nuvra {__version__} ({'installed' if getattr(sys, 'frozen', False) else 'source'})",
             f'{platform.system()} {platform.version()} ({platform.machine()})', f'Python {platform.python_version()}',
             f"GPU: {gpu['name']}, {gpu['vramGb']} GB, driver {gpu['driver']}" if gpu else 'GPU: none found',
             f"Speech: {voice['speechDevice']} · {voice['speechModel'] or 'no model'} · {voice['modelPath'] or 'not set'}",
             tool_line('Codex', 'codex'), tool_line('Claude Code', 'claude'), tool_line('Wispr Flow', 'wispr', version=False),
             f'Data folder: {paths.DATA}']
    crash = paths.DATA / 'logs' / 'crash.txt'
    if crash.is_file():
        lines += ['', 'Last crash:', crash.read_text(encoding='utf-8', errors='replace').strip()]
    return scrub('\n'.join(lines))


def self_test():
    """`--self-test`: the server answers /api/status and the speech worker imports its engine. 0 means both work."""
    from . import server
    httpd = server.bind(0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        with urllib.request.urlopen(server.ORIGIN + '/api/status', timeout=60) as response:
            body = json.load(response)
        status = body.get('app') == 'arabic-relay' and 'csrf' in body
    except Exception as error:
        print(f'status failed: {error}', file=sys.stderr)
        status = False
    finally:
        httpd.shutdown()
        httpd.server_close()
    try:
        with locate.external_runtime():
            done = subprocess.run(paths.self_command('--speech-worker', '--probe'), capture_output=True, text=True, timeout=120,
                                  stdin=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        worker = done.returncode == 0 and json.loads(done.stdout.strip().splitlines()[-1]).get('probe') is True
        if not worker:
            print(f'worker failed: {done.stderr[-2000:]}', file=sys.stderr)
    except Exception as error:
        print(f'worker failed: {error}', file=sys.stderr)
        worker = False
    print(json.dumps({'status': status, 'worker': worker, 'version': __version__}), flush=True)
    return 0 if status and worker else 1


def self_test_gui():
    """Check the native webview and recording APIs without accessing the microphone or keyboard."""
    import webview
    if sys.platform == 'darwin':
        from .macos import configure_webview
        configure_webview()
    from http.server import BaseHTTPRequestHandler
    from .server import Server
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b'<!doctype html><title>Nuvra self-test</title><p>Checking recording APIs.</p>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *args):
            pass
    httpd = Server(('127.0.0.1', 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    window = webview.create_window('Nuvra self-test', f'http://127.0.0.1:{httpd.server_port}')
    result = {}
    def inspect():
        try:
            if not window.events.loaded.wait(30):
                raise RuntimeError('The native webview did not load.')
            result.update(window.evaluate_js('({secure: window.isSecureContext, '
                          'microphone: !!navigator.mediaDevices?.getUserMedia, '
                          'recorder: typeof MediaRecorder === "function"})'))
        except Exception as error:
            result['error'] = str(error)
        finally:
            window.destroy()
    try:
        webview.start(inspect, gui='cocoa' if sys.platform == 'darwin' else 'edgechromium')
    finally:
        httpd.shutdown()
        httpd.server_close()
    print(json.dumps(result), flush=True)
    return 0 if all(result.get(key) for key in ('secure', 'microphone', 'recorder')) else 1
