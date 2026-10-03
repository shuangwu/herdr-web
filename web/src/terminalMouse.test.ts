import { describe, expect, it } from "vitest";
import { encodeTerminalMouse } from "./terminalMouse";

const noModifiers = { shift: false, alt: false, ctrl: false };

describe("terminal mouse reporting", () => {
  it("reports a left click in SGR mode at one-based terminal cells", () => {
    expect(encodeTerminalMouse("press", 0, 80, 24, noModifiers, true)).toBe("\x1b[<0;80;24M");
    expect(encodeTerminalMouse("release", 0, 80, 24, noModifiers, true)).toBe("\x1b[<0;80;24m");
  });

  it("supports legacy mouse mode and modifier bits", () => {
    expect(encodeTerminalMouse("press", 0, 1, 1, noModifiers, false)).toBe("\x1b[M !!");
    expect(encodeTerminalMouse("release", 0, 1, 1, noModifiers, false)).toBe("\x1b[M#!!");
    expect(encodeTerminalMouse("press", 2, 2, 3, { shift: true, alt: true, ctrl: false }, true))
      .toBe("\x1b[<14;2;3M");
  });

  it("rejects coordinates that legacy mouse mode cannot encode", () => {
    expect(encodeTerminalMouse("press", 0, 224, 1, noModifiers, false)).toBeNull();
  });
});
