/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorktreesDialog } from "./WorktreesDialog";
import type { BridgeRuntime } from "./bridge";
import type { WorkspaceInfo } from "./types";

vi.mock("./commands", () => ({ createCommands: () => ({
  listWorktrees: async () => ({ source: { repo_name: "repo", repo_root: "/repo", source_checkout_path: "/repo" },
    worktrees: [{ path: "/repo/feature", branch: "feature", label: "feature", is_linked_worktree: true,
      is_prunable: false, open_workspace_id: "space-feature" }] }),
}) }));

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => { document.body.innerHTML = ""; });

it("focuses worktree removal confirmation and returns to its trigger on Escape", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const runtime = { id: "local", label: "Local", httpUrl: "http://localhost",
    capabilities: { commands: ["worktree.remove"] } } as unknown as BridgeRuntime;
  const workspace = { workspace_id: "space", label: "Space" } as WorkspaceInfo;
  await act(async () => root.render(<WorktreesDialog runtime={runtime} workspace={workspace}
    busy={false} onRun={async () => true} onClose={vi.fn()} />));
  const remove = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent === "Remove…");
  if (!remove) throw new Error("missing remove action");
  await act(async () => remove.click());
  const cancel = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent === "Cancel");
  expect(document.activeElement).toBe(cancel);
  await act(async () => cancel?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(remove);
  expect(host.querySelector('[aria-label="Confirm worktree removal"]')).toBeNull();
  await act(async () => root.unmount());
});
