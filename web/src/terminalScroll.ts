// Preserve the existing scrollback conversion while allowing a user multiplier.
export function normalizeWheelLines(
  event: Pick<WheelEvent, "deltaMode" | "deltaY">,
  rows: number,
  sensitivity: number,
) {
  const unit = event.deltaMode === 2 ? rows : event.deltaMode === 1 ? 1 : 1 / 16;
  const rawLines = event.deltaY * unit * sensitivity;
  if (Math.abs(rawLines) < 1) return Math.sign(rawLines);
  return Math.trunc(rawLines);
}

// Scale whole terminal steps after normalizing the wheel delta. Retain
// fractions so small wheel movements respond to every speed, including <1×.
export class WheelStepAccumulator {
  #pending = 0;

  reset() {
    this.#pending = 0;
  }

  take(lines: number, speed: number) {
    if (lines === 0) return 0;
    const direction = Math.sign(lines);
    if (Math.sign(this.#pending) !== direction) this.reset();
    this.#pending += lines * speed;
    const steps = Math.trunc(this.#pending);
    this.#pending -= steps;
    return steps;
  }
}
