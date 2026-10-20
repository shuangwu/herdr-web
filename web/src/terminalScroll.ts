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

export function sendTerminalScroll(socket: Pick<WebSocket, "send">, lines: number) {
  if (!Number.isFinite(lines)) return;
  const steps = Math.min(Math.abs(Math.trunc(lines)), 200);
  if (steps === 0) return;
  // Herdr ignores `lines` when a terminal app owns scrolling. Send unit steps
  // so both app wheel actions and host scrollback keep the scaled distance,
  // including when connecting through an older remote bridge.
  const frame = JSON.stringify({ type: "scroll", direction: lines < 0 ? "up" : "down", lines: 1 });
  for (let step = 0; step < steps; step += 1) socket.send(frame);
}
