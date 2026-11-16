# Nuvra

Speak Arabic and English. Paste clear English text into the app where you are working.

Nuvra is an open-source Windows dictation app. Start recording with a keyboard shortcut, speak naturally, and finish to paste the result into your active text field.

[Website](https://mahmoud6901.github.io/nuvra/) · [Download for Windows](https://github.com/Mahmoud6901/nuvra/releases/latest) · [Report a problem](https://github.com/Mahmoud6901/nuvra/issues/new?template=bug_report.yml)

## Install and get started

1. Download `ArabicRelay-Setup-<version>.exe` from the latest release and run it. Installation is per user. The installer filename retains the original project name for compatibility with existing updates.
2. Open Nuvra and choose a speech model in **Models**. Local Whisper models download from this tab. Cohere and Wispr Flow are also available.
3. Install and sign in to Codex CLI or Claude Code, then select your preferred model in **Models** for English prompt preparation and translation fallback.
4. Choose **Translate Arabic only** or **Structured prompt** in **Settings**.
5. Keep Nuvra running, click in the destination text field, and press **Ctrl + Alt + Space**. Speak, then press the shortcut again to finish and paste.

Nuvra requires Windows 10 or 11, 64-bit, and Microsoft Edge WebView2. The installer installs WebView2 if needed. Local speech models require a one-time download and several gigabytes of free disk space. An NVIDIA GPU is optional. CPU processing is supported.

## Writing modes

| Mode | Result |
| --- | --- |
| **Translate Arabic only** | Translates Arabic phrases while preserving the surrounding English wording. |
| **Structured prompt** | Turns mixed Arabic and English speech into organized English instructions for an AI assistant. |

For example, you could say “راجع صفحة الـ login وحسّن الـ error messages” and receive “Review the login page and improve the error messages.”

For local Arabic translation, install Ollama and download `gemma4:e4b` from **Models**. If the local translator is unavailable or cannot produce a usable answer, Nuvra uses your selected Codex or Claude Code provider.

## Recording controls

A small recording pill appears while you speak. Finishing processes the text and pastes it into the original app.

| Control | Action |
| --- | --- |
| **Ctrl + Alt + Space** | Start or finish recording. |
| **Enter** during recording | Finish recording and paste. |
| **Esc** during recording | Cancel recording. |
| **✓** in the recording pill | Finish recording. |
| **✕** in the recording pill | Cancel recording. |

Choose a different shortcut in **Settings**. After pasting, you control when to submit the text in the destination app.

With **Wispr Flow** selected, Nuvra's shortcut opens the capture pill. Use Flow's own shortcut to dictate into it. Nuvra prepares and pastes the text after Flow's output settles.

If pasting fails, check the recording pill's status and **History** to recover the text. Nuvra also attempts to copy it to the clipboard.

## The app window

- **History** holds your latest 10 text entries, with controls to copy, delete, or clear them.
- **Models** manages speech models, the local translator, and your Codex or Claude Code selection.
- **Settings** controls writing mode, shortcuts, appearance, updates, and advanced speech options.

The interface supports English and Arabic. Change it under **Settings → Language**.

## Data and privacy

| Feature | Processing and storage |
| --- | --- |
| Local Whisper | Transcribes audio on your computer. |
| Cohere or Wispr Flow | Uses the selected provider's online speech service. |
| Local Arabic translation | Runs through Ollama when enabled and available. |
| Structured prompts and translation fallback | Sends text through your selected Codex or Claude Code provider using your signed-in account. |
| History | Stores recent text and destination information locally. |
| Settings and vocabulary | Stored on your computer. |

Nuvra keeps its data in `%LOCALAPPDATA%\Arabic Relay` so existing installations retain their settings and history after the rename. Developers can override this location with `ARABIC_RELAY_DATA_DIR`.

## Updates

Update preferences are under **Settings → Updates**. Automatic updates check GitHub Releases while Nuvra is running and verify the installer with the project's update-signing key before installation. When an update is ready, use **Restart and update**. You can also download the latest installer from the release page.

## Run from source

Use Windows with Git and Python 3.12 or newer. The automated build uses Python 3.13.

```powershell
git clone https://github.com/Mahmoud6901/nuvra.git
cd nuvra
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m arabic_relay
```

For the NVIDIA GPU dependency, install the optional extra with `.\.venv\Scripts\python.exe -m pip install -e ".[gpu]"`.

The Python package remains `arabic_relay`. Both `nuvra` and `arabic-relay` are available as installed launch commands.

### Tests

Install Node.js to run the interface tests. Prepare the small speech model used by the Python tests, then run the suites from the repository root.

```powershell
.\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-tiny', revision='d90ca5fe260221311c53c58e660288d3deb8d356')"
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
Get-ChildItem tests\test_*.cjs | ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Interface test failed in $($_.Name)" }
}
node tests/test_incremental_ui.cjs --quick
node tests/test_incremental_ui.cjs --quick --inline
node tests/test_voice.cjs --quick
```

The release workflow includes the complete test and installer verification steps. See [the release workflow](.github/workflows/release.yml).

### Build the installer

Install Inno Setup 6, then run the build from the repository root.

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[build]"
.\scripts\build.ps1
```

The build creates `dist\Nuvra\Nuvra.exe` and `dist\ArabicRelay-Setup-<version>.exe` and runs the packaged app's self-test.

## Report a problem

Include the app version, steps to reproduce the problem, and what you expected. **Settings → Advanced → Copy diagnostics** provides environment details to help investigate. Review your report for personal information before posting it. [Open a bug report](https://github.com/Mahmoud6901/nuvra/issues/new?template=bug_report.yml).

## License

Nuvra is released under the [MIT License](LICENSE).
