// Keep gateway URLs stable when Herdr recreates a saved machine with a new ID.
export function mergeRemoteConfig(previous, targets) {
  const remotes = [];
  for (const remote of previous.remotes ?? []) {
    if (!remotes.some((entry) => entry.host === remote.host && entry.session === remote.session)) {
      remotes.push({ ...remote });
    }
  }
  const usedPorts = new Set(remotes.map((remote) => remote.localPort));
  for (const target of targets) {
    const existing = remotes.find((remote) => remote.id === target.id ||
      (remote.host === target.host && remote.session === target.session));
    if (existing) {
      const stableId = existing.id;
      const stablePort = existing.localPort;
      Object.assign(existing, target, { id: stableId, localPort: stablePort });
    } else {
      let localPort = 8791;
      while (usedPorts.has(localPort)) localPort++;
      usedPorts.add(localPort);
      remotes.push({ ...target, localPort });
    }
  }
  return { port: 5173, bridgePort: 8787, remotes };
}
