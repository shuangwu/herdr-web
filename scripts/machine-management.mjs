import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const SSH = ["-T", "-A", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "ControlPath=none"];
const SAFE_HOST = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SAFE_ID = /^[a-f0-9]{8,64}$/;
const SAFE_SESSION = /^[a-zA-Z0-9._-]{1,64}$/;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REMOTE_PROBE = `import json, os, stat, subprocess
def run(args, timeout=4):
 try:
  result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
  return result.returncode, (result.stdout + result.stderr).strip()[:3000]
 except Exception as error: return -1, str(error)
code, identities = run(['ssh-add', '-l'])
_, server = run([os.path.expanduser('~/.local/bin/herdr'), 'status', 'server'])
_, status = run([os.path.expanduser('~/.local/bin/herdr'), 'status'])
_, sessions = run([os.path.expanduser('~/.local/bin/herdr'), 'session', 'list'])
_, integrations = run([os.path.expanduser('~/.local/bin/herdr'), 'integration', 'status'])
_, config_check = run([os.path.expanduser('~/.local/bin/herdr'), 'config', 'check'])
_, service = run(['systemctl', '--user', 'is-active', 'herdr-web-remote.service'])
link = os.path.expanduser('~/.config/herdr/herdr.sock.agent')
target = os.path.realpath(link) if os.path.islink(link) else ''
stable = bool(target and os.path.exists(target) and stat.S_ISSOCK(os.stat(target).st_mode))
_, panes_raw = run([os.path.expanduser('~/.local/bin/herdr'), 'pane', 'list'])
stale = 0
try:
 for pane in json.loads(panes_raw).get('result', {}).get('panes', []):
  _, info = run([os.path.expanduser('~/.local/bin/herdr'), 'pane', 'process-info', '--pane', pane['pane_id']])
  pid = json.loads(info).get('result', {}).get('process_info', {}).get('shell_pid')
  if pid:
   env = open('/proc/%s/environ' % pid, 'rb').read().split(b'\\0')
   value = next((item[14:].decode(errors='replace') for item in env if item.startswith(b'SSH_AUTH_SOCK=')), '')
   if value and not os.path.exists(value): stale += 1
except Exception: pass
_, logs = run(['journalctl', '--user', '-u', 'herdr-web-remote.service', '-n', '12', '--no-pager'])
print(json.dumps({'forwardedAgent': code == 0, 'agentDetail': identities[:240], 'server': server, 'status': status, 'sessions': sessions, 'integrations': integrations, 'configCheck': config_check, 'bridgeService': service, 'stableAgent': stable, 'stalePaneCount': stale, 'logs': logs[-2500:]}))`;

export function parseMachineList(output) {
  return output.trim().split("\n").filter(Boolean).map((line) => {
    const [id, name, host, session, state] = line.split("\t");
    if (!SAFE_ID.test(id) || !SAFE_HOST.test(host) || !SAFE_SESSION.test(session)) return null;
    return { id, name, host, session, enabled: state === "enabled" };
  }).filter(Boolean);
}

