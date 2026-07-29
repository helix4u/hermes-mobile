from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "mobile_host.py"
SPEC = importlib.util.spec_from_file_location("hermes_mobile_host_script", SCRIPT_PATH)
assert SPEC and SPEC.loader
mobile_host = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mobile_host)


class MobileHostTests(unittest.TestCase):
    def test_tailscale_identity_normalizes_dns_and_selects_ipv4(self) -> None:
        runner = Mock()
        runner.return_value.stdout = json.dumps(
            {
                "Self": {
                    "DNSName": "mac.tail.example.ts.net.",
                    "Online": True,
                    "TailscaleIPs": ["100.64.0.9", "fd7a::9"],
                }
            }
        )

        dns_name, ip_address = mobile_host.tailscale_identity(
            Path("/opt/tailscale"),
            runner=runner,
        )

        self.assertEqual(dns_name, "mac.tail.example.ts.net")
        self.assertEqual(ip_address, "100.64.0.9")

    @unittest.skipIf(os.name == "nt", "POSIX permission contract")
    def test_token_is_stable_and_current_user_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            hermes_home = Path(directory)

            first = mobile_host.ensure_token(hermes_home)
            first_value = first.read_text(encoding="utf-8")
            second = mobile_host.ensure_token(hermes_home)

            self.assertEqual(first, second)
            self.assertEqual(first_value, second.read_text(encoding="utf-8"))
            self.assertGreaterEqual(len(first_value), mobile_host.MIN_TOKEN_LENGTH)
            self.assertEqual(stat.S_IMODE(first.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(first.parent.stat().st_mode), 0o700)

    @unittest.skipIf(os.name == "nt", "POSIX symlink credential contract")
    def test_token_refuses_a_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            hermes_home = Path(directory)
            state_dir = hermes_home / "mobile-server"
            state_dir.mkdir()
            unrelated = hermes_home / "unrelated"
            unrelated.write_text("do not read", encoding="utf-8")
            (state_dir / "session-token").symlink_to(unrelated)

            with self.assertRaises(mobile_host.HostInstallError):
                mobile_host.ensure_token(hermes_home)

    def test_launchd_payload_runs_the_checked_in_manager(self) -> None:
        payload = mobile_host.launchd_payload(
            python_executable=Path("/venv/bin/python"),
            hermes_home=Path("/home/me/.hermes"),
            hermes_executable=Path("/venv/bin/hermes"),
            tailnet_host="mac.tail.example.ts.net",
        )

        self.assertEqual(payload["Label"], mobile_host.LAUNCHD_LABEL)
        self.assertTrue(payload["RunAtLoad"])
        self.assertTrue(payload["KeepAlive"])
        self.assertIn(str(SCRIPT_PATH), payload["ProgramArguments"])
        self.assertIn("mac.tail.example.ts.net", payload["ProgramArguments"])

    def test_launchd_refresh_retries_transient_bootstrap_eio(self) -> None:
        calls: list[list[str]] = []
        bootstrap_attempts = 0

        def runner(args, **_kwargs):
            nonlocal bootstrap_attempts
            command = [os.fspath(value) for value in args]
            calls.append(command)
            if command[1] == "print":
                return subprocess.CompletedProcess(command, 3, "", "not found")
            if command[1] == "bootstrap":
                bootstrap_attempts += 1
                if bootstrap_attempts == 1:
                    return subprocess.CompletedProcess(command, 5, "", "Input/output error")
            return subprocess.CompletedProcess(command, 0, "", "")

        sleeps: list[float] = []
        mobile_host.reload_launchd_agent(
            Path("/tmp/dev.hermes.mobile-server.plist"),
            runner=runner,
            sleeper=sleeps.append,
            uid=501,
        )

        self.assertEqual(bootstrap_attempts, 2)
        self.assertEqual(sleeps, [0.5])
        self.assertTrue(any(command[2] == "gui/501" for command in calls if command[1] == "bootstrap"))
        self.assertTrue(any(command[1] == "kickstart" for command in calls))

    def test_systemd_unit_is_marked_and_restarts(self) -> None:
        unit = mobile_host.systemd_unit_text(
            python_executable=Path("/venv/bin/python"),
            hermes_home=Path("/home/me/.hermes"),
            hermes_executable=Path("/venv/bin/hermes"),
            tailnet_host="linux.tail.example.ts.net",
        )

        self.assertIn("Restart=always", unit)
        self.assertIn("WantedBy=default.target", unit)
        self.assertIn("# X-Hermes-Mobile=true", unit)
        self.assertIn("linux.tail.example.ts.net", unit)

    @unittest.skipIf(os.name == "nt", "POSIX entry-point symlink contract")
    def test_locate_hermes_preserves_the_venv_facing_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            hermes_home = Path(directory)
            venv_bin = hermes_home / "hermes-agent" / "venv" / "bin"
            runtime_bin = hermes_home / "runtime" / "bin"
            venv_bin.mkdir(parents=True)
            runtime_bin.mkdir(parents=True)
            runtime_entrypoint = runtime_bin / "hermes"
            runtime_entrypoint.write_text("#!/bin/sh\n", encoding="utf-8")
            runtime_entrypoint.chmod(0o755)
            (venv_bin / "hermes").symlink_to(runtime_entrypoint)

            located = mobile_host.locate_hermes(hermes_home)

            self.assertEqual(located, venv_bin / "hermes")

    @unittest.skipIf(os.name == "nt", "POSIX venv interpreter symlink contract")
    def test_hermes_python_preserves_the_venv_facing_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            venv_bin = Path(directory) / "venv" / "bin"
            runtime_bin = Path(directory) / "runtime" / "bin"
            venv_bin.mkdir(parents=True)
            runtime_bin.mkdir(parents=True)
            runtime_python = runtime_bin / "python3"
            runtime_python.write_text("", encoding="utf-8")
            (venv_bin / "python").symlink_to(runtime_python)
            hermes = venv_bin / "hermes"
            hermes.write_text("", encoding="utf-8")

            self.assertEqual(mobile_host.hermes_python(hermes), venv_bin / "python")

    @unittest.skipIf(os.name == "nt", "POSIX symlink contract")
    def test_plugin_link_refuses_an_unrelated_existing_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            hermes_home = Path(directory)
            target = hermes_home / "plugins" / "hermes-mobile"
            target.mkdir(parents=True)

            with self.assertRaises(mobile_host.HostInstallError):
                mobile_host.ensure_plugin_link(hermes_home, Path("/missing/hermes"))


if __name__ == "__main__":
    unittest.main()
