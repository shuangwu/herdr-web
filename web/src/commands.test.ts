import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commands,
  createCommands,
  createdPaneId,
} from "./commands";

describe("command helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const newSpace = {
    workspace: { workspace_id: "new-space" },
    tab: { tab_id: "initial-tab" },
    root_pane: { pane_id: "initial-pane" },
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("reuses the first shell pane when starting on a host without Spaces", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(newSpace))
      .mockResolvedValueOnce(json({ type: "ok" }));
    const result = await createCommands((path) => `http://empty-host${path}`).launchPresetWorkspace({
      presetId: "builtin:shell", label: "Shell", title: "My shell",
    });
    expect(result).toMatchObject({ workspace_id: "new-space", tab_id: "initial-tab", pane_id: "initial-pane", title: "My shell" });
    expect(fetchMock.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) }))).toEqual([
      { url: "http://empty-host/api/command", body: { method: "workspace.create", params: { focus: true } } },
      { url: "http://empty-host/api/command", body: { method: "pane.rename", params: { pane_id: "initial-pane", label: "My shell" } } },
    ]);
  });

  it("launches an agent through the existing remote launcher and removes only its setup shell", async () => {
    const launched = { preset_id: "custom:agent", title: "Agent", workspace_id: "new-space", tab_id: "agent-tab", pane_id: "agent-pane" };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(newSpace))
      .mockResolvedValueOnce(json(launched))
      .mockResolvedValueOnce(json({ type: "ok" }));
    expect(await createCommands((path) => `http://empty-host${path}`).launchPresetWorkspace({
      presetId: "custom:agent", label: "Agent", title: "Agent",
    })).toEqual(launched);
    expect(fetchMock.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) }))).toEqual([
      { url: "http://empty-host/api/command", body: { method: "workspace.create", params: { focus: true } } },
      { url: "http://empty-host/api/launcher-presets/launch", body: { preset_id: "custom:agent", title: "Agent", target: { mode: "tab", workspace_id: "new-space" } } },
      { url: "http://empty-host/api/command", body: { method: "tab.close", params: { tab_id: "initial-tab" } } },
    ]);
  });

  it("rolls back only the newly created Space if the chosen preset fails to launch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(newSpace))
      .mockResolvedValueOnce(json({ error: "Agent is unavailable" }, 500))
      .mockResolvedValueOnce(json({ type: "ok" }));
    await expect(commands.launchPresetWorkspace({ presetId: "builtin:codex", label: "Codex", title: "Codex" }))
      .rejects.toThrow("Agent is unavailable");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      method: "workspace.close", params: { workspace_id: "new-space", close_group: false },
    });
  });

  it("preserves and selects a successfully launched agent if setup-shell cleanup fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(newSpace))
      .mockResolvedValueOnce(json({ workspace_id: "new-space", tab_id: "agent-tab", pane_id: "agent-pane" }))
      .mockResolvedValueOnce(json({ error: "Shell tab is busy" }, 500));
    const result = await commands.launchPresetWorkspace({ presetId: "builtin:codex", label: "Codex", title: "Codex" });
    expect(result.pane_id).toBe("agent-pane");
    expect(result.warning).toContain("Shell tab is busy");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("finds created pane ids from supported response shapes", () => {
    expect(createdPaneId({ pane_id: "top" })).toBe("top");
    expect(createdPaneId({ root_pane: { pane_id: "root" } })).toBe("root");
    expect(createdPaneId({ pane: { pane_id: "pane" } })).toBe("pane");
    expect(createdPaneId({ agent: { pane_id: "agent" } })).toBe("agent");
    expect(createdPaneId({ move_result: { pane: { pane_id: "moved" } } })).toBe("moved");
    expect(createdPaneId({})).toBeNull();
  });

  it("uses injected bridge URLs for commands", async () => {
    const httpUrl = (path: string) => `http://192.168.1.20:4000${path}`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ type: "ok" }), {
        status: 200,
      }),
    );

    await createCommands(httpUrl).closePane("pane-1");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://192.168.1.20:4000/api/command",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates a workspace using the selected bridge and explicit source workspace", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ input, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    const remote = createCommands((path) => `http://remote:4000${path}`);
    await remote.createWorkspace("space-selected");
    await remote.createWorkspace();

    expect(requests).toEqual([
      {
        input: "http://remote:4000/api/command",
        body: {
          method: "workspace.create",
          params: { focus: true, source_workspace_id: "space-selected" },
        },
      },
      {
        input: "http://remote:4000/api/command",
        body: { method: "workspace.create", params: { focus: true } },
      },
    ]);
  });

  it("clears workspace and tab names with null labels", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    await commands.renameWorkspace("space-1", null);
    await commands.renameTab("tab-1", null);

    expect(requests).toEqual([
      { method: "workspace.rename", params: { workspace_id: "space-1", label: null } },
      { method: "tab.rename", params: { tab_id: "tab-1", label: null } },
    ]);
  });

  it("moves workspace blocks through the atomic Herdr command", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    await commands.moveWorkspaceBlock(["space-root", "space-child"], "space-before");

    expect(requests).toEqual([
      {
        method: "workspace.move_block",
        params: {
          workspace_ids: ["space-root", "space-child"],
          before_workspace_id: "space-before",
        },
      },
    ]);
  });

  it("closes workspace groups only with explicit authorization", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    await commands.closeWorkspace("space-1");
    await commands.closeWorkspace("space-1", true);

    expect(requests).toEqual([
      { method: "workspace.close", params: { workspace_id: "space-1", close_group: false } },
      { method: "workspace.close", params: { workspace_id: "space-1", close_group: true } },
    ]);
  });

  it("launches presets through the bridge-owned launch endpoint", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ input, body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          preset_id: "remote-codex",
          title: "Remote Codex",
          workspace_id: "space-1",
          tab_id: "tab-1",
          pane_id: "pane-1",
        }),
        { status: 200 },
      );
    });

    await commands.launchPresetSplit("pane-0", "tab-0", "right", {
      presetId: "remote-codex",
      label: "Remote Codex",
      title: "Remote Codex",
    });

    expect(requests).toEqual([
      {
        input: "/api/launcher-presets/launch",
        body: {
          preset_id: "remote-codex",
          title: "Remote Codex",
          target: {
            mode: "split",
            target_pane_id: "pane-0",
            tab_id: "tab-0",
            direction: "right",
          },
        },
      },
    ]);
  });

  it("launches preset tabs through the bridge-owned launch endpoint", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ input, body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          preset_id: "builtin:shell",
          title: "Review",
          workspace_id: "space-1",
          tab_id: "tab-1",
          pane_id: "pane-1",
        }),
        { status: 200 },
      );
    });

    await commands.launchPresetTab("space-1", {
      presetId: "builtin:shell",
      label: "Shell",
      title: "Review",
    });

    expect(requests).toEqual([
      {
        input: "/api/launcher-presets/launch",
        body: {
          preset_id: "builtin:shell",
          title: "Review",
          target: { mode: "tab", workspace_id: "space-1" },
        },
      },
    ]);
  });
});
