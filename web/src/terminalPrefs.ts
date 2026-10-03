export const DEFAULT_TERMINAL_FONT_SIZE_PX = 13;
export type TerminalTheme = "catppuccin" | "solarized";
export type TerminalFont = "system" | "menlo" | "jetbrains";
export const DEFAULT_TERMINAL_THEME: TerminalTheme = "catppuccin";
export const DEFAULT_TERMINAL_FONT: TerminalFont = "system";
export const TERMINAL_FONT_FAMILIES: Record<TerminalFont, string> = {
  system: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "JetBrainsMono Nerd Font Mono", monospace',
  menlo: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  jetbrains: '"JetBrainsMono Nerd Font Mono Full", monospace',
};
export const TERMINAL_THEMES = {
  catppuccin: {
    background: "#11111b", foreground: "#cdd6f4", cursor: "#f5e0dc", selectionBackground: "#45475a",
    black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af", blue: "#89b4fa",
    magenta: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de", brightBlack: "#585b70",
    brightRed: "#f38ba8", brightGreen: "#a6e3a1", brightYellow: "#f9e2af", brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7", brightCyan: "#94e2d5", brightWhite: "#a6adc8",
  },
  solarized: {
    background: "#002b36", foreground: "#839496", cursor: "#93a1a1", selectionBackground: "#073642",
    black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2",
    magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5", brightBlack: "#002b36",
    brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83", brightBlue: "#839496",
    brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3",
  },
} as const;
export function parseTerminalTheme(value: unknown): TerminalTheme {
  return value === "solarized" ? "solarized" : DEFAULT_TERMINAL_THEME;
}
export function parseTerminalFont(value: unknown): TerminalFont {
  return value === "menlo" || value === "jetbrains" ? value : DEFAULT_TERMINAL_FONT;
}
export const MIN_TERMINAL_FONT_SIZE_PX = 10;
export const MAX_TERMINAL_FONT_SIZE_PX = 24;
export const DEFAULT_DESKTOP_COMMAND_COMPOSER = false;
export const DEFAULT_DESKTOP_COMMAND_ENTER_NEWLINE = true;

export function defaultTerminalCursorBlink(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
) {
  return !platform.toLowerCase().startsWith("win");
}

export function parseTerminalFontSizePx(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TERMINAL_FONT_SIZE_PX;
  }
  return Math.min(
    MAX_TERMINAL_FONT_SIZE_PX,
    Math.max(MIN_TERMINAL_FONT_SIZE_PX, Math.round(value)),
  );
}

export function parseDesktopCommandComposer(
  value: unknown,
  fallback = DEFAULT_DESKTOP_COMMAND_COMPOSER,
) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseDesktopCommandEnterNewline(
  value: unknown,
  fallback = DEFAULT_DESKTOP_COMMAND_ENTER_NEWLINE,
) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseTerminalCursorBlink(
  value: unknown,
  fallback = defaultTerminalCursorBlink(),
) {
  return typeof value === "boolean" ? value : fallback;
}
