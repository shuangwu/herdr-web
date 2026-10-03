import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { createCommands } from "./commands";
import type { CommandResult } from "./commands";
import type { BridgeRuntime } from "./bridge";
import type { WorkspaceInfo } from "./types";
import { trapFocusWithin, useFocusReturn } from "./overlayFocus";

type Worktree = { path: string; branch?: string; label: string; is_linked_worktree: boolean;
  is_prunable: boolean; open_workspace_id?: string };
type Source = { repo_name: string; repo_root: string; source_checkout_path: string };

export function WorktreesDialog({ runtime, workspace, busy, onRun, onClose }: {
  runtime: BridgeRuntime;
  workspace: WorkspaceInfo;
  busy: boolean;
  onRun: (action: () => Promise<CommandResult>, selectCreated?: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const removeCancelRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreRemoveFocusRef = useRef(false);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("");
  const [path, setPath] = useState("");
  const [remove, setRemove] = useState<Worktree | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const commands = createCommands(runtime.httpUrl);
  const supported = new Set(runtime.capabilities?.commands ?? []);
  useFocusReturn();
  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    if (remove) removeCancelRef.current?.focus();
    else if (restoreRemoveFocusRef.current) {
      restoreRemoveFocusRef.current = false;
      (removeTriggerRef.current?.isConnected ? removeTriggerRef.current : closeRef.current)?.focus();
    }
  }, [remove]);

  const cancelRemove = () => { restoreRemoveFocusRef.current = true; setRemove(null); };

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await commands.listWorktrees(workspace.workspace_id);
      setSource(response.source as Source);
      setWorktrees((response.worktrees as Worktree[]) ?? []);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not list worktrees"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [runtime.id, workspace.workspace_id]);
  const mutate = async (action: () => Promise<CommandResult>, selectCreated = false) => {
    setError("");
    if (!await onRun(action, selectCreated)) return false;
    await refresh();
    return true;
  };
  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const name = branch.trim();
    if (!name) return;
    void mutate(() => commands.createWorktree(workspace.workspace_id, name, base.trim() || undefined, path.trim() || undefined), true).then((ok) => {
      if (ok) { setBranch(""); setBase(""); setPath(""); }
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !busy && !loading) { event.preventDefault(); if (remove) cancelRemove(); else onClose(); }
    else trapFocusWithin(event);
  };
  return <div className="overlay-root">
    <button className="overlay-scrim" type="button" tabIndex={-1} aria-label="Close Worktrees" onClick={onClose} />
    <div className="modal worktrees-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="machines-heading"><h2 className="modal-title" id={titleId}>Worktrees</h2>
        <button className="btn" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Loading…" : "Refresh"}</button>
        <button ref={closeRef} className="btn" type="button" onClick={onClose}>Close</button></div>
      <p className="palette-hint">{runtime.label} · {workspace.label}{source ? ` · ${source.repo_root}` : ""}</p>
      {error ? <p className="machines-error" role="alert">{error}</p> : null}
      <div className="worktree-list">{worktrees.map((item) => <div className="worktree-row" key={item.path}>
        <div><strong>{item.label || item.branch || item.path}</strong><span>{item.branch || "Detached"} · {item.path}</span>
          {item.is_prunable ? <small>Prunable</small> : null}</div>
        {supported.has("worktree.open") && !item.open_workspace_id ? <button className="btn" type="button" disabled={busy} onClick={() => void mutate(() => commands.openWorktree(workspace.workspace_id, item.path), true)}>Open Space</button> : null}
        {item.open_workspace_id ? <small>Open as {item.open_workspace_id}</small> : null}
        {supported.has("worktree.remove") && item.open_workspace_id && item.is_linked_worktree ? <button className="btn" type="button" disabled={busy} onClick={(event) => { removeTriggerRef.current = event.currentTarget; setRemove(item); }}>Remove…</button> : null}
      </div>)}</div>
      {worktrees.length === 0 && !loading ? <p className="palette-hint">No worktrees found for this repository.</p> : null}
      {supported.has("worktree.create") ? <form className="worktree-create" onSubmit={submitCreate}>
        <h3>Create worktree</h3>
        <p className="palette-hint">Preview: Herdr creates a linked checkout from {source?.source_checkout_path || workspace.label} and opens a new Space.</p>
        <label>New branch<input required value={branch} maxLength={120} onChange={(event) => setBranch(event.target.value)} placeholder="feature/name" /></label>
        <label>Base revision (optional)<input value={base} onChange={(event) => setBase(event.target.value)} placeholder="current branch" /></label>
        <label>Checkout path (optional)<input value={path} onChange={(event) => setPath(event.target.value)} placeholder="Herdr chooses a path" /></label>
        <button className="btn" type="submit" disabled={busy || !branch.trim()}>Create worktree and Space</button>
      </form> : null}
      {remove ? <div className="machine-confirm" role="group" aria-label="Confirm worktree removal">
        <p>Remove the linked worktree at <strong>{remove.path}</strong>? Herdr will close its Space. Review any uncommitted files before proceeding.</p>
        <button className="btn" type="button" disabled={busy} onClick={() => {
          const id = remove.open_workspace_id;
          if (id) void mutate(() => commands.removeWorktree(id)).then((ok) => { if (ok) cancelRemove(); });
        }}>Remove worktree</button>
        <button ref={removeCancelRef} className="btn" type="button" onClick={cancelRemove}>Cancel</button>
      </div> : null}
    </div>
  </div>;
}
