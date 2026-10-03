# Persistent remote setup on macOS

`node scripts/remote-setup.mjs setup` reads enabled machines from `herdr machine list`,
downloads the pinned v0.6.1 Linux x86_64 release and verifies its published SHA-256, then
provisions a bridge on each selected Linux machine. Node, the built local bridge/web assets,
GitHub CLI, and noninteractive SSH access are prerequisites. No root bridge service is used.
On Linux hosts whose glibc cannot run the release binary, setup builds the committed bridge
source instead, using an isolated Rust installation under `~/.cache/herdr-web-remote/build`.
It does not alter the remote shell PATH. Source archives are tied to this checkout's Git HEAD;
uncommitted bridge changes are not included in that fallback.
To deploy bridge changes from this branch, commit the source and run `setup --source HOST` for a
new bridge, or `setup --force --source HOST` to replace one already running. This builds the
committed source remotely. Replacement briefly interrupts connected web clients. Ordinary `setup`
continues to reuse a healthy bridge and will not silently upgrade it.

Remote bridges run under `systemd --user` with automatic restart. Setup enables user lingering
so the service survives SSH logout; the host must permit that operation. Herdr must already
be running and remain available. Remote reboots also require Herdr itself to start again.

Existing healthy bridges are reused. An existing unhealthy bridge is reported instead of killed.
Use `setup --force [SSH_ALIAS ...]` to replace all `herdr-web-bridge` instances owned by your
account on the selected machines. This interrupts their web clients; Herdr sessions remain
running. A reused bridge that is not supervised is reported as `supervised: false`.
If a saved Herdr machine is recreated with a new ID but the same SSH host and session, setup keeps
its prior gateway URL and tunnel port so existing browser profiles continue to work.

On macOS, launch agents supervise a local bridge, a small HTTP/WebSocket gateway, and one SSH
tunnel per remote. SSH keepalives detect a broken transport in approximately 45 seconds;
launchd restarts failed jobs with a 15-second throttle. Retries continue while network/VPN
access is unavailable. SSH must be able to authenticate without a prompt. Changed host keys,
expired credentials, or unavailable VPN access still need user action.

The gateway serves built assets at `http://127.0.0.1:5173` and routes remote bridges through
`/bridges/MACHINE_ID`. Browser settings therefore retain the same origin and stable URLs
across tunnel restarts. Stop an existing development server before starting these services.

Open `http://127.0.0.1:5173/setup` once per browser profile to merge and enable the remote
profiles in localStorage. It preserves unrelated saved profiles and selection. The **Machines**
dialog in the web app now also reads gateway, SSH, tunnel, Herdr, and bridge health; shows recent
logs and read-only session/integration/configuration diagnostics; and offers typed repair and
machine-management actions. Its `/_local/machines` API is served only by the loopback gateway and
requires an exact same-origin request for changes. A remote-hosted web app cannot manage the
local Mac. If the gateway itself is down, run `node scripts/remote-setup.mjs start` locally.

```bash
node scripts/remote-setup.mjs setup          # all enabled saved machines
node scripts/remote-setup.mjs setup host-a  # one machine; retain others
node scripts/remote-setup.mjs setup --force host-a
node scripts/remote-setup.mjs setup --source host-a
node scripts/remote-setup.mjs setup --force --source host-a
node scripts/remote-setup.mjs status
node scripts/remote-setup.mjs stop
node scripts/remote-setup.mjs start
```

`stop` unloads local jobs for the current login, leaving remote bridges running. LaunchAgent
files remain and load again at the next login. To remove automatic startup, stop first and
remove the generated `~/Library/LaunchAgents/local.herdr-web.*.plist` files.

Local configuration: `~/.config/herdr-web/remote-setup/config.json`.
Local logs: `~/Library/Logs/herdr-web/`.
Remote logs: `journalctl --user -u herdr-web-remote.service`.
Remote service: `~/.config/systemd/user/herdr-web-remote.service`.

Keep this checkout, its built assets, and Node installed: launch agents reference their paths.
Rebuild/restart the local bridge after Rust changes; rebuild web assets after frontend changes.

Validation: `npm run test:remote` covers HTTP/WebSocket forwarding, machine API origin checks,
upstream outage/recovery, host validation, and repeatable browser provisioning. An actual
network move depends on the host network, VPN, and authentication environment.
