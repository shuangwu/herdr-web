import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useBridge } from "./bridge";
import { trapFocusWithin, useFocusReturn } from "./overlayFocus";

type RemoteStatus = {
  forwardedAgent: boolean;
  agentDetail: string;
  server: string;
  status: string;
  sessions: string;
  integrations: string;
  configCheck: string;
  bridgeService: string;
  stableAgent: boolean;
  stalePaneCount: number;
  logs: string;
};
type ManagedMachine = {
  id: string;
  name: string;
  host: string;
  session: string;
  enabled: boolean;
  saved: { id: string; enabled: boolean } | null;
  job: boolean;
  tunnel: boolean;
  snapshot: boolean;
  remote: RemoteStatus | null;
  sshError: string | null;
  diagnosis: { state: "live" | "attention" | "disabled"; layer: string; message: string };
};
type Diagnostics = { status: string; sessions: string; integrations: string; configCheck: string };
type MachineSnapshot = { available: true; checkedAt: string; local: Diagnostics; machines: ManagedMachine[];
  unconfigured: Array<{ id: string; name: string; host: string; session: string; enabled: boolean }> };
type Action = "restartTunnel" | "startBridge" | "restartBridge" | "repairBridge" | "forceBridge" |
  "rename" | "enable" | "disable" | "remove" | "provision";

