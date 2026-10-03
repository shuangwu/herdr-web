# Herdr Web keyboard and machine-management plan

This plan was drafted against Herdr 0.9.1's local `herdr --help` command tree and the
[Herdr concepts](https://herdr.dev/docs/concepts/),
[CLI reference](https://herdr.dev/docs/cli-reference/), and
[connecting-machines guide](https://herdr.dev/docs/connecting-machines/).
Newer Herdr versions may add commands, so the UI must feature-detect capabilities.

## Vocabulary and discoverability

Herdr's API calls the top-level project container a **workspace**. Herdr's sidebar calls the
same container a **Space**; it owns tabs and panes. Keep the familiar Space label and explain it
in a tooltip: “Space (workspace): a project container for tabs and terminal panes.” Add a small
glossary in shortcut help.

Give every icon-only control a visible tooltip on hover and keyboard focus, an accessible name,
and its shortcut when one exists. Use the same wording in buttons, menus, and the command palette.
Audit unavailable actions for a useful reason instead of leaving an unexplained disabled icon.

## Keyboard-first workflow

1. Add a searchable command palette for actions and navigation across machines, Spaces, tabs,
   panes, agents, and notes. Include recent destinations and the host in every result. Make it
   work when the terminal input is focused, but leave normal text fields and dialogs alone.
2. Add a searchable shortcut-help overlay and show shortcuts in menus and tooltips. Keep the
   current Cmd+1–9 global tab selection and its on-hold sidebar hints. Audit browser/OS conflicts
   and provide alternate bindings where needed.
3. Give sidebar lists arrow-key movement, Enter to activate, Escape to return to the terminal,
   and Shift+F10/Menu to open row actions. Make dialogs, menus, and resizers fully reachable by
   keyboard with predictable focus return. Offer remappable bindings after the default map is
   stable.

## Machine management

The current Bridge settings save browser URLs. The macOS gateway, SSH tunnels, remote bridge
service, and Herdr's saved-machine catalog are separate. Add a **Machines** area that presents
them as one lifecycle, while preserving stable browser URLs if Herdr recreates a machine ID.

1. **Read-only status and diagnosis:** show browser profile, gateway, tunnel, SSH reachability,
   authentication, SSH-agent forwarding, remote Herdr socket/version/protocol, bridge service,
   and snapshot health. For agent forwarding, distinguish a fresh SSH connection with a usable
   agent from a running server or pane that inherited a stale `SSH_AUTH_SOCK`.
   Show the exact failing layer and recent relevant logs. Refresh automatically after network
   changes; never display stale snapshots as live.
2. **Guided repair:** offer the smallest action that matches the diagnosis: retry a probe,
   reconnect a tunnel, start/restart a stopped bridge, repair a missing service, or merge the
   browser profile. Explain when VPN, SSH credentials, or host-key approval must be completed in
   a terminal. For stale pane agent sockets, recommend a server version with reconnect handling
   and distinguish live handoff from restarting pane processes. Keep `--force` replacement
   separate because it interrupts web clients.
3. **Add and manage:** a wizard for SSH target, label, and Herdr session; validate the target,
   add the Herdr machine, provision the bridge, create the tunnel, enable the browser profile,
   and verify the end-to-end snapshot. Support rename, enable/disable, reconnect, and remove.
   Removing a saved machine should say whether the remote Herdr session is left running.

Use a narrow, loopback-only management API in the local gateway for these typed operations.
Validate Host and Origin on state-changing requests, avoid an arbitrary shell-command endpoint,
and report progress and actionable failures. The gateway itself cannot repair itself while down;
provide a local launcher/terminal recovery path for that case. Remote-hosted deployments should
show machine controls as unavailable unless an equivalent trusted local controller exists.

## Herdr command inventory and UI priority

| Command family (Herdr 0.9.1) | Web UI treatment |
| --- | --- |
| `machine list/add/rename/remove/enable/disable` | Machine area above; include `status/reconnect` when supported by newer Herdr. |
| `workspace list/create/get/focus/rename/close/report-metadata` | Core lifecycle already present; expose Space details and creation options such as directory in a later pass. Metadata reporting remains an integration API. |
| `tab list/create/get/focus/rename/close` | Already represented; complete keyboard access and discoverability. |
| `pane list/current/get/layout/process-info/neighbor/edges/focus/resize/zoom/read/rename/input/split/swap/move/close/send-text/send-keys/wait-output/run/report-agent/report-agent-session/release-agent/report-metadata` | Add zoom, keyboard resize/swap, and moving into existing tabs; show process details. Existing terminal input covers ordinary typing. Keep wait/run and reporting/authority commands for automation rather than duplicating them as generic buttons. |
| `agent list/get/read/send-keys/prompt/rename/focus/wait/attach/start/explain` | Existing agent list and launch cover part of this. Add detection explanation and native prompt action; use terminal input for ordinary keys. Wait/attach are better expressed as UI state/navigation or left to CLI. |
| `worktree list/create/open/remove` | Add a guided Worktrees area after machine health, with path/branch preview and explicit review before removal. |
| `session list/attach/stop/delete` | Add read-only session discovery and selection for machine setup; leave stop/delete as advanced, clearly scoped operations. |
| `notification show` | Browser alerting exists; no generic manual notification button needed. |
| `integration install/uninstall/status` | Show status first; defer install/uninstall until their effects can be previewed. |
| `config check/reset-keys` | Surface validation diagnostics; handle keybinding reset in keyboard settings later. |
| `server stop/reload-config/agent-manifests/update-agent-manifests/reload-agent-manifests` | Show server/version status; consider reload config/manifests in advanced tools. Keep server stop out of routine navigation. |
| `channel show/set`, `update`, `status`, `api snapshot/schema`, `completion` | Show version/update availability and status. Keep channel changes, raw schema, and shell completion in CLI/developer tools. |

## Suggested delivery order

1. Terminology tooltips, shortcut help, command palette, and keyboard navigation.
2. Read-only machine status with diagnostic classification and logs.
3. Targeted repair actions, then add/rename/enable/disable/remove machine flows.
4. Pane zoom/resize/swap/move, agent explain/prompt, and Worktrees.
5. Advanced session, integration, config, and server controls only after their behavior and
   confirmations are designed.

Validate with keyboard-only walkthroughs, accessible-name/focus tests, controller API tests,
and a real office-to-home network transition. The transition should end with each reachable
machine live again without manual tunnel restarts.
