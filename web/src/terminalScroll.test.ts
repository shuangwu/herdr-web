import { describe, expect, it } from "vitest";
import { normalizeWheelLines, TrackedWheelSteps } from "./terminalScroll";

describe("terminal wheel scrolling", () => {
  it("scales pixel, line and page deltas without changing direction", () => {
    for (const [deltaMode, deltaY, expected] of [[0, 160, 4], [1, 10, 4], [2, 1, 16]]) {
      const event = { deltaMode, deltaY };
      expect(normalizeWheelLines(event, 40, 0.4)).toBe(expected);
      expect(normalizeWheelLines(event, 40, 0.4 * 3)).toBe(expected * 3);
      expect(normalizeWheelLines({ ...event, deltaY: -deltaY }, 40, 0.4 * 3)).toBe(-expected * 3);
    }
    expect(normalizeWheelLines({ deltaMode: 0, deltaY: 0 }, 40, 2)).toBe(0);
  });

  it("keeps one report per event at default speed and speeds up tracked apps", () => {
    const wheel = new TrackedWheelSteps();
    expect(wheel.take(120, 1)).toBe(1);
    expect(wheel.take(-120, 1)).toBe(-1);
    expect(wheel.take(120, 3)).toBe(3);
    expect(wheel.take(-120, 3)).toBe(-3);
    expect(wheel.take(0, 3)).toBe(0);
  });

  it("retains fractional reports and cancels them on direction or speed changes", () => {
    const wheel = new TrackedWheelSteps();
    expect(wheel.take(120, 0.5)).toBe(0);
    expect(wheel.take(120, 0.5)).toBe(1);
    expect(wheel.take(120, 1.5)).toBe(1);
    expect(wheel.take(120, 1.5)).toBe(2);
    expect(wheel.take(120, 0.5)).toBe(0);
    expect(wheel.take(-120, 0.5)).toBe(-0);
    expect(wheel.take(-120, 0.5)).toBe(-1);
    expect(wheel.take(120, 0.5)).toBe(0);
    wheel.reset();
    expect(wheel.take(120, 0.5)).toBe(0);
  });
});
