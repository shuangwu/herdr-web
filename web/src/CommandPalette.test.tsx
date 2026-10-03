/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommandPalette, filterPaletteEntries } from "./CommandPalette";
import type { PaletteEntry } from "./CommandPalette";

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => { document.body.innerHTML = ""; });

it("searches host and space context and opens the keyboard-selected destination", async () => {
  const openFovea = vi.fn();
  const openTiebiao = vi.fn();
  const entries: PaletteEntry[] = [
    { id: "f", kind: "Tab", label: "Build", detail: "Fovea · ndas", onSelect: openFovea },
    { id: "t", kind: "Tab", label: "Build", detail: "Tiebiao · ndas", onSelect: openTiebiao },
  ];
  expect(filterPaletteEntries(entries, "tiebiao build").map((entry) => entry.id)).toEqual(["t"]);

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  await act(async () => root.render(<CommandPalette entries={entries} onClose={onClose} />));
  const input = host.querySelector<HTMLInputElement>("input");
  expect(document.activeElement).toBe(input);
  await act(async () => {
    if (!input) throw new Error("missing input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "tiebiao build");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelectorAll(".palette-result")).toHaveLength(1);
  await act(async () => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  expect(openTiebiao).toHaveBeenCalledOnce();
  expect(openFovea).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

it("scrolls the keyboard-selected result into view without stationary mouse hover changing it", async () => {
  const entries: PaletteEntry[] = [
    { id: "a", kind: "Tab", label: "First", onSelect: vi.fn() },
    { id: "b", kind: "Tab", label: "Second", onSelect: vi.fn() },
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<CommandPalette entries={entries} onClose={vi.fn()} />));
  const input = host.querySelector<HTMLInputElement>("input");
  const list = host.querySelector<HTMLElement>(".palette-results");
  const rows = host.querySelectorAll<HTMLElement>(".palette-result");
  if (!input || !list || rows.length !== 2) throw new Error("missing palette elements");
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 40 } as DOMRect);
  vi.spyOn(rows[1], "getBoundingClientRect").mockReturnValue({ top: 40, bottom: 70 } as DOMRect);
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
  expect(rows[1].dataset.active).toBe("true");
  expect(list.scrollTop).toBe(30);
  await act(async () => rows[0].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })));
  expect(rows[1].dataset.active).toBe("true");
  await act(async () => root.unmount());
});

it("shows available shortcuts and finds actions by shortcut", async () => {
  const entries: PaletteEntry[] = [
    { id: "new-tab", kind: "Action", label: "Create tab", shortcut: "⌘N", onSelect: vi.fn() },
    { id: "machine", kind: "Action", label: "Manage machines", onSelect: vi.fn() },
  ];
  expect(filterPaletteEntries(entries, "⌘N").map((entry) => entry.id)).toEqual(["new-tab"]);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<CommandPalette entries={entries} onClose={vi.fn()} />));
  expect(host.querySelector<HTMLElement>(".palette-result-shortcut")?.textContent).toBe("⌘N");
  expect(host.querySelectorAll(".palette-result-shortcut")).toHaveLength(1);
  await act(async () => root.unmount());
});
