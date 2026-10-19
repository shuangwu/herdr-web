import type { PaneInfo, WorkspaceInfo } from "./types";
import type { LauncherPresetOption } from "./launcherPresets";

export type SplitDirection = "right" | "down";

export type LaunchSpec = {
  presetId: string;
  label: string;
  title: string;
};

export type LaunchTarget =
  | { mode: "workspace" }
  | { mode: "tab"; workspaceId: string }
  | { mode: "split"; pane: PaneInfo; direction: SplitDirection };

export function firstPaneLaunchTarget(
  workspaces: readonly WorkspaceInfo[],
  preferredWorkspaceId?: string,
): Exclude<LaunchTarget, { mode: "split" }> {
  const workspace = workspaces.find((item) => item.workspace_id === preferredWorkspaceId)
    ?? workspaces.find((item) => item.focused)
    ?? workspaces[0];
  return workspace ? { mode: "tab", workspaceId: workspace.workspace_id } : { mode: "workspace" };
}

export function launchPresetLabel(presetId: string, options: readonly LauncherPresetOption[]) {
  return options.find((option) => option.id === presetId)?.label ?? "Shell";
}

export function resolveLaunchSpec(spec: LaunchSpec, existingPanes: readonly PaneInfo[]): LaunchSpec {
  if (spec.presetId === "builtin:shell" || spec.title !== spec.label) {
    return spec;
  }

  const used = new Set(
    existingPanes
      .flatMap((pane) => [pane.label, pane.display_agent, pane.agent, pane.title])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
  if (!used.has(spec.title)) {
    return spec;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${spec.title} ${index}`;
    if (!used.has(candidate)) {
      return { ...spec, title: candidate };
    }
  }

  return { ...spec, title: `${spec.title} ${Date.now()}` };
}
