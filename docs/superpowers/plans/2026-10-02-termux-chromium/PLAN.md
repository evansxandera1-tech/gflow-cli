# Termux Chromium implementation plan

**Goal:** Run the existing persistent-browser login, verification and generation
paths with native Termux Chromium, without an external CDP port.

**Predict verdict:** CAUTION (6/10), static review across architecture, security,
Playwright, CLI/MCP/platform compatibility and simplicity. The shared resolver
belongs in browser_manager. Preserve profile leases and marker checks. All
launchers and bundled-engine guards must agree on the selected executable.
Android runtime verification is a separate gate from offline selection tests.

**Root cause:** browser_manager._find_chrome_binary has desktop-only candidates;
real_chrome.find_chrome_executable duplicates discovery without CHROME_BINARY;
RealChromeStrategy gates owned login on the Chrome channel, and both generation
launchers select by channel_for_profile. Verification and cookie fallback also
assume channel chrome. No Flow selector or server behavior claim is involved.

## Tasks

- [x] Read auth risks and trace all persistent-context callers.
- [x] Add failing tests for detection, discovery, override, display, login and generation.
- [x] Implement shared executable selection and adapt all persistent launch sites.
- [x] Preserve profile authorization and distinguish external from bundled engines.
- [x] Run focused existing and new tests, lint and strict types.
- [x] Document source installation, X11 and real one-image acceptance commands.
- [ ] Run Android login, verification and image E2E against real Google Flow.

No CLI options or queued payload fields change. CLI and MCP generation use the
same client; the MCP worker must inherit CHROME_BINARY and DISPLAY. Interactive
login remains CLI-only. No release, commit or remote PR is requested.

External live blocker: this workspace runs on Windows; the user's Android phone
and Google session are not connected to it. Offline tests cannot satisfy the
last task. Do not label Android/Google Flow support live-verified until that run.

## Verification (2026-10-02)

- Red before implementation: 11 failures, including native path discovery and
  owned-login selection, rather than a real Google response.
- Final focused suite: **573 passed, 1 skipped**, 81.48 seconds. Covers browser
  manager, Termux selection, auth, client, launch kwargs, all affected transports,
  E2E binding guard and MCP CLI parity/server tests. No full-suite coverage claim.
- Ruff check and format check across src/tests: clean.
- Pyright across src with `.venv/Scripts/python.exe`: zero errors/warnings.
- Hygiene, doc links, published-doc PII, mirror synchronization and council-memory
  checks: passed. Branch-prefix advisory only (Codex branch prefix).
- Built a local `gflow_cli-0.82.1-py3-none-any.whl` successfully.
- Interactive Android E2E invoked explicitly: **1 skipped**, named blocker is
  absence of physical Android/Termux on this Windows host. No real login or image
  is claimed. Next phase: run that device acceptance, then live verification.
- Independent static review traced all ten persistent-context launch sites;
  requested cookie-marker/verifier/standalone tests were added and passed.

Mirror sweep: no CLI/MCP parameters, payload fields, models or exit codes changed.
The existing ConfigurationError is used for display/binary configuration. The
shell-only environment exports are documented in .env.template and TERMUX.md;
README and CHANGELOG link to the guide. The existing published mirror is in sync.
