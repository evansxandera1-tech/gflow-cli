# Android / Termux: native Chromium

This source change routes persistent browser contexts to native Termux Chromium.
**Real Google Flow on Android is not yet verified from this Windows workspace.**
The acceptance test below requires the phone, its display and a Google account
with Flow access. Passing offline tests is not a substitute for that run.

## Install this local source

For the reported environment (gflow dependencies already installed, Python 3.11+
and patched Playwright 1.61.0 healthy), copy the supplied
`gflow-cli-termux-source.zip` to Android Downloads. In Termux:

```bash
termux-setup-storage
mkdir -p "$HOME/src"
python -m zipfile -e "$HOME/storage/downloads/gflow-cli-termux-source.zip" "$HOME/src"
cd "$HOME/src/gflow-cli-termux"
python -m pip install --no-deps --force-reinstall .
hash -r
gflow --help
```

This builds gflow-cli from this checkout, not PyPI. `--no-deps` preserves the
already installed Playwright/termux-playwright patches and native dependencies.
Use the same Python environment where the existing `gflow --help` works.
Do not run `playwright install chromium` or replace the patched Playwright.
The dependency range remains Playwright 1.61.x.

## Select Chromium and start the display

```bash
export CHROME_BINARY=/data/data/com.termux/files/usr/lib/chromium/chrome
test -x "$CHROME_BINARY"
export GFLOW_CLI_HEADLESS=false
export GFLOW_CLI_BROWSER_WINDOW_POSITION=''
export GFLOW_CLI_PROFILE=default
```

`CHROME_BINARY` is an exported process environment variable, not a gflow setting
loaded from `.env`. Keep it in your shell startup file if desired. Without the
override, native Termux is detected from `PREFIX` and uses
`$PREFIX/lib/chromium/chrome`. `/data/data/com.termux/files/usr` and Android's
equivalent `/data/user/0/com.termux/files/usr` are recognized. Missing Chromium
fails explicitly; it does not select a desktop or bundled browser.

Install the Android Termux:X11 app from the official
[nightly releases](https://github.com/termux/termux-x11/releases/tag/nightly).
Both the Android app and the companion Termux package are required:

```bash
pkg install x11-repo
pkg install termux-x11-nightly
termux-x11 :1 &
export DISPLAY=:1
am start --user 0 -n com.termux.x11/com.termux.x11.MainActivity
```

These commands follow the [Termux:X11 instructions](https://github.com/termux/termux-x11).
Run the server once; in each new shell export the matching DISPLAY. A configured
DISPLAY does not by itself prove the server is running. A missing/blank DISPLAY
raises a configuration error with these recovery commands before login starts.

## Real acceptance: login, session, one image

```bash
gflow auth login
gflow auth status
mkdir -p "$HOME/gflow-output"
gflow image t2i "A red ceramic cup on a white table, natural daylight" \
  --model nano2 --count 1 --output "$HOME/gflow-output/termux-flow.png"
```

Complete Google's login manually in Termux:X11. Continue until the Flow editor
loads; a Google login page or Flow public landing page is not enough. Complete
any Google identity recheck when requested. Login retains gflow's persistent
profile and verifies the saved session before reporting success.

The image command submits one actual request to Google Flow using your account.
Success requires a downloaded, decodable image. No simulated response is used.
Keep the phone awake and do not run another command on the same profile while
the browser is in use. Session status alone does not prove generation works.

Termux uses `executable_path` rather than the Playwright Chrome channel, headed
contexts (including verification), no off-screen positioning, and no external
CDP listener. Login retains AutomationControlled, password-store=basic and removal
of --enable-automation. Native Termux disables Chromium's Linux sandbox, as in
[termux-playwright's launch configuration](https://github.com/uno-km/termux-playwright);
desktop login keeps its existing sandbox setting. Profiles and leases remain intact.

Outside Termux, existing channel/headless behavior is preserved unless
CHROME_BINARY is explicitly set, in which case every launcher honors that binary.
An external executable is not compared to Playwright's bundled Chromium version;
keep the selected external browser consistent across login and generation.
CLI and MCP generation share this selection. An MCP server/worker on Termux must
inherit DISPLAY and CHROME_BINARY from its launching environment.

## Repeatable interactive E2E

From this source checkout, with the development test dependencies installed:

```bash
python -m pip install pytest pytest-asyncio pytest-bdd pillow
GFLOW_CLI_E2E_PROFILE=default GFLOW_CLI_E2E_TERMUX_LOGIN=1 \
  python -m pytest -m e2e -s -o addopts='' tests/e2e/test_termux_real_flow_bdd.py
```

This test calls the real CLI for manual login, session verification, and one image,
then validates the downloaded file. It skips outside Termux and never replaces
Google with a mock. It requires human sign-in; do not run it unattended or alongside
other commands using that profile. A skip is not a successful live verification.
