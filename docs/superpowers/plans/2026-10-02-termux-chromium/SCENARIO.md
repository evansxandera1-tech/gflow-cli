# Scenario: Termux Chromium

Active dimensions: D1 profile reuse, D2 stealth preservation, D5 leases, D7 clear
configuration errors, D8 platform paths, D10 display/headed launch, D11 overrides,
D12 actual browser identity, D13 CLI/MCP shared launch. D3 selectors, D4 batches,
D6 database and D9 wire schemas are unchanged.

| Scenario | Severity | Evidence required |
| --- | --- | --- |
| Termux PREFIX chooses its native binary before desktop PATH | High | Offline test |
| CHROME_BINARY overrides discovery on any platform | High | Offline test |
| Missing Termux binary cannot fall back to bundled Chrome | High | Offline test |
| Missing/blank DISPLAY provides X11 recovery commands | High | Offline test |
| Login, verification, cookie fallback and both generation contexts agree | High | Integration tests |
| Cookie reader still requires a chrome strategy marker | Critical | Integration test |
| Desktop channel and profile downgrade behavior stays intact | Critical | Existing regression suite |
| Human login persists a session and one real image downloads on Android | High | Device E2E |

```gherkin
Scenario: Select native Chromium consistently
  Given a Termux PREFIX and DISPLAY and installed native Chromium
  When login or generation prepares a persistent browser context
  Then executable_path identifies native Chromium without a Chrome channel
  And the context is headed and retains the same gflow profile directory
```

Known issues: the /about identity-recheck condition remains handled by the existing
login flow. The tested Playwright range remains 1.61.x. No new selector, host
capability assumption, CDP listener or token-handling behavior is introduced.
