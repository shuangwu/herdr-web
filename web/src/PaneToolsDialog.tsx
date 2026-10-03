import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { createCommands } from "./commands";
import type { CommandResult, PaneFocusDirection } from "./commands";
import type { BridgeRuntime } from "./bridge";
import type { PaneInfo, Snapshot } from "./types";
import { trapFocusWithin, useFocusReturn } from "./overlayFocus";

export function PaneToolsDialog({ runtime, pane, snapshot, busy, onRun, onClose }: {
  runtime: BridgeRuntime;
  pane: PaneInfo;
  snapshot: Snapshot;
  busy: boolean;
  onRun: (action: () => Promise<CommandResult>, selectCreated?: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [targetTab, setTargetTab] = useState("");
  const [swapTarget, setSwapTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const commands = createCommands(runtime.httpUrl);
  const supported = new Set(runtime.capabilities?.commands ?? []);
  const otherPanes = snapshot.panes.filter((item) => item.tab_id === pane.tab_id && item.pane_id !== pane.pane_id);
  const otherTabs = snapshot.tabs.filter((item) => item.tab_id !== pane.tab_id && snapshot.panes.some((p) => p.tab_id === item.tab_id));
  const isAgent = Boolean(pane.agent || pane.display_agent || (pane.state_labels && Object.keys(pane.state_labels).length > 0));
  useFocusReturn();
  useEffect(() => closeRef.current?.focus(), []);

  useEffect(() => {
    if (!targetTab && otherTabs.length) setTargetTab(otherTabs[0].tab_id);
    if (!swapTarget && otherPanes.length) setSwapTarget(otherPanes[0].pane_id);
  }, [otherTabs, otherPanes, targetTab, swapTarget]);

  const read = async (action: () => Promise<CommandResult>, field: string) => {
    setLoading(true); setError("");
    try {
      const response = await action();
      setDetail(JSON.stringify(response[field] ?? response, null, 2));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read pane details"); }
    finally { setLoading(false); }
  };
  const run = async (action: () => Promise<CommandResult>, selectCreated = false) => {
    setError("");
    const ok = await onRun(action, selectCreated);
    if (ok) setDetail("Action completed");
    return ok;
  };
  const submitPrompt = (event: FormEvent) => {
    event.preventDefault();
    if (prompt.trim()) void run(() => commands.promptAgent(pane.pane_id, prompt.trim())).then((ok) => { if (ok) setPrompt(""); });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy && !loading) { event.preventDefault(); onClose(); }
    else trapFocusWithin(event);
  };

  return <div className="overlay-root">
    <button className="overlay-scrim" type="button" tabIndex={-1} aria-label="Close pane tools" onClick={onClose} />
    <div className="modal pane-tools-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="machines-heading"><h2 className="modal-title" id={titleId}>Pane tools</h2><button ref={closeRef} className="btn" type="button" onClick={onClose}>Close</button></div>
      <p className="palette-hint">{runtime.label} · {pane.pane_id} · {pane.label || pane.title || pane.agent || "Terminal"}</p>
      {error ? <p className="machines-error" role="alert">{error}</p> : null}
      <div className="pane-tool-actions">
        {supported.has("pane.zoom") ? <button className="btn" type="button" disabled={busy} onClick={() => void run(() => commands.zoomPane(pane.pane_id))}>Toggle zoom</button> : null}
        {supported.has("pane.process_info") ? <button className="btn" type="button" disabled={loading} onClick={() => void read(() => commands.paneProcessInfo(pane.pane_id), "process_info")}>Process details</button> : null}
        {isAgent && supported.has("agent.explain") ? <button className="btn" type="button" disabled={loading} onClick={() => void read(() => commands.explainAgent(pane.pane_id), "explain")}>Explain agent detection</button> : null}
      </div>
      {supported.has("pane.resize") && otherPanes.length ? <fieldset className="pane-tool-group"><legend>Resize split</legend>
        {(["left", "right", "up", "down"] as PaneFocusDirection[]).map((direction) =>
          <button className="btn" type="button" key={direction} disabled={busy} onClick={() => void run(() => commands.resizePane(pane.pane_id, direction))}>{direction}</button>)}</fieldset> : null}
      {supported.has("pane.swap") && otherPanes.length ? <div className="pane-tool-group"><label>Swap with pane
        <select value={swapTarget} onChange={(event) => setSwapTarget(event.target.value)}>{otherPanes.map((item) => <option key={item.pane_id} value={item.pane_id}>{item.label || item.title || item.pane_id}</option>)}</select></label>
        <button className="btn" type="button" disabled={busy || !swapTarget} onClick={() => void run(() => commands.swapPanes(pane.pane_id, swapTarget))}>Swap</button></div> : null}
      {supported.has("pane.move") && otherTabs.length ? <div className="pane-tool-group"><label>Move into existing tab
        <select value={targetTab} onChange={(event) => setTargetTab(event.target.value)}>{otherTabs.map((tab) => <option key={tab.tab_id} value={tab.tab_id}>{tab.label || `Tab ${tab.number}`}</option>)}</select></label>
        <button className="btn" type="button" disabled={busy || !targetTab} onClick={() => {
          const anchor = snapshot.panes.find((item) => item.tab_id === targetTab);
          if (anchor) void run(() => commands.movePaneToTab(pane.pane_id, targetTab, anchor.pane_id), true);
        }}>Move pane</button></div> : null}
      {isAgent && supported.has("agent.prompt") ? <form className="pane-tool-group" onSubmit={submitPrompt}><label>Prompt agent
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} maxLength={16384} placeholder="Message to the agent…" /></label>
        <button className="btn" type="submit" disabled={busy || !prompt.trim()}>Send prompt</button></form> : null}
      {detail ? <pre className="pane-tool-detail">{detail}</pre> : null}
    </div>
  </div>;
}
