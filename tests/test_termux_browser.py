"""Browser selection regressions; these do not claim live Android verification."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from gflow_cli import browser_manager as bm
from gflow_cli.api.client import FlowApiClient
from gflow_cli.auth.factory import AuthStrategyFactory
from gflow_cli.auth.internal_chromium import login_launch_kwargs
from gflow_cli.auth.real_chrome import RealChromeStrategy
from gflow_cli.errors import ConfigurationError

PREFIX = "/data/data/com.termux/files/usr"
BINARY = PREFIX + "/lib/chromium/chrome"


@pytest.fixture
def termux(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PREFIX", PREFIX)
    monkeypatch.setenv("DISPLAY", ":1")
    monkeypatch.delenv("CHROME_BINARY", raising=False)
    monkeypatch.setattr(bm, "sys", SimpleNamespace(platform="linux"))


@pytest.mark.parametrize("platform", ["linux", "android"])
def test_termux_detection(termux: None, monkeypatch: pytest.MonkeyPatch, platform: str) -> None:
    monkeypatch.setattr(bm, "sys", SimpleNamespace(platform=platform))
    assert bm.is_termux()


@pytest.mark.parametrize("platform", ["win32", "darwin", "linux"])
def test_desktop_unchanged(monkeypatch: pytest.MonkeyPatch, platform: str) -> None:
    monkeypatch.setattr(bm, "sys", SimpleNamespace(platform=platform))
    monkeypatch.setenv("PREFIX", "/usr/local")
    monkeypatch.delenv("CHROME_BINARY", raising=False)
    assert not bm.is_termux()
    assert bm.browser_launch_options(channel="chrome", headless=True) == {
        "channel": "chrome",
        "headless": True,
    }


def test_termux_binary_precedes_path(termux: None) -> None:
    with (
        patch.object(Path, "is_file", return_value=True),
        patch.object(bm.shutil, "which") as which,
    ):
        assert bm.resolved_chrome_binary() == BINARY
        which.assert_not_called()


def test_override_wins(termux: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHROME_BINARY", "/custom/chrome")
    assert bm.resolved_chrome_binary() == "/custom/chrome"
    assert bm.browser_launch_options(channel="chrome", headless=False)["executable_path"] == (
        "/custom/chrome"
    )


def test_missing_termux_binary_never_uses_desktop(termux: None) -> None:
    with patch.object(Path, "is_file", return_value=False):
        with pytest.raises(ConfigurationError, match="Termux Chromium"):
            bm.browser_launch_options(channel="chrome", headless=False)


def test_missing_display(termux: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DISPLAY", "")
    with pytest.raises(ConfigurationError, match="DISPLAY") as exc:
        login_launch_kwargs(Path("profile"), False, channel="chrome")
    assert "termux-x11 :1" in str(exc.value.remediation_hint)
    assert "export DISPLAY=:1" in str(exc.value.remediation_hint)


def test_login_and_generation_share_termux_executable(termux: None, tmp_path: Path) -> None:
    (tmp_path / ".gflow_browser_strategy").write_text("chrome", encoding="utf-8")
    with patch.object(Path, "is_file", return_value=True):
        assert isinstance(AuthStrategyFactory().create("auto"), RealChromeStrategy)
        login = login_launch_kwargs(tmp_path, True, channel="chrome")
        client = FlowApiClient(profile_dir=tmp_path, headless=True)
        generation = client._persistent_context_kwargs()
        client._log_and_guard_launch(generation)
    for kwargs in (login, generation):
        assert kwargs["executable_path"] == BINARY
        assert "channel" not in kwargs
        assert kwargs["headless"] is False
        assert "--disable-blink-features=AutomationControlled" in kwargs["args"]
        assert "--password-store=basic" in kwargs["args"]
        assert "--enable-automation" in kwargs["ignore_default_args"]
        assert "--no-sandbox" not in kwargs["ignore_default_args"]
        assert not any(arg.startswith("--remote-debugging-port") for arg in kwargs["args"])
        assert not any(arg.startswith("--window-position") for arg in kwargs["args"])


@pytest.mark.asyncio
async def test_termux_login_uses_owned_browser(termux: None, tmp_path: Path) -> None:
    strategy = RealChromeStrategy()
    with (
        patch.object(Path, "is_file", return_value=True),
        patch("gflow_cli.auth.real_chrome._validate_profile_dir"),
        patch(
            "gflow_cli.auth.real_chrome.is_playwright_chrome_channel_available", return_value=False
        ),
        patch.object(strategy, "_login_owned_browser", AsyncMock(return_value=None)) as owned,
        patch.object(strategy, "_login_subprocess", AsyncMock()) as subprocess,
        patch.object(strategy, "_verify_and_record", AsyncMock()),
    ):
        await strategy.login(tmp_path, headless=False)
    owned.assert_awaited_once_with(tmp_path, False)
    subprocess.assert_not_awaited()


def test_desktop_override_selects_executable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PREFIX", "/usr")
    monkeypatch.setenv("CHROME_BINARY", "/custom/chrome")
    assert bm.browser_launch_options(channel="chrome", headless=True) == {
        "executable_path": "/custom/chrome",
        "headless": True,
    }


def test_external_executable_is_not_compared_to_bundled(tmp_path: Path) -> None:
    (tmp_path / "Last Version").write_text("999.0.0.0", encoding="utf-8")
    with patch.object(bm, "installed_chromium_version") as bundled:
        bm.ensure_profile_engine_compatible(tmp_path, None, executable_path=BINARY)
    bundled.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("surface", ["login", "cookies", "verify", "migrated", "standalone"])
async def test_termux_reaches_each_persistent_launcher(
    termux: None, tmp_path: Path, surface: str
) -> None:
    from gflow_cli.auth.cookies import _get_chrome_cookies_playwright
    from gflow_cli.auth.verification import _verify_migrated_host_fallback, verify_flow_session
    from tests.api.transports.test_ui_automation import _make_fake_context, _make_fake_playwright

    (tmp_path / ".gflow_browser_strategy").write_text("chrome", encoding="utf-8")
    ctx = _make_fake_context(pages=[])
    ctx.cookies = AsyncMock(return_value=[])
    cm, pw = _make_fake_playwright(ctx)
    # All probes may fail authentication; this test asserts browser selection,
    # not a synthetic Google session.
    with (
        patch.object(Path, "is_file", return_value=True),
        patch("gflow_cli.auth.strategies.async_playwright", return_value=cm),
        patch("gflow_cli.auth.verification._validate_profile_in_home"),
    ):
        if surface == "login":
            strategy = RealChromeStrategy()
            with patch.object(strategy, "_await_flow_session", AsyncMock()):
                await strategy._login_owned_browser(tmp_path, False)
        elif surface == "cookies":
            await _get_chrome_cookies_playwright(tmp_path)
        elif surface == "verify":
            await verify_flow_session(tmp_path)
        elif surface == "migrated":
            await _verify_migrated_host_fallback(tmp_path, source="test")
        else:
            from gflow_cli.api.transports.ui_automation import UiAutomationTransport

            transport = UiAutomationTransport()
            with patch("gflow_cli.api.transports.ui_automation.async_playwright", return_value=cm):
                try:
                    await transport.setup(tmp_path)
                finally:
                    await transport.teardown()
    pw.chromium.launch_persistent_context.assert_awaited_once()
    kwargs = pw.chromium.launch_persistent_context.call_args.kwargs
    assert kwargs["executable_path"] == BINARY
    assert "channel" not in kwargs
    assert kwargs["headless"] is False


@pytest.mark.asyncio
async def test_termux_cookie_reader_requires_marker(termux: None, tmp_path: Path) -> None:
    from gflow_cli.auth.cookies import _get_chrome_cookies_playwright
    from gflow_cli.errors import SecurityError

    with patch.object(Path, "is_file", return_value=True):
        with pytest.raises(SecurityError, match="marker missing"):
            await _get_chrome_cookies_playwright(tmp_path)


def test_termux_channel_is_never_chrome(termux: None, tmp_path: Path) -> None:
    (tmp_path / ".gflow_browser_strategy").write_text("chrome", encoding="utf-8")
    assert not bm.is_playwright_chrome_channel_available()
    assert bm.channel_for_profile(tmp_path) is None
