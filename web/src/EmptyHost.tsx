import { Plus, Terminal } from "lucide-react";

export function EmptyHost({ hostLabel, launchAvailable, busy, compact = false, onCreatePane }: {
  hostLabel: string;
  launchAvailable: boolean;
  busy: boolean;
  compact?: boolean;
  onCreatePane: () => void;
}) {
  return (
    <div className={`empty-host${compact ? " empty-host-compact" : ""}`}>
      <Terminal size={compact ? 24 : 36} aria-hidden="true" />
      <strong>No panes on {hostLabel}</strong>
      <p>Start a shell or agent to get working.</p>
      <button type="button" className="btn btn-primary" disabled={busy || !launchAvailable}
        title="New pane (⌘N or ⌘T)" aria-keyshortcuts="Meta+n Meta+t" onClick={onCreatePane}>
        <Plus size={16} aria-hidden="true" /> New pane
      </button>
      {!launchAvailable ? <span>Update this host’s bridge to enable the launcher.</span> : null}
    </div>
  );
}
