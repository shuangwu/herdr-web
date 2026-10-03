import assert from "node:assert/strict";
import test from "node:test";
import { mergeRemoteConfig } from "./remote-config.mjs";

test("recreated machine keeps its gateway URL and local port", () => {
  const previous = { remotes: [
    { id: "old", host: "tb", name: "Tiebiao", session: "default", localPort: 8792 },
    { id: "new", host: "tb", name: "Tiebiao", session: "default", localPort: 8795 },
  ] };
  const targets = [{ id: "new", host: "tb", name: "Tiebiao", session: "default", enabled: "enabled", localPort: 8795 }];
  const config = mergeRemoteConfig(previous, targets);
  assert.equal(config.remotes.length, 1);
  assert.deepEqual(config.remotes[0], {
    id: "old", host: "tb", name: "Tiebiao", session: "default", localPort: 8792, enabled: "enabled",
  });
  assert.deepEqual(mergeRemoteConfig(config, targets), config);
});

test("different sessions on one SSH host remain separate profiles", () => {
  const previous = { remotes: [{ id: "default", host: "tb", session: "default", localPort: 8792 }] };
  const targets = [{ id: "agents", host: "tb", session: "agents", name: "Tiebiao agents" }];
  const config = mergeRemoteConfig(previous, targets);
  assert.deepEqual(config.remotes.map(({ id, localPort }) => [id, localPort]), [
    ["default", 8792], ["agents", 8791],
  ]);
});
