/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FocusTooltip } from "./FocusTooltip";

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => { document.body.innerHTML = ""; });

it("shows an icon title on keyboard focus and hides it when focus leaves", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<FocusTooltip />));
  const icon = document.createElement("button");
  icon.title = "New tab (⌘N)";
  icon.setAttribute("aria-label", "New tab");
  const next = document.createElement("button");
  document.body.append(icon, next);
  await act(async () => icon.focus());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("New tab (⌘N)");
  await act(async () => next.focus());
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => root.unmount());
});
