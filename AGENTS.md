# Hermes Mobile Project Instructions

Read `PLAN.md` and `STATUS.md` in full before changing this project.

This is an independent side project. Do not modify the adjacent
`hermes-agent` checkout unless the user explicitly expands scope.

The server plugin is the compatibility boundary. Private Hermes imports are
allowed only in `server-plugin/mobile_server/compatibility.py` and narrowly
documented transport adapters.

Security requirements:

- Never persist long-lived credentials in browser local storage.
- Never journal secret or sudo values.
- Scope every persisted client value by connection ID.
- Use Hermes's canonical HTTP and WebSocket authentication gates.
- Fail closed for mutating operations when compatibility is uncertain.

Testing requirements:

- Do not run the Hermes pytest suite.
- Use this project's focused unittest and Vitest commands.
- Do not run broad commands against the dirty Hermes checkout.

Update `PLAN.md` and `STATUS.md` whenever a milestone or next action changes.

## Installation requests

When the user asks to install or update Hermes Mobile:

- Read `INSTALL.md` before changing host state.
- Use the checked-in scripts. Do not improvise Hermes core edits, public
  listeners, reverse proxies, firewall rules, or credential storage.
- Treat the Windows/AppData Hermes install as the automated reference path.
- Link the plugin with `scripts/link-plugin.ps1`, then install or refresh the
  dedicated server with `scripts/install-mobile-server.ps1`.
- Verify with `scripts/test-mobile-server.ps1`. This probe reads the session
  credential internally and must not print it.
- Do not call `scripts/show-mobile-connection.ps1 -RevealToken` in captured
  agent output. The user should run that command locally when they are ready to
  enter the credential on their phone.
- Report the plugin path, scheduled-task state, loopback ports, compatibility
  result, and whether Tailscale Serve is configured. Never report the token.
