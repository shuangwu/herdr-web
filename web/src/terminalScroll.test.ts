import { describe, expect, it } from "vitest";
import { normalizeWheelLines, WheelStepAccumulator } from "./terminalScroll";

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

  it("scales small pixel and single-line wheel events after normalization", () => {
    for (const event of [{ deltaMode: 0, deltaY: 4 }, { deltaMode: 1, deltaY: 1 }]) {
      for (const speed of [1, 3, 5, 10, 20, 50]) {
        const wheel = new WheelStepAccumulator();
        expect(wheel.take(normalizeWheelLines(event, 40, 0.4), speed)).toBe(speed);
        expect(wheel.take(normalizeWheelLines({ ...event, deltaY: -event.deltaY }, 40, 0.4), speed)).toBe(-speed);
      }
      const slower = new WheelStepAccumulator();
      const base = normalizeWheelLines(event, 40, 0.4);
      expect(slower.take(base, 0.5)).toBe(0);
      expect(slower.take(base, 0.5)).toBe(1);
    }
    const wheel = new WheelStepAccumulator();
    expect(wheel.take(normalizeWheelLines({ deltaMode: 0, deltaY: 160 }, 40, 0.4), 3)).toBe(12);
  });

  it("keeps one report per event at default speed and speeds up tracked apps", () => {
    const wheel = new WheelStepAccumulator();
    expect(wheel.take(1, 1)).toBe(1);
    expect(wheel.take(-1, 1)).toBe(-1);
    expect(wheel.take(1, 3)).toBe(3);
    expect(wheel.take(-1, 3)).toBe(-3);
    expect(wheel.take(0, 3)).toBe(0);
  });

  it("retains fractional reports and cancels them on direction or speed changes", () => {
    const wheel = new WheelStepAccumulator();
    expect(wheel.take(1, 0.5)).toBe(0);
    expect(wheel.take(1, 0.5)).toBe(1);
    expect(wheel.take(1, 1.5)).toBe(1);
    expect(wheel.take(1, 1.5)).toBe(2);
    expect(wheel.take(1, 0.5)).toBe(0);
    expect(wheel.take(-1, 0.5)).toBe(-0);
    expect(wheel.take(-1, 0.5)).toBe(-1);
    expect(wheel.take(1, 0.5)).toBe(0);
    wheel.reset();
    expect(wheel.take(1, 0.5)).toBe(0);
  });
});
