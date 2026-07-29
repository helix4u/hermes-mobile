#!/usr/bin/env python3
"""Cross-platform Hermes Mobile host installation and lifecycle manager.

The network and credential model intentionally matches the original Windows
installer:

* ``hermes serve`` listens only on 127.0.0.1:9129.
* ``mobile_proxy.py`` listens only on 127.0.0.1:9130, validates the tailnet
  hostname, and rewrites the upstream Host header.
* Tailscale Serve publishes the proxy over tailnet-only HTTPS.
* A random 384-bit bearer credential is stored outside the repository with
  current-user-only permissions.

Windows keeps using the checked-in PowerShell Scheduled Task implementation.
macOS uses a per-user launchd agent. Linux uses a per-user systemd service.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import plistlib
import secrets
import shlex
import shutil
import signal
import socket
import stat
import subprocess
import sys
import time
from typing import Any, Callable, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BACKEND_PORT = 9129
PROXY_PORT = 9130
LAUNCHD_LABEL = "dev.hermes.mobile-server"
SYSTEMD_UNIT = "hermes-mobile-server.service"
WINDOWS_TASK = "Hermes_Mobile_Server"
MIN_TOKEN_LENGTH = 43
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLUGIN_SOURCE = PROJECT_ROOT / "server-plugin"
PROXY_SCRIPT = PROJECT_ROOT / "scripts" / "mobile_proxy.py"


class HostInstallError(RuntimeError):
    """An actionable host-install failure."""


def default_hermes_home() -> Path:
    configured = os.environ.get("HERMES_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA")
        if not local_app_data:
            raise HostInstallError("LOCALAPPDATA is unavailable")
        return Path(local_app_data) / "hermes"
    return Path.home() / ".hermes"


def state_paths(hermes_home: Path) -> dict[str, Path]:
    state_dir = hermes_home / "mobile-server"
    return {
        "dir": state_dir,
        "token": state_dir / "session-token",
        "launcher_stdout": state_dir / "launcher.stdout.log",
        "launcher_stderr": state_dir / "launcher.stderr.log",
        "server_stdout": state_dir / "server.stdout.log",
        "server_stderr": state_dir / "server.stderr.log",
        "proxy_stdout": state_dir / "proxy.stdout.log",
        "proxy_stderr": state_dir / "proxy.stderr.log",
    }


def run_checked(
    args: Sequence[str | os.PathLike[str]],
    *,
    capture_output: bool = False,
    check: bool = True,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [os.fspath(value) for value in args],
        check=check,
        capture_output=capture_output,
        text=True,
        env=env,
    )


def locate_hermes(hermes_home: Path, explicit: str = "") -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    if os.name == "nt":
        candidates.append(hermes_home / "hermes-agent" / "venv" / "Scripts" / "hermes.exe")
    else:
        candidates.extend(
            [
                hermes_home / "hermes-agent" / "venv" / "bin" / "hermes",
                hermes_home / "hermes-agent" / ".venv" / "bin" / "hermes",
            ]
        )
    discovered = shutil.which("hermes")
    if discovered:
        candidates.append(Path(discovered))

    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            # Preserve the installation-facing path. Entry-point shims may be
            # symlinks into a standalone Python runtime; resolving the shim
            # would make ``hermes_python()`` select that runtime instead of the
            # dependency-complete sibling interpreter in Hermes's venv.
            return candidate.expanduser().absolute()
    raise HostInstallError(
        "Hermes executable not found. Pass --hermes-executable or install Hermes under "
        f"{hermes_home / 'hermes-agent'}."
    )


def hermes_python(hermes_executable: Path) -> Path:
    name = "python.exe" if os.name == "nt" else "python"
    candidate = hermes_executable.parent / name
    if not candidate.is_file():
        raise HostInstallError(f"Hermes Python executable not found: {candidate}")
    # Like the Hermes entry point, the venv's interpreter may itself be a
    # symlink. Invoking the venv-facing path is what activates its pyvenv.cfg
    # and site-packages; resolving it would silently drop Hermes dependencies.
    return candidate.absolute()


def locate_tailscale() -> Path:
    discovered = shutil.which("tailscale.exe" if os.name == "nt" else "tailscale")
    candidates = [Path(discovered)] if discovered else []
    if sys.platform == "darwin":
        candidates.append(Path("/Applications/Tailscale.app/Contents/MacOS/Tailscale"))
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate.resolve()
    raise HostInstallError("Tailscale CLI not found")


def tailscale_identity(
    tailscale: Path,
    runner: Callable[..., subprocess.CompletedProcess[str]] = run_checked,
) -> tuple[str, str]:
    result = runner([tailscale, "status", "--json"], capture_output=True)
    try:
        payload = json.loads(result.stdout)
        self_status = payload["Self"]
        dns_name = str(self_status["DNSName"]).rstrip(".")
        ip_address = str(self_status["TailscaleIPs"][0])
        online = bool(self_status["Online"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise HostInstallError("Tailscale status did not contain a usable node identity") from exc
    if not online or not dns_name:
        raise HostInstallError("Tailscale is not online or has no MagicDNS name")
    return dns_name, ip_address


def secure_state_directory(hermes_home: Path) -> Path:
    paths = state_paths(hermes_home)
    if paths["dir"].is_symlink():
        raise HostInstallError(f"Refusing to use symlinked state directory: {paths['dir']}")
    paths["dir"].mkdir(parents=True, exist_ok=True)
    if not paths["dir"].is_dir():
        raise HostInstallError(f"State path is not a directory: {paths['dir']}")
    if os.name != "nt":
        paths["dir"].chmod(0o700)
    return paths["dir"]


def ensure_token(hermes_home: Path) -> Path:
    secure_state_directory(hermes_home)
    token_path = state_paths(hermes_home)["token"]
    if token_path.is_symlink():
        raise HostInstallError(f"Refusing to use symlinked credential: {token_path}")
    if token_path.exists() and not token_path.is_file():
        raise HostInstallError(f"Credential path is not a regular file: {token_path}")
    if not token_path.exists():
        token = secrets.token_urlsafe(48)
        if os.name == "nt":
            token_path.write_text(token, encoding="utf-8")
        else:
            descriptor = os.open(
                token_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(token)
    if os.name != "nt":
        token_path.chmod(0o600)
        mode = stat.S_IMODE(token_path.stat().st_mode)
        if mode != 0o600:
            raise HostInstallError(f"Credential permissions are not 0600: {token_path}")
    token = token_path.read_text(encoding="utf-8").strip()
    if len(token) < MIN_TOKEN_LENGTH:
        raise HostInstallError("The Hermes Mobile credential is missing or too short")
    return token_path


def ensure_plugin_link(hermes_home: Path, hermes_executable: Path) -> Path:
    if os.name == "nt":
        powershell = shutil.which("pwsh.exe") or shutil.which("powershell.exe")
        if not powershell:
            raise HostInstallError("PowerShell is required to create the Windows plugin junction")
        run_checked(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                PROJECT_ROOT / "scripts" / "link-plugin.ps1",
                "-HermesHome",
                hermes_home,
                "-HermesExecutable",
                hermes_executable,
            ]
        )
        return hermes_home / "plugins" / "hermes-mobile"

    plugins_dir = hermes_home / "plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    target = plugins_dir / "hermes-mobile"
    source = PLUGIN_SOURCE.resolve()
    if target.is_symlink():
        if target.resolve() != source:
            raise HostInstallError(f"Refusing to replace unrelated plugin link: {target}")
    elif target.exists():
        raise HostInstallError(f"Refusing to replace existing plugin path: {target}")
    else:
        target.symlink_to(source, target_is_directory=True)

    run_checked(
        [
            hermes_executable,
            "plugins",
            "enable",
            "--no-allow-tool-override",
            "hermes-mobile",
        ]
    )
    return target


def launchd_payload(
    *,
    python_executable: Path,
    hermes_home: Path,
    hermes_executable: Path,
    tailnet_host: str,
) -> dict[str, Any]:
    paths = state_paths(hermes_home)
    return {
        "Label": LAUNCHD_LABEL,
        "ProgramArguments": [
            os.fspath(python_executable),
            os.fspath(Path(__file__).resolve()),
            "run",
            "--hermes-home",
            os.fspath(hermes_home),
            "--hermes-executable",
            os.fspath(hermes_executable),
            "--tailnet-host",
            tailnet_host,
        ],
        "WorkingDirectory": os.fspath(PROJECT_ROOT),
        "RunAtLoad": True,
        "KeepAlive": True,
        "ProcessType": "Background",
        "ThrottleInterval": 5,
        "StandardOutPath": os.fspath(paths["launcher_stdout"]),
        "StandardErrorPath": os.fspath(paths["launcher_stderr"]),
    }


def reload_launchd_agent(
    plist_path: Path,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = run_checked,
    sleeper: Callable[[float], None] = time.sleep,
) -> None:
    """Replace a per-user launchd job, tolerating bootout's async teardown.

    launchd may report the old label as absent slightly before it releases the
    job registration internally. An immediate bootstrap then fails with EIO.
    Bounded retries make refresh idempotent without killing unrelated
    processes or escalating to root.
    """

    domain = f"gui/{os.getuid()}"
    service = f"{domain}/{LAUNCHD_LABEL}"
    runner(
        ["launchctl", "bootout", service],
        capture_output=True,
        check=False,
    )

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        state = runner(
            ["launchctl", "print", service],
            capture_output=True,
            check=False,
        )
        if state.returncode != 0:
            break
        sleeper(0.2)

    last_error = ""
    for _attempt in range(10):
        result = runner(
            ["launchctl", "bootstrap", domain, plist_path],
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            break
        last_error = (result.stderr or result.stdout or "").strip()
        sleeper(0.5)
    else:
        raise HostInstallError(
            f"Could not bootstrap launchd agent {plist_path}: "
            f"{last_error or 'launchctl returned an error'}"
        )

    runner(["launchctl", "enable", service])
    runner(["launchctl", "kickstart", "-k", service])


def systemd_unit_text(
    *,
    python_executable: Path,
    hermes_home: Path,
    hermes_executable: Path,
    tailnet_host: str,
) -> str:
    command = [
        python_executable,
        Path(__file__).resolve(),
        "run",
        "--hermes-home",
        hermes_home,
        "--hermes-executable",
        hermes_executable,
        "--tailnet-host",
        tailnet_host,
    ]
    exec_start = " ".join(shlex.quote(os.fspath(value)) for value in command)
    return "\n".join(
        [
            "[Unit]",
            "Description=Persistent loopback Hermes backend for Hermes Mobile",
            "After=network-online.target",
            "Wants=network-online.target",
            "",
            "[Service]",
            "Type=simple",
            f"ExecStart={exec_start}",
            f"WorkingDirectory={shlex.quote(os.fspath(PROJECT_ROOT))}",
            "Restart=always",
            "RestartSec=5",
            "",
            "[Install]",
            "WantedBy=default.target",
            "",
            "# X-Hermes-Mobile=true",
        ]
    )


def install_launchd(
    *,
    python_executable: Path,
    hermes_home: Path,
    hermes_executable: Path,
    tailnet_host: str,
) -> Path:
    agents_dir = Path.home() / "Library" / "LaunchAgents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    plist_path = agents_dir / f"{LAUNCHD_LABEL}.plist"
    payload = launchd_payload(
        python_executable=python_executable,
        hermes_home=hermes_home,
        hermes_executable=hermes_executable,
        tailnet_host=tailnet_host,
    )
    if plist_path.exists():
        try:
            existing = plistlib.loads(plist_path.read_bytes())
        except Exception as exc:
            raise HostInstallError(f"Refusing to replace unreadable launchd agent: {plist_path}") from exc
        arguments = existing.get("ProgramArguments", [])
        if LAUNCHD_LABEL != existing.get("Label") or os.fspath(Path(__file__).resolve()) not in arguments:
            raise HostInstallError(f"Refusing to replace unrelated launchd agent: {plist_path}")

    temporary = plist_path.with_suffix(".plist.tmp")
    temporary.write_bytes(plistlib.dumps(payload, sort_keys=False))
    temporary.chmod(0o600)
    temporary.replace(plist_path)

    reload_launchd_agent(plist_path)
    return plist_path


def install_systemd(
    *,
    python_executable: Path,
    hermes_home: Path,
    hermes_executable: Path,
    tailnet_host: str,
) -> Path:
    units_dir = Path.home() / ".config" / "systemd" / "user"
    units_dir.mkdir(parents=True, exist_ok=True)
    unit_path = units_dir / SYSTEMD_UNIT
    if unit_path.exists() and "# X-Hermes-Mobile=true" not in unit_path.read_text(
        encoding="utf-8"
    ):
        raise HostInstallError(f"Refusing to replace unrelated systemd unit: {unit_path}")
    unit_path.write_text(
        systemd_unit_text(
            python_executable=python_executable,
            hermes_home=hermes_home,
            hermes_executable=hermes_executable,
            tailnet_host=tailnet_host,
        ),
        encoding="utf-8",
    )
    run_checked(["systemctl", "--user", "daemon-reload"])
    run_checked(["systemctl", "--user", "enable", "--now", SYSTEMD_UNIT])
    run_checked(["systemctl", "--user", "restart", SYSTEMD_UNIT])
    return unit_path


def install_windows(hermes_home: Path, hermes_executable: Path) -> None:
    powershell = shutil.which("pwsh.exe") or shutil.which("powershell.exe")
    if not powershell:
        raise HostInstallError("PowerShell is required for the Windows host installer")
    run_checked(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            PROJECT_ROOT / "scripts" / "install-mobile-server.ps1",
            "-HermesHome",
            hermes_home,
            "-HermesExecutable",
            hermes_executable,
        ],
    )


def port_is_listening(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def request_json(url: str, token: str) -> dict[str, Any]:
    request = Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise HostInstallError(f"{url} returned HTTP {exc.code}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HostInstallError(f"Could not read {url}: {exc}") from exc


def wait_until_ready(hermes_home: Path, timeout_seconds: float = 60) -> dict[str, Any]:
    token = state_paths(hermes_home)["token"].read_text(encoding="utf-8").strip()
    deadline = time.monotonic() + timeout_seconds
    last_error = "listeners have not started"
    while time.monotonic() < deadline:
        if port_is_listening(BACKEND_PORT) and port_is_listening(PROXY_PORT):
            try:
                return request_json(
                    f"http://127.0.0.1:{BACKEND_PORT}/api/plugins/hermes-mobile/v1/health",
                    token,
                )
            except HostInstallError as exc:
                last_error = str(exc)
        time.sleep(0.5)
    raise HostInstallError(f"Hermes Mobile host did not become ready: {last_error}")


def configure_tailscale_serve(tailscale: Path) -> None:
    status = run_checked(
        [tailscale, "serve", "status", "--json"],
        capture_output=True,
        check=False,
    )
    existing = status.stdout.strip()
    if existing:
        try:
            payload = json.loads(existing)
        except json.JSONDecodeError as exc:
            raise HostInstallError("Could not parse the existing Tailscale Serve configuration") from exc
        if payload and str(PROXY_PORT) not in json.dumps(payload, sort_keys=True):
            raise HostInstallError(
                "Tailscale Serve already has unrelated configuration; refusing to replace it"
            )
    run_checked([tailscale, "serve", "--bg", "--yes", str(PROXY_PORT)])


def service_state() -> str:
    if sys.platform == "darwin":
        result = run_checked(
            ["launchctl", "print", f"gui/{os.getuid()}/{LAUNCHD_LABEL}"],
            capture_output=True,
            check=False,
        )
        return "running" if result.returncode == 0 and "state = running" in result.stdout else "stopped"
    if sys.platform.startswith("linux"):
        result = run_checked(
            ["systemctl", "--user", "is-active", SYSTEMD_UNIT],
            capture_output=True,
            check=False,
        )
        return result.stdout.strip() or "stopped"
    if os.name == "nt":
        result = run_checked(
            [
                "powershell.exe",
                "-NoProfile",
                "-Command",
                f"(Get-ScheduledTask -TaskName '{WINDOWS_TASK}').State",
            ],
            capture_output=True,
            check=False,
        )
        return result.stdout.strip().lower() or "stopped"
    return "unsupported"


def inspect_host(hermes_home: Path, tailscale: Path) -> dict[str, Any]:
    token_path = state_paths(hermes_home)["token"]
    if not token_path.exists():
        raise HostInstallError(f"Hermes Mobile credential does not exist: {token_path}")
    token = token_path.read_text(encoding="utf-8").strip()
    health = request_json(
        f"http://127.0.0.1:{BACKEND_PORT}/api/plugins/hermes-mobile/v1/health",
        token,
    )
    capabilities = request_json(
        f"http://127.0.0.1:{BACKEND_PORT}/api/plugins/hermes-mobile/v1/capabilities",
        token,
    )
    serve_result = run_checked(
        [tailscale, "serve", "status", "--json"],
        capture_output=True,
        check=False,
    )
    try:
        serve_payload = json.loads(serve_result.stdout or "{}")
    except json.JSONDecodeError:
        serve_payload = {}
    dns_name, ip_address = tailscale_identity(tailscale)
    return {
        "service": service_state(),
        "backend": f"127.0.0.1:{BACKEND_PORT}",
        "backend_listening": port_is_listening(BACKEND_PORT),
        "proxy": f"127.0.0.1:{PROXY_PORT}",
        "proxy_listening": port_is_listening(PROXY_PORT),
        "health": health.get("status"),
        "compatibility": capabilities.get("status"),
        "contract_version": capabilities.get("contract_version"),
        "tailscale_serve_configured": bool(serve_payload),
        "address": f"https://{dns_name}",
        "tailscale_ip": ip_address,
    }


def run_forever(
    *,
    hermes_home: Path,
    hermes_executable: Path,
    tailnet_host: str,
) -> None:
    paths = state_paths(hermes_home)
    token_path = ensure_token(hermes_home)
    token = token_path.read_text(encoding="utf-8").strip()
    python_executable = hermes_python(hermes_executable)
    stopping = False
    children: list[subprocess.Popen[bytes]] = []

    def stop_children() -> None:
        for child in children:
            if child.poll() is None:
                child.terminate()
        deadline = time.monotonic() + 5
        for child in children:
            remaining = max(0.0, deadline - time.monotonic())
            try:
                child.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                child.kill()
        children.clear()

    def handle_signal(_signum: int, _frame: Any) -> None:
        nonlocal stopping
        stopping = True
        stop_children()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    while not stopping:
        server_env = {**os.environ, "HERMES_DASHBOARD_SESSION_TOKEN": token}
        with (
            paths["server_stdout"].open("ab") as server_stdout,
            paths["server_stderr"].open("ab") as server_stderr,
            paths["proxy_stdout"].open("ab") as proxy_stdout,
            paths["proxy_stderr"].open("ab") as proxy_stderr,
        ):
            children.extend(
                [
                    subprocess.Popen(
                        [
                            hermes_executable,
                            "serve",
                            "--host",
                            "127.0.0.1",
                            "--port",
                            str(BACKEND_PORT),
                        ],
                        cwd=PROJECT_ROOT,
                        env=server_env,
                        stdout=server_stdout,
                        stderr=server_stderr,
                    ),
                    subprocess.Popen(
                        [
                            python_executable,
                            PROXY_SCRIPT,
                            "--host",
                            "127.0.0.1",
                            "--port",
                            str(PROXY_PORT),
                            "--upstream",
                            f"http://127.0.0.1:{BACKEND_PORT}",
                            "--allowed-host",
                            tailnet_host,
                        ],
                        cwd=PROJECT_ROOT,
                        stdout=proxy_stdout,
                        stderr=proxy_stderr,
                    ),
                ]
            )

            while not stopping and all(child.poll() is None for child in children):
                time.sleep(1)
            stop_children()
        if not stopping:
            time.sleep(5)


def uninstall_service() -> None:
    if sys.platform == "darwin":
        plist_path = Path.home() / "Library" / "LaunchAgents" / f"{LAUNCHD_LABEL}.plist"
        if plist_path.exists():
            existing = plistlib.loads(plist_path.read_bytes())
            if os.fspath(Path(__file__).resolve()) not in existing.get("ProgramArguments", []):
                raise HostInstallError(f"Refusing to remove unrelated launchd agent: {plist_path}")
            run_checked(
                ["launchctl", "bootout", f"gui/{os.getuid()}/{LAUNCHD_LABEL}"],
                check=False,
            )
            plist_path.unlink()
    elif sys.platform.startswith("linux"):
        unit_path = Path.home() / ".config" / "systemd" / "user" / SYSTEMD_UNIT
        if unit_path.exists():
            if "# X-Hermes-Mobile=true" not in unit_path.read_text(encoding="utf-8"):
                raise HostInstallError(f"Refusing to remove unrelated systemd unit: {unit_path}")
            run_checked(["systemctl", "--user", "disable", "--now", SYSTEMD_UNIT], check=False)
            unit_path.unlink()
            run_checked(["systemctl", "--user", "daemon-reload"])
    elif os.name == "nt":
        raise HostInstallError(
            "Use Windows Task Scheduler to remove Hermes_Mobile_Server; "
            "automatic Windows uninstall is not yet provided."
        )
    else:
        raise HostInstallError(f"Unsupported platform: {sys.platform}")


def install(args: argparse.Namespace) -> None:
    hermes_home = Path(args.hermes_home).expanduser().resolve()
    hermes_executable = locate_hermes(hermes_home, args.hermes_executable)
    tailscale = locate_tailscale()
    tailnet_host, _ip_address = tailscale_identity(tailscale)
    ensure_plugin_link(hermes_home, hermes_executable)

    if os.name == "nt":
        # The PowerShell runner creates the token with a Windows
        # current-user-only ACL. Do not pre-create it through the generic path,
        # or the runner would correctly preserve the file but never get the
        # chance to apply its ACL.
        install_windows(hermes_home, hermes_executable)
    elif sys.platform == "darwin":
        ensure_token(hermes_home)
        install_launchd(
            python_executable=hermes_python(hermes_executable),
            hermes_home=hermes_home,
            hermes_executable=hermes_executable,
            tailnet_host=tailnet_host,
        )
    elif sys.platform.startswith("linux"):
        ensure_token(hermes_home)
        install_systemd(
            python_executable=hermes_python(hermes_executable),
            hermes_home=hermes_home,
            hermes_executable=hermes_executable,
            tailnet_host=tailnet_host,
        )
    else:
        raise HostInstallError(f"Unsupported platform: {sys.platform}")

    wait_until_ready(hermes_home)
    configure_tailscale_serve(tailscale)
    report = inspect_host(hermes_home, tailscale)
    print(json.dumps(report, indent=2, sort_keys=True))
    print("Credential was not printed. Use `mobile_host.py show --reveal-token` locally.")


def show(args: argparse.Namespace) -> None:
    hermes_home = Path(args.hermes_home).expanduser().resolve()
    tailscale = locate_tailscale()
    dns_name, ip_address = tailscale_identity(tailscale)
    token_path = state_paths(hermes_home)["token"]
    if not token_path.exists():
        raise HostInstallError("Hermes Mobile credential has not been created")
    print(f"Address: https://{dns_name}")
    print(f"Tailscale IP: {ip_address}")
    if args.reveal_token:
        print(f"Token: {token_path.read_text(encoding='utf-8').strip()}")
    else:
        print(f"Token: stored at {token_path}")
        print("Rerun with --reveal-token only while entering it on the phone.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument(
            "--hermes-home",
            default=os.fspath(default_hermes_home()),
        )
        subparser.add_argument("--hermes-executable", default="")

    install_parser = subparsers.add_parser("install", help="Install or refresh the host service")
    add_common(install_parser)

    run_parser = subparsers.add_parser("run", help="Run the supervised loopback services")
    add_common(run_parser)
    run_parser.add_argument("--tailnet-host", required=True)

    status_parser = subparsers.add_parser("status", help="Verify the live host without printing its token")
    add_common(status_parser)

    show_parser = subparsers.add_parser("show", help="Show connection fields")
    add_common(show_parser)
    show_parser.add_argument("--reveal-token", action="store_true")

    uninstall_parser = subparsers.add_parser("uninstall", help="Remove the native service definition")
    add_common(uninstall_parser)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "install":
            install(args)
        elif args.command == "run":
            run_forever(
                hermes_home=Path(args.hermes_home).expanduser().resolve(),
                hermes_executable=locate_hermes(
                    Path(args.hermes_home).expanduser().resolve(),
                    args.hermes_executable,
                ),
                tailnet_host=args.tailnet_host,
            )
        elif args.command == "status":
            report = inspect_host(
                Path(args.hermes_home).expanduser().resolve(),
                locate_tailscale(),
            )
            print(json.dumps(report, indent=2, sort_keys=True))
        elif args.command == "show":
            show(args)
        elif args.command == "uninstall":
            uninstall_service()
        return 0
    except (HostInstallError, OSError, subprocess.CalledProcessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
