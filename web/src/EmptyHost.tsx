import { Plus, Terminal } from "lucide-react";

export function EmptyHost({ hostLabel, launchAvailable, busy, compact = false, onCreatePane,
  connectionStatus = "ready", unavailableReason, onReconnect, onManageMachines }: {
  hostLabel: string;
  launchAvailable: boolean;
  busy: boolean;
  compact?: boolean;
  onCreatePane: () => void;
  connectionStatus?: "ready" | "connecting" | "unavailable";
  unavailableReason?: string;
  onReconnect?: () => void;
  onManageMachines?: () => void;
}) {
  const disconnected = connectionStatus === "unavailable";
  const connecting = connectionStatus === "connecting";
  return (
    <div className={`empty-host${compact ? " empty-host-compact" : ""}`}>
      <Terminal size={compact ? 24 : 36} aria-hidden="true" />
      <strong>{disconnected ? `Connect to ${hostLabel}` : connecting ? `Connecting to ${hostLabel}…` : `Create a pane on ${hostLabel}`}</strong>
      <p>{disconnected ? "Reconnect this host to view or create panes." : connecting ? "Checking for open panes." : "Start a shell or agent to get working."}</p>
      {disconnected && onReconnect ? (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onReconnect}>
          {busy ? "Reconnecting…" : `Reconnect ${hostLabel}`}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy || !launchAvailable}
          title={unavailableReason || "New pane (⌘N or ⌘T)"} aria-keyshortcuts="Meta+n Meta+t" onClick={onCreatePane}>
          <Plus size={16} aria-hidden="true" /> New pane
        </button>
      )}
      {!launchAvailable && !connecting ? <span>{unavailableReason || "Update this host’s bridge to enable the launcher."}</span> : null}
      {disconnected && onManageMachines ? <button className="btn" type="button" onClick={onManageMachines}>Machine settings</button> : null}
    </div>
  );
}
