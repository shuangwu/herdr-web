import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { trapFocusWithin, useFocusReturn } from "./overlayFocus";

const shortcuts = [
  ["Open command palette", "⌘K"],
  ["Show shortcut help", "⌘/"],
  ["Move through sidebar rows / open / return to terminal", "↑↓ / Enter / Esc"],
  ["Open sidebar row actions", "⇧F10 / Menu"],
  ["Switch to visible tab 1–9 across hosts", "⌘1–9"],
  ["Alternate tab selection when browser reserves ⌘1–9", "⌘⌥1–9"],
  ["Move through tabs", "⌘⇧← / →"],
  ["Move through agents", "⌘⇧↑ / ↓"],
  ["Move between panes", "⌘H / J / K / L"],
  ["Cycle panes in a tab", "⌘Tab / ⌘⇧Tab"],
  ["New tab", "⌘N · ⌘⇧T"],
  ["New pane (split right)", "⌘T"],
  ["Close pane, or tab if last", "⌘W · ⌘⇧X"],
  ["Split pane right / down", "⌘⇧- / ⌘⇧V"],
];

export const shortcutPeek = [
  ["Command palette", "⌘K"],
  ["All shortcuts", "⌘/"],
  ["Tab 1–9", "⌘1–9"],
  ["Previous/next tab", "⌘⇧←/→"],
  ["Previous/next agent", "⌘⇧↑/↓"],
  ["Focus pane", "⌘H/J/K/L"],
  ["New tab", "⌘N"],
  ["New pane", "⌘T"],
  ["Close pane/tab", "⌘W"],
  ["Split right/down", "⌘⇧-/V"],
] as const;

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useFocusReturn();
  useEffect(() => searchRef.current?.focus(), []);
  const visible = shortcuts.filter(([label, keys]) =>
    `${label} ${keys}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else {
      trapFocusWithin(event);
    }
  };
  return (
    <div className="overlay-root">
      <button className="overlay-scrim" type="button" tabIndex={-1} aria-label="Close shortcut help" onClick={onClose} />
      <div className="modal shortcut-help" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <h2 className="modal-title" id={titleId}>Keyboard shortcuts</h2>
        <p className="modal-message">A Space is Herdr’s workspace: a project container for tabs and terminal panes.</p>
        <input ref={searchRef} className="palette-search" type="search" aria-label="Search keyboard shortcuts"
          value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shortcuts…" />
        <dl className="shortcut-list">{visible.map(([label, keys]) => (
          <div key={label}><dt>{label}</dt><dd>{keys}</dd></div>
        ))}</dl>
        {visible.length === 0 ? <p className="palette-empty">No matching shortcuts</p> : null}
        <p className="palette-hint">Some browser or operating-system shortcuts may take priority.</p>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
