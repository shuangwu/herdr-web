export type TerminalMouseAction = "press" | "release" | "move" | "wheel-up" | "wheel-down";

export function encodeTerminalMouse(
  action: TerminalMouseAction,
  button: number,
  column: number,
  row: number,
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean },
  sgr: boolean,
): string | null {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 1 || row < 1) return null;
  if (action !== "wheel-up" && action !== "wheel-down" &&
      ![0, 1, 2].includes(button) && !(action === "move" && button === 3)) return null;
  const base = action === "wheel-up" ? 64 : action === "wheel-down" ? 65 :
    action === "release" && !sgr ? 3 : button + (action === "move" ? 32 : 0);
  const code = base + (modifiers.shift ? 4 : 0) + (modifiers.alt ? 8 : 0) + (modifiers.ctrl ? 16 : 0);
  if (sgr) return `\x1b[<${code};${column};${row}${action === "release" ? "m" : "M"}`;
  if (column > 223 || row > 223) return null;
  return `\x1b[M${String.fromCharCode(code + 32, column + 32, row + 32)}`;
}
