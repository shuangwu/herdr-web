"""Run over SSH by remote-setup.mjs. Only manages the current user's bridges."""
import base64
import fcntl
import hashlib
import json
import os
import shutil
from pathlib import Path
import signal
import subprocess
import sys
import tarfile
import time
import urllib.request

config = json.loads(base64.b64decode(sys.argv[1]))
home = Path.home()
state = home / ".local/state/herdr-web-remote"
state.mkdir(parents=True, exist_ok=True)
lock = (state / "setup.lock").open("w")
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
unit = "herdr-web-remote.service"


def run(*args, check=True):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError("Command failed: " + " ".join(args) + "\n" + result.stderr)
    return result


def bridges():
    found = []
    for proc in Path("/proc").glob("[0-9]*"):
        try:
            if proc.stat().st_uid == os.getuid() and Path(os.readlink(proc / "exe").replace(" (deleted)", "")).name == "herdr-web-bridge":
                found.append(int(proc.name))
        except (OSError, ValueError):
            pass
    return found


def healthy():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/api/capabilities", timeout=3) as response:
            capabilities = json.load(response)
        with urllib.request.urlopen("http://127.0.0.1:8787/api/snapshot", timeout=3) as response:
            snapshot = json.load(response)
        return isinstance(capabilities.get("commands"), list) and isinstance(snapshot.get("panes"), list)
    except Exception:
        return False


existing = bridges()
if existing and not config["force"]:
    for pid in existing:
        proc = Path(f"/proc/{pid}")
        argv = proc.joinpath("cmdline").read_bytes().decode().split("\0")
        environ = dict(item.split("=", 1) for item in proc.joinpath("environ").read_bytes().decode().split("\0") if "=" in item)
        session = argv[argv.index("--session") + 1] if "--session" in argv else environ.get("HERDR_SESSION", "default")
        expected = home / ".config/herdr"
        if config["session"] != "default":
            expected = expected / "sessions" / config["session"]
        socket = environ.get("HERDR_SOCKET_PATH")
        if session != config["session"] or ("--session" not in argv and socket and Path(socket) != expected / "herdr.sock"):
            raise SystemExit("Existing bridge targets a different session; use --force to replace it.")
    if not healthy():
        raise SystemExit("Existing bridge is unhealthy or uses another port; rerun with --force to replace it.")
    print(json.dumps({"state": "reused", "pids": existing, "supervised": run("systemctl", "--user", "is-active", unit, check=False).returncode == 0}))
    sys.exit(0)

# Validate the replacement and service manager before touching existing instances.
run("systemctl", "--user", "show-environment")
archive = home / config["archive"]
if hashlib.sha256(archive.read_bytes()).hexdigest() != config["sha256"]:
    raise SystemExit("Remote archive checksum mismatch")
release = home / ".local/share/herdr-web-remote" / config["version"]
release.mkdir(parents=True, exist_ok=True)
binary = release / "herdr-web-bridge"
staged = release / "herdr-web-bridge.new"
with tarfile.open(archive, "r:gz") as tar:
    member = tar.getmember(f"herdr-web-{config['version']}-linux-x86_64/bin/herdr-web-bridge")
    if not member.isfile():
        raise SystemExit("Release binary is not a regular file")
    staged.write_bytes(tar.extractfile(member).read())
