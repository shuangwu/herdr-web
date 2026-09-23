#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME_DIR = os.homedir();
const STATE = path.join(HOME_DIR, ".config/herdr-web/remote-setup");
const CONFIG = path.join(STATE, "config.json");
const AGENTS = path.join(HOME_DIR, "Library/LaunchAgents");
const LOGS = path.join(HOME_DIR, "Library/Logs/herdr-web");
const VERSION = "v0.6.1";
const REPO = "kcosr/herdr-web";
const SSH = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ControlPath=none"];
const DOMAIN = `gui/${process.getuid()}`;
const PREFIX = "local.herdr-web";
const args = process.argv.slice(2);
const command = args.shift() ?? "status";
const force = args.includes("--force");
const selected = args.filter((arg) => arg !== "--force");
const quote = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'";
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function run(bin, argv, options = {}) {
  return execFileSync(bin, argv, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, ...options });
}
function attempt(bin, argv) { try { return run(bin, argv, { stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } }
function config() { return JSON.parse(readFileSync(CONFIG, "utf8")); }
function jobs(cfg) {
  return [
    { label: `${PREFIX}.bridge`, argv: [path.join(ROOT, "bridge/target/debug/herdr-web-bridge"), "--host", "127.0.0.1", "--port", "8787", "--static-dir", path.join(ROOT, "web/dist")], env: { HERDR_SOCKET_PATH: path.join(HOME_DIR, ".config/herdr/herdr.sock") } },
    { label: `${PREFIX}.gateway`, argv: [process.execPath, path.join(ROOT, "scripts/remote-gateway.mjs"), CONFIG] },
    ...cfg.remotes.map((remote) => ({ label: `${PREFIX}.tunnel.${remote.id}`, argv: ["/usr/bin/ssh", ...SSH, "-N", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectionAttempts=1", "-L", `127.0.0.1:${remote.localPort}:127.0.0.1:8787`, remote.host] })),
  ];
}
function stopJob(label) {
  if (attempt("launchctl", ["print", `${DOMAIN}/${label}`]) !== null) run("launchctl", ["bootout", `${DOMAIN}/${label}`]);
}
function installJobs(cfg) {
  mkdirSync(AGENTS, { recursive: true }); mkdirSync(LOGS, { recursive: true });
  for (const job of jobs(cfg)) {
    const file = path.join(AGENTS, `${job.label}.plist`);
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(job.label)}</string>
<key>ProgramArguments</key><array>${job.argv.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(ROOT)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(job.env ?? {}).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join("")}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(path.join(LOGS, job.label + ".log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(LOGS, job.label + ".error.log"))}</string>
</dict></plist>\n`;
    const changed = !existsSync(file) || readFileSync(file, "utf8") !== content;
    if (changed) { stopJob(job.label); writeFileSync(file, content); }
    run("plutil", ["-lint", file]);
    if (attempt("launchctl", ["print", `${DOMAIN}/${job.label}`]) === null) run("launchctl", ["bootstrap", DOMAIN, file]);
    console.log(`Supervised: ${job.label}`);
  }
}
async function health(url) {
  try {
    const res = await fetch(url + "/api/capabilities", { signal: AbortSignal.timeout(4000) });
    if (!res.ok || !Array.isArray((await res.json()).commands)) return false;
    const snapshot = await fetch(url + "/api/snapshot", { signal: AbortSignal.timeout(4000) });
    return snapshot.ok && Array.isArray((await snapshot.json()).panes);
  } catch { return false; }
}
async function status(cfg) {
  let ready = true;
  for (const [name, base] of [["Local", ""], ...cfg.remotes.map((r) => [r.name, `/bridges/${r.id}`])]) {
    const ok = await health(`http://127.0.0.1:${cfg.port}${base}`);
    console.log(`${ok ? "LIVE" : "UNAVAILABLE"}\t${name}\thttp://127.0.0.1:${cfg.port}${base}`);
    ready &&= ok;
  }
  return ready;
}

async function setup() {
  for (const required of ["bridge/target/debug/herdr-web-bridge", "web/dist/index.html"]) {
    if (!existsSync(path.join(ROOT, required))) throw new Error("Build first with npm run build: missing " + required);
  }
  const previous = existsSync(CONFIG) ? config() : { remotes: [] };
  const machines = run("herdr", ["machine", "list"]).trim().split("\n").filter(Boolean).map((line) => {
    const [id, name, host, session, enabled] = line.split("\t");
    if (!/^[a-f0-9]+$/.test(id) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(host) || !/^[a-zA-Z0-9._-]{1,64}$/.test(session)) throw new Error("Unsupported saved machine entry: " + name);
    return { id, name, host, session, enabled };
  }).filter((machine) => machine.enabled === "enabled");
  for (const host of selected) if (!machines.some((m) => m.host === host)) throw new Error("Unknown enabled SSH machine: " + host);
  const targets = machines.filter((m) => selected.length === 0 || selected.includes(m.host));
  if (!targets.length) throw new Error("No enabled saved SSH machines");
  const cfg = { port: 5173, bridgePort: 8787, remotes: [...previous.remotes] };
  const usedPorts = new Set(cfg.remotes.map((r) => r.localPort));
  for (const target of targets) {
    const existing = cfg.remotes.find((r) => r.id === target.id);
    if (existing) Object.assign(existing, target);
    else {
      let localPort = 8791;
      while (usedPorts.has(localPort)) localPort++;
      usedPorts.add(localPort);
      cfg.remotes.push({ ...target, localPort });
    }
  }
  const cache = path.join(ROOT, ".scratch/remote-setup"); mkdirSync(cache, { recursive: true });
  const filename = `herdr-web-${VERSION}-linux-x86_64.tar.gz`;
  for (const asset of [filename, filename + ".sha256"]) {
    if (!existsSync(path.join(cache, asset))) run("gh", ["release", "download", VERSION, "--repo", REPO, "--pattern", asset, "--dir", cache], { stdio: "inherit" });
  }
  const sha256 = createHash("sha256").update(readFileSync(path.join(cache, filename))).digest("hex");
  if (readFileSync(path.join(cache, filename + ".sha256"), "utf8").trim().split(/\s+/)[0] !== sha256) throw new Error("Release checksum mismatch");
  const sourceRevision = run("git", ["-C", ROOT, "rev-parse", "HEAD"]).trim();
  const sourceName = `source-${sourceRevision}.tar`;
  run("git", ["-C", ROOT, "archive", "--output", path.join(cache, sourceName), "HEAD", "bridge", "vendor"]);
  const sourceSha256 = createHash("sha256").update(readFileSync(path.join(cache, sourceName))).digest("hex");
  for (const remote of targets) {
    console.log(`Preparing ${remote.name} (${remote.host})${force ? " with --force" : ""}…`);
    const platform = run("/usr/bin/ssh", [...SSH, remote.host, "uname -sm"]).trim();
    if (platform !== "Linux x86_64") throw new Error(`${remote.name}: unsupported platform ${platform}`);
    run("/usr/bin/ssh", [...SSH, remote.host, "mkdir -p .cache/herdr-web-remote"]);
    const archive = `.cache/herdr-web-remote/${filename}`;
    run("/usr/bin/scp", ["-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", path.join(cache, filename), `${remote.host}:${archive}`]);
    const sourceArchive = `.cache/herdr-web-remote/${sourceName}`;
    run("/usr/bin/scp", ["-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", path.join(cache, sourceName), `${remote.host}:${sourceArchive}`]);
    const payload = Buffer.from(JSON.stringify({ version: VERSION, archive, sha256, force, session: remote.session, sourceArchive, sourceRevision, sourceSha256 })).toString("base64");
    run("/usr/bin/ssh", [...SSH, remote.host, `python3 - ${quote(payload)}`], { input: readFileSync(path.join(ROOT, "scripts/remote-install.py"), "utf8"), stdio: ["pipe", "inherit", "inherit"] });
  }
  mkdirSync(STATE, { recursive: true });
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  // Existing unmanaged listeners must be stopped explicitly; never kill a port owner.
  for (const [port, label] of [[cfg.port, `${PREFIX}.gateway`], [cfg.bridgePort, `${PREFIX}.bridge`], ...cfg.remotes.map((r) => [r.localPort, `${PREFIX}.tunnel.${r.id}`])]) {
    const listener = attempt("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    if (listener?.trim() && attempt("launchctl", ["print", `${DOMAIN}/${label}`]) === null) throw new Error(`Port ${port} already has an unmanaged listener (PID ${listener.trim()}). Stop it, then run start.`);
  }
  installJobs(cfg);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await status(cfg);
  console.log(`Open http://127.0.0.1:${cfg.port}/setup once in each browser profile to merge and enable the remote bridges.`);
}

try {
  if (process.platform !== "darwin") throw new Error("This controller requires macOS; remote hosts must be Linux x86_64.");
  if (selected.some((arg) => arg.startsWith("-"))) throw new Error("Unknown option");
  if (force && command !== "setup") throw new Error("--force is only valid with setup");
  if (selected.length && command !== "setup") throw new Error("Host selection is only valid with setup");
  switch (command) {
    case "setup": await setup(); break;
    case "start": installJobs(config()); break;
    case "stop": for (const job of jobs(config()).reverse()) stopJob(job.label); break;
    case "status": if (!await status(config())) process.exitCode = 1; break;
    case "help": case "--help":
      console.log("Usage: node scripts/remote-setup.mjs setup [--force] [SSH_ALIAS ...] | start | stop | status\nsetup provisions enabled Herdr machines, user services, and login agents. --force replaces all your bridges on selected remotes. stop unloads local jobs for this login; plist files remain for the next login."); break;
    default: throw new Error("Unknown command; use help");
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
