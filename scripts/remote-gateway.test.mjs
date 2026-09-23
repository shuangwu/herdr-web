import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { createGateway, mergeProfiles } from "./remote-gateway.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

test("provisioning preserves existing profiles and is repeatable", () => {
  const existing = { version: 2, backends: [{ id: "personal", name: "Keep me", baseUrl: "http://example.test" }], enabledBridgeIds: ["same-origin", "personal"], lastSelectedBridgeId: "personal" };
  const profiles = [{ id: "remote-a", name: "A", baseUrl: "/bridges/a" }];
  const first = mergeProfiles(structuredClone(existing), profiles);
  assert.deepEqual(mergeProfiles(structuredClone(first), profiles), first);
  assert.deepEqual(first.backends[0], existing.backends[0]);
  assert.equal(first.lastSelectedBridgeId, "personal");
  assert.deepEqual(first.enabledBridgeIds, ["same-origin", "personal", "remote-a"]);
});

test("gateway routes HTTP and WebSockets and recovers when the upstream returns", async (t) => {
  const upstream = http.createServer((req, res) => res.end(JSON.stringify({ path: req.url, host: req.headers.host })));
  upstream.on("upgrade", (req, socket) => {
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.write(Buffer.from([0x81, 2, 111, 107]));
    socket.on("data", () => socket.end(Buffer.from([0x88, 0])));
  });
  const upstreamPort = await listen(upstream);
  const config = { port: 0, bridgePort: upstreamPort, remotes: [{ id: "a", name: "A", localPort: upstreamPort }] };
  const gateway = createGateway(config);
  config.port = await listen(gateway);
  t.after(() => { gateway.closeAllConnections(); gateway.close(); upstream.closeAllConnections(); upstream.close(); });
  const base = `http://127.0.0.1:${config.port}`;
  const setup = await (await fetch(base + "/setup")).text();
  let saved;
  vm.runInNewContext(setup.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1], {
    localStorage: { getItem: () => null, setItem: (_key, value) => { saved = JSON.parse(value); } },
    location: { replace: () => {} },
  });
  assert.equal(saved.backends[0].baseUrl, base + "/bridges/a");
  const response = await fetch(base + "/bridges/a/api/snapshot?x=1");
  assert.deepEqual(await response.json(), { path: "/api/snapshot?x=1", host: `127.0.0.1:${upstreamPort}` });
  assert.equal((await fetch(base + "/bridges/unknown/api/snapshot")).status, 404);
  const denied = await new Promise((resolve, reject) => {
    http.get(base, { headers: { host: "attacker.example" } }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
  });
  assert.equal(denied, 403);
  const ws = new WebSocket(`ws://127.0.0.1:${config.port}/bridges/a/ws/events`);
  const message = await new Promise((resolve, reject) => { ws.onmessage = (e) => resolve(e.data); ws.onerror = reject; });
  assert.equal(message, "ok");
  const closed = new Promise((resolve) => { ws.onclose = resolve; }); ws.close(); await closed;
  upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve));
  assert.equal((await fetch(base + "/bridges/a/api/capabilities")).status, 502);
  upstream.listen(upstreamPort, "127.0.0.1"); await once(upstream, "listening");
  assert.equal((await fetch(base + "/bridges/a/api/capabilities")).status, 200);
});
