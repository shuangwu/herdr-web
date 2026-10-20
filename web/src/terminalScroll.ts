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

// Mouse-tracking apps previously received one report per wheel event. Scale
// that rate and retain fractions so slower and non-integer speeds also work.
export class TrackedWheelSteps {
  #pending = 0;

  reset() {
    this.#pending = 0;
  }

  take(deltaY: number, speed: number) {
    if (deltaY === 0) return 0;
    const direction = Math.sign(deltaY);
    if (Math.sign(this.#pending) !== direction) this.reset();
    this.#pending += direction * speed;
    const steps = Math.trunc(this.#pending);
    this.#pending -= steps;
    return steps;
  }
}