async function requestMachines(): Promise<MachineSnapshot> {
  const response = await fetch("/_local/machines", { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (response.status === 404) throw new Error("Machine controls are available only through the local macOS gateway. Run node scripts/remote-setup.mjs start in the repository to restore it.");
  if (!response.ok) throw new Error(`Machine status failed (${response.status})`);
  return response.json();
}

async function performAction<T = { message?: string; error?: string; id?: string; name?: string }>(body: Record<string, string>): Promise<T> {
  const response = await fetch("/_local/machines", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(650000),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Machine action failed (${response.status})`);
  return result;
}

export function MachinesDialog({ onClose }: { onClose: () => void }) {
  const bridge = useBridge();
  const titleId = useId();
  const [snapshot, setSnapshot] = useState<MachineSnapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [hostProbe, setHostProbe] = useState<{ host: string; remote: RemoteStatus | null; sshError: string | null } | null>(null);
  const [label, setLabel] = useState("");
  const [session, setSession] = useState("default");
  const [pending, setPending] = useState<{ action: Action; machine: ManagedMachine } | null>(null);
  const [rename, setRename] = useState<{ machine: ManagedMachine; value: string } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusReturn();
  useEffect(() => closeRef.current?.focus(), []);

  useEffect(() => { if (pending) confirmRef.current?.focus(); }, [pending]);

  const refresh = useCallback(async () => {
    setChecking(true);
    try { setSnapshot(await requestMachines()); setError(""); }
    catch (caught) { setSnapshot(null); setError(caught instanceof Error ? caught.message : "Could not check machines"); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    const onOnline = () => void refresh();
    const onOffline = () => { setSnapshot(null); setError("Network offline; machine status is unavailable"); };
    const onVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const browserBackend = (machine: ManagedMachine) => bridge.store.backends.find((backend) =>
    backend.baseUrl.replace(/\/$/, "").endsWith(`/bridges/${machine.id}`));
  const syncBrowser = async (action: Action | "add", machine: ManagedMachine | null, result: { id?: string; name?: string }) => {
    if ((action === "add" || action === "provision") && result.id) {
      const url = `${window.location.origin}/bridges/${result.id}`;
      const existing = bridge.store.backends.find((backend) => backend.baseUrl === url);
      if (existing) bridge.setBridgeEnabled(existing.id, true);
      else await bridge.addBackend({ name: result.name || label || target, baseUrl: url }, true);
      return;
    }
    if (!machine) return;
    const backend = browserBackend(machine);
    if (!backend) return;
    if (action === "remove") bridge.deleteBackend(backend.id);
    else if (action === "disable" || action === "enable") bridge.setBridgeEnabled(backend.id, action === "enable");
    else if (action === "rename" && rename) await bridge.updateBackend(backend.id, { name: rename.value, baseUrl: backend.baseUrl });
  };
  const act = async (action: Action | "add", machine: ManagedMachine | { id: string } | null, extra: Record<string, string> = {}) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await performAction({ action, ...(machine ? { id: machine.id } : {}), ...extra });
      setNotice(result.message || "Machine updated");
      setPending(null); setRename(null);
      if (action === "add") { setTarget(""); setLabel(""); setSession("default"); }
      let profileError = "";
      try { await syncBrowser(action, machine && "name" in machine ? machine : null, result); }
      catch (caught) { profileError = `Machine updated, but the browser profile could not be synchronized: ${caught instanceof Error ? caught.message : String(caught)}`; }
      await refresh();
      if (profileError) setError(profileError);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Machine action failed"); }
    finally { setBusy(false); }
  };
  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    void act("add", null, { host: target.trim(), label: label.trim(), session: session.trim() });
  };
  const checkHost = async () => {
    setBusy(true); setError(""); setHostProbe(null);
    try { setHostProbe(await performAction<{ host: string; remote: RemoteStatus | null; sshError: string | null }>({ action: "probeHost", host: target.trim() })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not check SSH target"); }
    finally { setBusy(false); }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      if (pending) setPending(null);
      else if (rename) setRename(null);
      else onClose();
    } else trapFocusWithin(event);
  };

  return <div className="overlay-root">
    <button className="overlay-scrim" type="button" tabIndex={-1} aria-label="Close Machines" onClick={onClose} />
    <div className="modal machines-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="machines-heading"><h2 className="modal-title" id={titleId}>Machines</h2>
        <button className="btn" type="button" onClick={() => void refresh()} disabled={checking || busy}>{checking ? "Checking…" : "Refresh"}</button>
        <button ref={closeRef} className="btn" type="button" onClick={onClose}>Close</button></div>
      {error ? <p className="machines-error" role="alert">{error}</p> : null}
      {notice ? <p className="machines-notice" role="status">{notice}</p> : null}
      {snapshot ? <p className="palette-hint">Checked {new Date(snapshot.checkedAt).toLocaleTimeString()}{checking ? " · refreshing…" : ""}</p> : null}
      {snapshot ? <details className="machine-card"><summary>Local Herdr diagnostics</summary>
        <DiagnosticDetails diagnostics={snapshot.local} /></details> : null}
      {snapshot?.machines.map((machine) => {
        const backend = browserBackend(machine);
        const diagnosis = machine.diagnosis;
        return <section className="machine-card" key={machine.id} aria-label={machine.name}>
          <div className="machine-card-heading"><strong>{machine.name}</strong><span data-state={checking ? "checking" : diagnosis.state}>{checking ? "Checking…" : diagnosis.message}</span></div>
          <p className="palette-hint">{machine.host} · session {machine.session}</p>
          <dl className="machine-layers">
            <div><dt>Browser profile</dt><dd>{backend ? bridge.enabledBridgeIds.includes(backend.id) ? "Enabled" : "Disabled" : "Missing"}</dd></div>
            <div><dt>Gateway / tunnel</dt><dd>{machine.job ? "Running" : "Stopped"} / {machine.tunnel ? "Connected" : "Unavailable"}</dd></div>
            <div><dt>SSH</dt><dd>{machine.sshError || "Reachable"}</dd></div>
            <div><dt>Forwarded agent</dt><dd>{machine.remote?.forwardedAgent ? "Usable over fresh SSH" : "Unavailable"}{machine.remote?.stableAgent ? " · supplied to Herdr" : " · not supplied to Herdr"}</dd></div>
            <div><dt>Herdr</dt><dd>{machine.remote?.server?.split("\n").slice(0, 2).join(" · ") || "Unknown"}</dd></div>
            <div><dt>Bridge / snapshot</dt><dd>{machine.remote?.bridgeService || "Unknown"} / {machine.snapshot ? "Live" : "Unavailable"}</dd></div>
          </dl>
          {machine.remote?.stalePaneCount ? <p className="machines-warning">{machine.remote.stalePaneCount} pane shell(s) inherited an expired SSH agent socket. Recreate those idle panes after reconnecting Herdr; do not restart a working agent.</p> : null}
          {diagnosis.layer === "authentication" || diagnosis.layer === "network" ? <p className="machines-warning">Complete VPN or SSH authentication in a terminal, then reconnect the tunnel here.</p> : null}
          <div className="machine-actions">
            {!backend && machine.snapshot ? <button className="btn" type="button" disabled={busy} onClick={() => void syncBrowser("add", null, { id: machine.id, name: machine.name }).then(refresh).catch((caught) => setError(String(caught)))}>Add browser profile</button> : null}
            <button className="btn" type="button" disabled={busy} onClick={() => void act("restartTunnel", machine)}>Reconnect tunnel</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void act("startBridge", machine)}>Start bridge</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void act("restartBridge", machine)}>Restart bridge</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void act("repairBridge", machine)}>Repair bridge</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setRename({ machine, value: machine.name })}>Rename</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void act(machine.enabled && machine.saved?.enabled !== false ? "disable" : "enable", machine)}>{machine.enabled && machine.saved?.enabled !== false ? "Disable" : "Enable"}</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setPending({ action: "remove", machine })}>Remove</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setPending({ action: "forceBridge", machine })}>Replace bridge…</button>
          </div>
          <details><summary>Recent bridge logs</summary><pre className="machine-logs">{machine.remote?.logs || "No logs available"}</pre></details>
          {machine.remote ? <details><summary>Herdr sessions, integrations, and configuration</summary>
            <DiagnosticDetails diagnostics={machine.remote} /></details> : null}
        </section>;
      })}
      {busy ? <p className="palette-hint" role="status">Working… A first source build on a remote may take several minutes.</p> : null}
      {snapshot ? <form className="machine-add" onSubmit={submitAdd}>
        <h3>Add machine</h3>
        <p className="palette-hint">Requires reachable SSH and a running compatible Herdr server. The remote bridge and tunnel are then provisioned automatically.</p>
        <label>SSH target<input required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*" value={target} onChange={(event) => { setTarget(event.target.value); setHostProbe(null); }} placeholder="workbox" /></label>
        <button className="btn" type="button" disabled={busy || !target.trim()} onClick={() => void checkHost()}>Check SSH and sessions</button>
        {hostProbe ? <div className="machine-card" role="status"><strong>{hostProbe.host}</strong>
          {hostProbe.sshError ? <p className="machines-warning">{hostProbe.sshError}</p> : <><p>SSH reachable · forwarded agent {hostProbe.remote?.forwardedAgent ? "usable" : "unavailable"}</p>
            <pre className="machine-logs">{hostProbe.remote?.sessions || "No session list available"}</pre></>}</div> : null}
        <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Workbox" /></label>
        <label>Herdr session<input required value={session} onChange={(event) => setSession(event.target.value)} /></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Working…" : "Add machine"}</button>
      </form> : null}
      {snapshot?.unconfigured.length ? <section className="machine-card"><h3>Saved machines without a web bridge</h3>
        {snapshot.unconfigured.map((machine) => <div className="machine-unconfigured" key={machine.id}>
          <span>{machine.name} · {machine.host}/{machine.session}</span>
          <button className="btn" type="button" disabled={busy || !machine.enabled} title={!machine.enabled ? "Enable this machine in Herdr first" : undefined} onClick={() => void act("provision", { id: machine.id })}>Provision</button>
        </div>)}
      </section> : null}
      {rename ? <form className="machine-confirm" onSubmit={(event) => { event.preventDefault(); void act("rename", rename.machine, { label: rename.value }); }}>
        <label>Rename {rename.machine.name}<input autoFocus required value={rename.value} onChange={(event) => setRename({ ...rename, value: event.target.value })} /></label>
        <button className="btn" type="submit" disabled={busy}>Save</button><button className="btn" type="button" onClick={() => setRename(null)}>Cancel</button>
      </form> : null}
      {pending ? <div className="machine-confirm" role="group" aria-label="Confirm machine action">
        <p>{pending.action === "remove" ? `Remove ${pending.machine.name} from Herdr and this browser? Its remote Herdr session and processes will keep running.` : `Replace all Herdr Web bridge instances on ${pending.machine.name}? Connected web clients will be interrupted.`}</p>
        <button ref={confirmRef} className="btn" type="button" disabled={busy} onClick={() => void act(pending.action, pending.machine)}>Confirm</button>
        <button className="btn" type="button" onClick={() => setPending(null)}>Cancel</button>
      </div> : null}
    </div>
  </div>;
}

function DiagnosticDetails({ diagnostics }: { diagnostics: Diagnostics }) {
  return <div className="machine-diagnostics">
    {(["status", "sessions", "integrations", "configCheck"] as const).map((key) =>
      <div key={key}><strong>{({ status: "Status and version", sessions: "Sessions", integrations: "Integrations", configCheck: "Configuration" })[key]}</strong>
        <pre className="machine-logs">{diagnostics[key] || "Unavailable"}</pre></div>)}
  </div>;
}
