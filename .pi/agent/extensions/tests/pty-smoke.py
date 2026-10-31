"""Exercise Pi's real regular/fullscreen UIs without model calls or user settings."""
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

extensions = Path(__file__).resolve().parent.parent
install = Path.home() / ".pi/agent/install"
package = Path(os.environ["PI_TEST_PACKAGE_ROOT"]) if "PI_TEST_PACKAGE_ROOT" in os.environ else (
    install / "releases" / (install / "current-version").read_text().strip()
    / "node_modules/@earendil-works/pi-coding-agent"
)
version = json.loads((package / "package.json").read_text())["version"]

for mode in ("regular", "fullscreen"):
    with tempfile.TemporaryDirectory(prefix="pi-pty-test-") as directory:
        root = Path(directory)
        agent = root / "agent"
        agent.mkdir()
        (agent / "settings.json").write_text(json.dumps({"quietStartup": True, "theme": "dark"}))
        result = root / "result"
        env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE="1",
                   PI_SKIP_VERSION_CHECK="1", PI_TELEMETRY="0", TERM="xterm-256color",
                   PI_SMOKE_RESULT=str(result))
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 100, 0, 0))
        proc = subprocess.Popen([
            "node", str(package / "dist/cli.js"), "--no-session", "--no-extensions",
            "--no-skills", "--no-prompt-templates", "--no-themes", "--tui-mode", mode,
            "--extension", str(extensions / "custom-footer.ts"),
            "--extension", str(extensions / "plan-mode/index.ts"),
            "--extension", str(extensions / "code-review.ts"),
            "--extension", str(extensions / "tests/terminal-fixture.ts"),
        ], stdin=slave, stdout=slave, stderr=slave, cwd=root, env=env, start_new_session=True)
        os.close(slave)
        output = bytearray()

        def drain(seconds=0.2):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.05)[0]:
                    try:
                        chunk = os.read(master, 65536)
                    except OSError:
                        return
                    if not chunk:
                        return
                    output.extend(chunk)

        def wait_for(text):
            deadline = time.monotonic() + 20
            start = len(output)
            while text.encode() not in output[start:]:
                if proc.poll() is not None or time.monotonic() > deadline:
                    raise AssertionError(f"{mode}: did not see {text!r}: {bytes(output[-4000:])!r}")
                drain()

        try:
            # Startup probes terminal capabilities before installing the input handler.
            drain(3)
            os.write(master, b"/smoke\r")
            wait_for("SMOKE_TARGET")
            os.write(master, b"\x1b[B")
            drain()
            os.write(master, b"\r")
            wait_for("SMOKE_CUSTOM")
            os.write(master, b"\r")
            drain()
            fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 60, 0, 0))
            os.killpg(proc.pid, signal.SIGWINCH)
            drain()
            os.write(master, b"terminal answer")
            drain()
            os.write(master, b"\r")
            deadline = time.monotonic() + 20
            while proc.poll() is None and time.monotonic() < deadline:
                drain()
            assert result.exists() and result.read_text() == "passed\n", (
                f"{mode}: questionnaire did not complete: {bytes(output[-4000:])!r}"
            )
            assert proc.wait(timeout=5) == 0
            assert b"Failed to load extension" not in output
            print(f"PASS: Pi {version} {mode}: selection, custom answer, resize, shutdown")
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=5)
            os.close(master)
