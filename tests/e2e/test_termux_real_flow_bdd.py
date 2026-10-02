"""Interactive device acceptance, never a mocked browser or recorded response.

Run with -m e2e -s, GFLOW_CLI_E2E_PROFILE=<name>, and
GFLOW_CLI_E2E_TERMUX_LOGIN=1. A human must complete the Google sign-in.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image
from pytest_bdd import given, scenarios, then, when

from gflow_cli.browser_manager import is_termux

scenarios("../features/termux_real_flow.feature")


@given("a Termux device explicitly enabled for interactive Flow acceptance")
def termux_device() -> None:
    if not is_termux():
        pytest.skip("Requires physical Android/Termux; this host cannot validate that runtime")
    if os.environ.get("GFLOW_CLI_E2E_TERMUX_LOGIN") != "1":
        pytest.skip("Set GFLOW_CLI_E2E_TERMUX_LOGIN=1 for manual sign-in and one real image")
    assert os.environ.get("DISPLAY"), "Start Termux:X11 and export DISPLAY=:1"


@when("the user completes gflow auth login in visible Chromium")
def manual_login(e2e_env: dict[str, str]) -> None:
    # Inherit terminal I/O so the human sees login instructions; -s is required.
    subprocess.run(
        [sys.executable, "-m", "gflow_cli", "auth", "login"],
        env=e2e_env,
        check=True,
        timeout=720,
    )


@then("gflow auth status verifies the saved session")
def verify_session(e2e_env: dict[str, str]) -> None:
    subprocess.run(
        [sys.executable, "-m", "gflow_cli", "auth", "status"],
        env=e2e_env,
        check=True,
        timeout=180,
    )


@then("gflow downloads one real image from Google Flow")
def generate_image(e2e_env: dict[str, str], tmp_path: Path) -> None:
    output = tmp_path / "termux-real-flow.png"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "gflow_cli",
            "image",
            "t2i",
            "A red ceramic cup on a white table, natural daylight",
            "--model",
            "nano2",
            "--count",
            "1",
            "--output",
            str(output),
        ],
        env=e2e_env,
        check=True,
        timeout=600,
    )
    assert output.is_file()
    with Image.open(output) as image:
        assert image.width > 0 and image.height > 0
        image.verify()
