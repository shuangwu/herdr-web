import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Keep browser storage and all HTTP/WebSocket traffic on a stable local origin.
export function destination(url, config) {
  const path = url.split("?")[0];
  if (!path.startsWith("/bridges/")) return { port: config.bridgePort, path: url };
  for (const remote of config.remotes) {
    const prefix = `/bridges/${remote.id}`;
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return { port: remote.localPort, path: url.slice(prefix.length) || "/" };
    }
  }
  return null;
}

export function mergeProfiles(existing, profiles) {
  const store = existing?.version === 2 && Array.isArray(existing.backends)
    ? existing : { version: 2, backends: [], enabledBridgeIds: ["same-origin"], lastSelectedBridgeId: "same-origin" };
  for (const profile of profiles) {
    const index = store.backends.findIndex((item) => item.id === profile.id || item.baseUrl === profile.baseUrl);
    if (index < 0) store.backends.push(profile);
    else store.backends[index] = { ...store.backends[index], baseUrl: profile.baseUrl };
    const id = index < 0 ? profile.id : store.backends[index].id;
    store.enabledBridgeIds = [...new Set([...(store.enabledBridgeIds ?? []), id])];
  }
  return store;
}

export function createGateway(config) {
  const server = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${config.port}` && req.headers.host !== `localhost:${config.port}`) {
      res.writeHead(403).end("Unexpected host"); return;
    }
    if (req.url === "/setup") {
      const nonce = randomBytes(20).toString("base64");
      const profiles = config.remotes.map(({ id, name }) => ({ id: `remote-${id}`, name, baseUrl: `http://${req.headers.host}/bridges/${id}` }));
      const data = JSON.stringify(profiles).replaceAll("<", "\\u003c");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'` });
      res.end(`<!doctype html><title>Connect Herdr bridges</title><p id="status">Saving bridge settings…</p><script nonce="${nonce}">
        try {
          const key = "herdrWeb.bridgeBackends.v2";
          const existing = JSON.parse(localStorage.getItem(key) || "null");
          localStorage.setItem(key, JSON.stringify((${mergeProfiles.toString()})(existing, ${data})));
          location.replace("/");
        } catch (error) { document.getElementById("status").textContent = "Could not save bridge settings: " + error.message; }
      </script>`);
      return;
    }
    const target = destination(req.url, config);
    if (!target) { res.writeHead(404).end("Unknown bridge"); return; }
    const upstream = http.request({ hostname: "127.0.0.1", port: target.port, path: target.path, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${config.bridgePort}` } }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.setTimeout(30_000, () => upstream.destroy(new Error("Bridge request timed out")));
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" }); res.end('{"error":"Bridge unavailable; reconnecting"}'); });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on("upgrade", (req, socket, head) => {
    if (![ `127.0.0.1:${config.port}`, `localhost:${config.port}` ].includes(req.headers.host)) { socket.destroy(); return; }
    const target = destination(req.url, config);
    if (!target) { socket.destroy(); return; }
    const upstream = http.request({ hostname: "127.0.0.1", port: target.port, path: target.path,
      headers: { ...req.headers, host: `127.0.0.1:${config.bridgePort}` } });
    upstream.setTimeout(15_000, () => upstream.destroy());
    upstream.on("upgrade", (response, peer, upstreamHead) => {
      upstream.setTimeout(0);
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`);
      for (let i = 0; i < response.rawHeaders.length; i += 2) socket.write(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`);
      socket.write("\r\n");
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) peer.write(head);
      socket.pipe(peer).pipe(socket);
      peer.on("error", () => socket.destroy());
      peer.on("close", () => socket.destroy());
      socket.on("close", () => peer.destroy());
    });
    upstream.on("response", () => { upstream.destroy(); socket.destroy(); });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
    upstream.end();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile(process.argv[2], "utf8"));
  const server = createGateway(config);
  server.listen(config.port, "127.0.0.1", () => console.log(`Herdr web: http://127.0.0.1:${config.port}`));
}
