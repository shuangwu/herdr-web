/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "./App";
import { EmptyHost } from "./EmptyHost";
import { TerminalView } from "./TerminalView";
import { CommandDraftContext, createCommandDraftStore } from "./commandDrafts";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});

describe("pane creation without an existing pane", () => {
  it("keeps the top-right creation button available before a host snapshot exists", async () => {
    const create = vi.fn();
    await act(async () => root.render(<TabBar bridgeId="long" numberedTabs={[]}
      snapshot={null} activeSpace={null} selectedPane={null} onSelectTab={vi.fn()}
      onCreateTab={vi.fn()} onCreatePane={create} onMenu={vi.fn()} />));
    const button = container.querySelector<HTMLButtonElement>('.tabbar-add[aria-label="New pane"]');
    expect(button).not.toBeNull(); button?.click(); expect(create).toHaveBeenCalledOnce();
  });

  it("replaces the terminal's passive empty message with the creation prompt", async () => {
    const create = vi.fn();
    await act(async () => root.render(<CommandDraftContext.Provider value={createCommandDraftStore()}>
      <TerminalView bridgeId="long" pane={null} connectionKey="long" resumeToken={0}
        httpUrl={(path) => path} wsUrl={(path) => path} autoFocus={false}
        emptyState={<EmptyHost hostLabel="Long" launchAvailable busy={false} onCreatePane={create} />} />
    </CommandDraftContext.Provider>));
    expect(container.textContent).toContain("Create a pane on Long");
    expect(container.textContent).not.toContain("No panes available");
    expect(container.querySelector(".terminal-upload-fab")).toBeNull();
    container.querySelector<HTMLButtonElement>(".empty-host button")?.click();
    expect(create).toHaveBeenCalledOnce();
  });

  it("offers recovery instead of pretending a disconnected host has no panes", async () => {
    const reconnect = vi.fn();
    await act(async () => root.render(<EmptyHost hostLabel="Long" launchAvailable={false}
      busy={false} connectionStatus="unavailable" onCreatePane={vi.fn()} onReconnect={reconnect} />));
    expect(container.textContent).toContain("Reconnect this host to view or create panes.");
    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toBe("Reconnect Long"); button?.click();
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
