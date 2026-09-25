import type { AgentStatus, PaneInfo } from "./types";

export type BlockedAttentionPane = {
  bridgeId: string;
  bridgeLabel: string;
  pane: PaneInfo;
  workspaceLabel: string;
};

export function blockedPaneKey(bridgeId: string, pane: Pick<PaneInfo, "pane_id" | "terminal_id">) {
  return JSON.stringify([bridgeId, pane.pane_id, pane.terminal_id]);
}

export function diffBlockedPaneStatuses(
  previous: ReadonlyMap<string, AgentStatus> | null,
  bridgeId: string,
  panes: readonly PaneInfo[],
) {
  const current = new Map(panes.map((pane) => [blockedPaneKey(bridgeId, pane), pane.agent_status]));
  const entered: PaneInfo[] = [];
  const cleared: string[] = [];
  if (previous) {
    for (const pane of panes) {
      const key = blockedPaneKey(bridgeId, pane);
      if (pane.agent_status === "blocked" && previous.has(key) && previous.get(key) !== "blocked") {
        entered.push(pane);
      }
    }
    for (const [key, status] of previous) {
      if (status === "blocked" && current.get(key) !== "blocked") {
        cleared.push(key);
      }
    }
  }
  return { current, entered, cleared };
}

export function blockedAttentionPanes(
  views: readonly { bridgeId: string; bridgeLabel: string; panes: readonly PaneInfo[]; workspaces: readonly { workspace_id: string; label: string }[] }[],
): BlockedAttentionPane[] {
  return views.flatMap((view) =>
    view.panes.filter((pane) => pane.agent_status === "blocked").map((pane) => ({
      bridgeId: view.bridgeId,
      bridgeLabel: view.bridgeLabel,
      pane,
      workspaceLabel: view.workspaces.find((workspace) => workspace.workspace_id === pane.workspace_id)?.label || "Workspace",
    })),
  );
}
