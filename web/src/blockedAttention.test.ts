import { describe, expect, it } from "vitest";
import { blockedAttentionPanes, blockedPaneKey, diffBlockedPaneStatuses } from "./blockedAttention";
import type { PaneInfo } from "./types";

const pane = (status: PaneInfo["agent_status"], paneId = "pane-1"): PaneInfo => ({
  pane_id: paneId, terminal_id: "terminal-1", workspace_id: "workspace-1", tab_id: "tab-1",
  focused: false, agent_status: status, revision: 1,
});

describe("blocked attention", () => {
  it("uses the first snapshot as a baseline and alerts only on a new blocked transition", () => {
    const baseline = diffBlockedPaneStatuses(null, "host", [pane("blocked")]);
    expect(baseline.entered).toEqual([]);
    expect(diffBlockedPaneStatuses(baseline.current, "host", [pane("blocked")]).entered).toEqual([]);
    const working = diffBlockedPaneStatuses(baseline.current, "host", [pane("working")]);
    expect(working.cleared).toEqual([blockedPaneKey("host", pane("blocked"))]);
    expect(diffBlockedPaneStatuses(working.current, "host", [pane("blocked")]).entered).toHaveLength(1);
  });

  it("clears removed panes and lists blocked panes across hosts", () => {
    const baseline = diffBlockedPaneStatuses(null, "host", [pane("blocked")]);
    expect(diffBlockedPaneStatuses(baseline.current, "host", []).cleared).toHaveLength(1);
    expect(blockedAttentionPanes([
      { bridgeId: "a", bridgeLabel: "Office", panes: [pane("blocked")], workspaces: [{ workspace_id: "workspace-1", label: "Project" }] },
      { bridgeId: "b", bridgeLabel: "Home", panes: [pane("working")], workspaces: [] },
    ])).toMatchObject([{ bridgeId: "a", bridgeLabel: "Office", workspaceLabel: "Project" }]);
  });
});
