import { describe, expect, it } from "vitest";
import { blockedClaimStorageKey, claimBlockedAlert } from "./blockedNotifications";

describe("blocked notification claims", () => {
  it("claims a blocked transition only once per pane and terminal", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(claimBlockedAlert(storage, "host/pane/terminal")).toBe(true);
    expect(claimBlockedAlert(storage, "host/pane/terminal")).toBe(false);
    expect(values.has(blockedClaimStorageKey("host/pane/terminal"))).toBe(true);
  });
});