export function classifyMachine(machine) {
  if (machine.enabled === false) return { state: "disabled", layer: "disabled", message: "Disabled" };
  if (!machine.saved) return { state: "attention", layer: "profile", message: "Saved Herdr machine is missing" };
  if (machine.saved.enabled === false) return { state: "attention", layer: "profile", message: "Saved Herdr machine is disabled" };
  if (machine.sshError) {
    const auth = /permission denied|authentication|host key|verification failed/i.test(machine.sshError);
    return { state: "attention", layer: auth ? "authentication" : "network", message: machine.sshError };
  }
  if (!machine.remote?.server?.includes("status: running")) return { state: "attention", layer: "herdr", message: "Remote Herdr server is unavailable" };
  if (machine.remote?.bridgeService !== "active") return { state: "attention", layer: "bridge", message: "Remote bridge service is not active" };
  if (!machine.tunnel) return { state: "attention", layer: "tunnel", message: "SSH tunnel is not carrying bridge traffic" };
  if (!machine.snapshot) return { state: "attention", layer: "snapshot", message: "Bridge snapshot is unavailable" };
  return { state: "live", layer: "ready", message: "Live" };
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
async function command(bin, args, timeout = 10000) {
  const { stdout } = await exec(bin, args, { timeout, maxBuffer: 2 * 1024 * 1024, encoding: "utf8",
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || "/usr/bin:/bin"}` } });
  return stdout;
}
async function probeHttp(port) {
  try {
    const base = `http://127.0.0.1:${port}`;
    const capabilities = await fetch(`${base}/api/capabilities`, { signal: AbortSignal.timeout(3000) });
    if (!capabilities.ok) return { tunnel: false, snapshot: false };
    const response = await fetch(`${base}/api/snapshot`, { signal: AbortSignal.timeout(3000) });
    return { tunnel: true, snapshot: response.ok && Array.isArray((await response.json()).panes) };
  } catch { return { tunnel: false, snapshot: false }; }
}
async function probeRemote(host) {
  try {
    const output = await command("/usr/bin/ssh", [...SSH, host, `python3 -c ${shellQuote(REMOTE_PROBE)}`], 20000);
    return { remote: JSON.parse(output), sshError: null };
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim().slice(0, 500);
    return { remote: null, sshError: detail || "SSH connection failed" };
  }
}

export function createMachineManager(configPath, { run = command, remoteProbe = probeRemote, httpProbe = probeHttp } = {}) {
  const readConfig = async () => {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!Array.isArray(config.remotes) || !Number.isInteger(config.port) || !Number.isInteger(config.bridgePort)) throw new Error("Invalid machine configuration");
    for (const remote of config.remotes) {
      if (!SAFE_ID.test(remote.id) || !SAFE_HOST.test(remote.host) || !SAFE_SESSION.test(remote.session) ||
        !Number.isInteger(remote.localPort) || remote.localPort < 1024 || remote.localPort > 65535) throw new Error("Invalid managed machine entry");
    }
    return config;
  };
  const writeConfig = async (config) => {
    const temporary = `${configPath}.tmp-${process.pid}`;
    await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, configPath);
  };
  const savedMachines = async () => parseMachineList(await run("herdr", ["machine", "list"]));
  const profileFor = (remote, saved) => saved.find((item) => item.id === remote.id ||
    (item.host === remote.host && item.session === remote.session));
  const findRemote = (config, id) => {
    const remote = config.remotes.find((item) => item.id === id);
    if (!remote) throw new Error("Unknown managed machine");
    return remote;
  };
  const jobLabel = (remote) => `local.herdr-web.tunnel.${remote.id}`;
  const jobTarget = (remote) => `gui/${process.getuid()}/${jobLabel(remote)}`;
  const jobFile = (remote) => path.join(os.homedir(), "Library/LaunchAgents", `${jobLabel(remote)}.plist`);
  const stopTunnel = async (remote) => {
    await run("launchctl", ["bootout", jobTarget(remote)], 10000).catch(() => {});
  };
  const startTunnel = async (remote) => {
    try { await run("launchctl", ["kickstart", "-k", jobTarget(remote)], 10000); }
    catch { await run("launchctl", ["bootstrap", `gui/${process.getuid()}`, jobFile(remote)], 10000); }
  };

  return {
    readConfig,
    async snapshot() {
      const config = await readConfig();
      const saved = await savedMachines();
      const localDiagnostics = Promise.allSettled([
        run("herdr", ["status"], 6000),
        run("herdr", ["session", "list"], 6000),
        run("herdr", ["integration", "status"], 6000),
        run("herdr", ["config", "check"], 6000),
      ]).then((results) => Object.fromEntries(["status", "sessions", "integrations", "configCheck"].map((key, index) => [key,
        results[index].status === "fulfilled" ? results[index].value : String(results[index].reason?.message || results[index].reason)])));
      const machines = await Promise.all(config.remotes.map(async (remote) => {
        const [ssh, health, job] = await Promise.all([
          remoteProbe(remote.host), httpProbe(remote.localPort),
          run("launchctl", ["print", jobTarget(remote)], 3000).then((output) => /state = running/.test(output), () => false),
        ]);
        const machine = {
          id: remote.id, name: remote.name, host: remote.host, session: remote.session,
          enabled: remote.enabled !== false, port: remote.localPort,
          saved: profileFor(remote, saved) ?? null, job, tunnel: health.tunnel, snapshot: health.snapshot,
          remote: ssh.remote, sshError: ssh.sshError,
        };
        return { ...machine, diagnosis: classifyMachine(machine) };
      }));
      return { available: true, checkedAt: new Date().toISOString(), local: await localDiagnostics, machines,
        unconfigured: saved.filter((item) => !config.remotes.some((remote) => profileFor(remote, [item]))) };
    },
    async action(body) {
      if (!body || typeof body !== "object" || typeof body.action !== "string") throw new Error("Invalid action");
      const config = await readConfig();
      const saved = await savedMachines();
      if (body.action === "probeHost") {
        const host = typeof body.host === "string" ? body.host.trim() : "";
        if (!SAFE_HOST.test(host)) throw new Error("Invalid SSH target");
        const probe = await remoteProbe(host);
        return { host, ...probe };
      }
      if (body.action === "add") {
        const host = typeof body.host === "string" ? body.host.trim() : "";
        const session = typeof body.session === "string" ? body.session.trim() || "default" : "default";
        const label = typeof body.label === "string" ? body.label.trim() || host : host;
        if (!SAFE_HOST.test(host) || !SAFE_SESSION.test(session) || !label || label.length > 80) throw new Error("Invalid host, session, or label");
        if (saved.some((item) => item.host === host && item.session === session)) throw new Error("Machine already exists");
        await run("herdr", ["machine", "add", "--label", label, "--remote-session", session, host], 30000);
        await run(process.execPath, [path.join(ROOT, "scripts/remote-setup.mjs"), "setup", "--source", host], 600000);
        const updated = await readConfig();
        const remote = updated.remotes.find((item) => item.host === host && item.session === session);
        return { message: `Added ${label}`, id: remote?.id, name: remote?.name };
      }
      if (!SAFE_ID.test(body.id)) throw new Error("Invalid machine ID");
      if (body.action === "provision") {
        const profile = saved.find((item) => item.id === body.id);
        if (!profile) throw new Error("Unknown saved Herdr machine");
        await run(process.execPath, [path.join(ROOT, "scripts/remote-setup.mjs"), "setup", "--source", profile.host], 600000);
        const updated = await readConfig();
        const remote = updated.remotes.find((item) => item.host === profile.host && item.session === profile.session);
        return { message: `Provisioned ${profile.name}`, id: remote?.id, name: remote?.name };
      }
      const remote = findRemote(config, body.id);
      const profile = profileFor(remote, saved);
      if (body.action === "restartTunnel") {
        await startTunnel(remote);
        return { message: `Restarted ${remote.name} tunnel` };
      }
      if (body.action === "startBridge" || body.action === "restartBridge") {
        await run("/usr/bin/ssh", [...SSH, remote.host, `systemctl --user ${body.action === "startBridge" ? "start" : "restart"} herdr-web-remote.service`], 15000);
        return { message: `${body.action === "startBridge" ? "Started" : "Restarted"} ${remote.name} bridge` };
      }
      if (body.action === "repairBridge") {
        await run(process.execPath, [path.join(ROOT, "scripts/remote-setup.mjs"), "setup", "--source", remote.host], 600000);
        return { message: `Repaired ${remote.name} bridge` };
      }
      if (body.action === "forceBridge") {
        await run(process.execPath, [path.join(ROOT, "scripts/remote-setup.mjs"), "setup", "--force", "--source", remote.host], 600000);
        return { message: `Replaced ${remote.name} bridge` };
      }
      if (!profile) throw new Error("Saved Herdr machine is missing");
      if (body.action === "rename") {
        const label = typeof body.label === "string" ? body.label.trim() : "";
        if (!label || label.length > 80) throw new Error("Invalid machine label");
        await run("herdr", ["machine", "rename", "--label", label, profile.id]);
        remote.name = label;
        await writeConfig(config);
        return { message: `Renamed machine to ${label}` };
      }
      if (body.action === "enable" || body.action === "disable") {
        await run("herdr", ["machine", body.action, profile.id]);
        remote.enabled = body.action === "enable";
        await writeConfig(config);
        if (remote.enabled) {
          await run("launchctl", ["enable", jobTarget(remote)]);
          await startTunnel(remote);
        } else {
          await run("launchctl", ["disable", jobTarget(remote)]);
          await stopTunnel(remote);
        }
        return { message: `${body.action === "enable" ? "Enabled" : "Disabled"} ${remote.name}` };
      }
      if (body.action === "remove") {
        await run("herdr", ["machine", "remove", profile.id]);
        config.remotes = config.remotes.filter((item) => item !== remote);
        await writeConfig(config);
        await stopTunnel(remote);
        await unlink(jobFile(remote)).catch(() => {});
        return { message: `Removed ${remote.name} locally; remote Herdr session remains running` };
      }
      throw new Error("Unsupported machine action");
    },
  };
}