staged.chmod(0o755)
binary_check = run(str(staged), "--help", check=False)
if binary_check.returncode:
    if "GLIBC_" not in binary_check.stderr:
        raise SystemExit(binary_check.stderr)
    print("Published binary needs newer glibc; building the checked-out source with an isolated Rust toolchain.", flush=True)
    source_archive = home / config["sourceArchive"]
    if hashlib.sha256(source_archive.read_bytes()).hexdigest() != config["sourceSha256"]:
        raise SystemExit("Source archive checksum mismatch")
    build_root = home / ".cache/herdr-web-remote/build"
    source_root = build_root / config["sourceRevision"]
    source_root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(source_archive) as tar:
        for entry in tar.getmembers():
            parts = Path(entry.name).parts
            if not parts or parts[0] not in ("bridge", "vendor") or ".." in parts or entry.issym() or entry.islnk():
                raise SystemExit("Unsafe source archive member: " + entry.name)
        tar.extractall(source_root)
    cargo_home = build_root / "cargo"
    rustup_home = build_root / "rustup"
    cargo = cargo_home / "bin/cargo"
    env = dict(os.environ, CARGO_HOME=str(cargo_home), RUSTUP_HOME=str(rustup_home), CARGO_BUILD_JOBS="4")
    if not cargo.exists():
        installer = build_root / "rustup-init"
        run("curl", "--fail", "--location", "--retry", "3", "https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init", "--output", str(installer))
        installer.chmod(0o700)
        subprocess.run([str(installer), "-y", "--profile", "minimal", "--default-toolchain", "stable", "--no-modify-path"], env=env, check=True)
    subprocess.run([str(cargo), "build", "--locked", "--release", "--manifest-path", str(source_root / "bridge/Cargo.toml"), "--bin", "herdr-web-bridge"], env=env, check=True)
    release = home / ".local/share/herdr-web-remote" / ("source-" + config["sourceRevision"])
    release.mkdir(parents=True, exist_ok=True)
    binary = release / "herdr-web-bridge"
    staged = release / "herdr-web-bridge.new"
    shutil.copy2(source_root / "bridge/target/release/herdr-web-bridge", staged)
    run(str(staged), "--help")

if config["force"]:
    for pid in existing:
        try:
            for line in Path(f"/proc/{pid}/cgroup").read_text().splitlines():
                group = line.split(":", 2)[-1]
                if "/user.slice/" in group:
                    for part in group.split("/"):
                        if part.endswith(".service") and not part.startswith("user@"):
                            run("systemctl", "--user", "stop", part)
        except FileNotFoundError:
            pass
    run("systemctl", "--user", "stop", unit, check=False)
    for pid in bridges():
        os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + 5
    while bridges() and time.monotonic() < deadline:
        time.sleep(0.1)
    for pid in bridges():
        os.kill(pid, signal.SIGKILL)
    time.sleep(0.2)
    if bridges():
        raise SystemExit("A supervisor is recreating a bridge; stop its service before retrying.")

staged.replace(binary)
empty = release / "empty"
empty.mkdir(exist_ok=True)
session = config["session"]
socket_dir = home / ".config/herdr"
if session != "default":
    socket_dir = socket_dir / "sessions" / session


def unit_quote(value):
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"'


unit_dir = home / ".config/systemd/user"
unit_dir.mkdir(parents=True, exist_ok=True)
(unit_dir / unit).write_text(f"""[Unit]
Description=Herdr web bridge
StartLimitIntervalSec=0

[Service]
ExecStart={unit_quote(binary)} --host 127.0.0.1 --port 8787 --static-dir {unit_quote(empty)} --allow-origin http://127.0.0.1:5173 --allow-origin http://localhost:5173
Environment={unit_quote('HERDR_SOCKET_PATH=' + str(socket_dir / 'herdr.sock'))}
Restart=always
RestartSec=5
WorkingDirectory=%h

[Install]
WantedBy=default.target
""")
linger = run("loginctl", "show-user", str(os.getuid()), "-p", "Linger", "--value").stdout.strip()
if linger != "yes":
    run("loginctl", "enable-linger", os.environ.get("USER") or str(os.getuid()))
run("systemctl", "--user", "daemon-reload")
run("systemctl", "--user", "enable", "--now", unit)
for attempt in range(20):
    if healthy():
        print(json.dumps({"state": "started", "pids": bridges(), "supervised": True}))
        sys.exit(0)
    time.sleep(0.5)
raise SystemExit("Bridge failed readiness check. Inspect journalctl --user -u " + unit)
