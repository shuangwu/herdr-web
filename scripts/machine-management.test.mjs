import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyMachine, createMachineManager, parseMachineList } from "./machine-management.mjs";

test("parses saved machines and rejects malformed targets", () => {
  assert.deepEqual(parseMachineList("5b045276b67e669a244fa22dc4e4ed1a\tTiebiao\ttb\tdefault\tenabled\n"), [
    { id: "5b045276b67e669a244fa22dc4e4ed1a", name: "Tiebiao", host: "tb", session: "default", enabled: true },
  ]);
  assert.deepEqual(parseMachineList("12345678\tBad\t-oProxyCommand=evil\tdefault\tenabled"), []);
});

test("diagnosis identifies the failing layer without treating stale agent sockets as bridge failure", () => {
  const base = { saved: { id: "12345678" }, sshError: null, tunnel: true, snapshot: true,
    remote: { server: "status: running", bridgeService: "active", stableAgent: false } };
  assert.equal(classifyMachine(base).layer, "ready");
  assert.equal(classifyMachine({ ...base, sshError: "Permission denied (publickey)" }).layer, "authentication");
  assert.equal(classifyMachine({ ...base, remote: { ...base.remote, bridgeService: "inactive" }, tunnel: false }).layer, "bridge");
  assert.equal(classifyMachine({ ...base, tunnel: false }).layer, "tunnel");
  assert.equal(classifyMachine({ ...base, snapshot: false }).layer, "snapshot");
  assert.equal(classifyMachine({ ...base, saved: { id: "12345678", enabled: false } }).message, "Saved Herdr machine is disabled");
});

test("host discovery validates the target and rename persists the managed label", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "herdr-machines-"));
  const configPath = path.join(directory, "config.json");
  const id = "5b045276b67e669a244fa22dc4e4ed1a";
  await writeFile(configPath, JSON.stringify({ port: 5173, bridgePort: 8787, remotes: [
    { id, name: "Old", host: "tb", session: "default", localPort: 18787 },
  ] }));
  const calls = [];
  const manager = createMachineManager(configPath, {
    run: async (bin, args) => { calls.push([bin, args]); return bin === "herdr" && args[0] === "machine" && args[1] === "list"
      ? `${id}\tOld\ttb\tdefault\tenabled\n` : ""; },
    remoteProbe: async (host) => ({ remote: { sessions: `${host} default` }, sshError: null }),
  });
  try {
    await assert.rejects(manager.action({ action: "probeHost", host: "-oProxyCommand=bad" }), /Invalid SSH target/);
    assert.equal((await manager.action({ action: "probeHost", host: "tb" })).remote.sessions, "tb default");
    await manager.action({ action: "rename", id, label: "Tiebiao" });
    assert.equal(JSON.parse(await readFile(configPath, "utf8")).remotes[0].name, "Tiebiao");
    assert.ok(calls.some(([bin, args]) => bin === "herdr" && args.join(" ") === `machine rename --label Tiebiao ${id}`));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
