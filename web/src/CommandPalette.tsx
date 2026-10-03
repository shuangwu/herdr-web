import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { trapFocusWithin, useFocusReturn } from "./overlayFocus";

export type PaletteEntry = {
  id: string;
  kind: string;
  label: string;
  detail?: string;
  shortcut?: string;
  search?: string;
  onSelect: () => void;
};

export function filterPaletteEntries(entries: readonly PaletteEntry[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const text = `${entry.kind} ${entry.label} ${entry.detail ?? ""} ${entry.shortcut ?? ""} ${entry.search ?? ""}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function CommandPalette({ entries, onClose }: { entries: readonly PaletteEntry[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [keyboardNavTick, setKeyboardNavTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const keyboardSelectionRef = useRef(false);
  const titleId = useId();
  const resultsId = useId();
  const { targetRef, skipFocusReturn } = useFocusReturn();
  const matches = useMemo(() => filterPaletteEntries(entries, query).slice(0, 60), [entries, query]);
  const active = Math.min(selected, matches.length - 1);

  useEffect(() => inputRef.current?.focus(), []);
  useLayoutEffect(() => {
    if (!keyboardSelectionRef.current) return;
    keyboardSelectionRef.current = false;
    const list = resultsRef.current;
    const row = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !row) return;
    const viewport = list.getBoundingClientRect();
    const selectedRow = row.getBoundingClientRect();
    if (selectedRow.bottom > viewport.bottom) list.scrollTop += selectedRow.bottom - viewport.bottom;
    else if (selectedRow.top < viewport.top) list.scrollTop -= viewport.top - selectedRow.top;
  }, [active, matches, keyboardNavTick]);

  const choose = (entry: PaletteEntry) => {
    if (entry.kind === "Action") {
      onClose();
      window.requestAnimationFrame(() => {
        targetRef.current?.focus({ preventScroll: true });
        entry.onSelect();
      });
      return;
    }
    skipFocusReturn();
    onClose();
    entry.onSelect();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      inputRef.current?.focus();
      if (matches.length > 0) {
        keyboardSelectionRef.current = true;
        setKeyboardNavTick((tick) => tick + 1);
        setSelected((current) => (Math.min(current, matches.length - 1) + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
      }
    } else if (event.key === "Enter" && event.target === inputRef.current && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else {
      trapFocusWithin(event);
    }
  };

  return (
    <div className="overlay-root">
      <button className="overlay-scrim" type="button" tabIndex={-1} aria-label="Close command palette" onClick={onClose} />
      <div className="modal command-palette" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <h2 className="modal-title" id={titleId}>Go to or run a command</h2>
        <input ref={inputRef} className="palette-search" type="search" value={query}
          aria-label="Search commands, hosts, spaces, tabs, and panes"
          aria-controls={resultsId}
          onChange={(event) => { keyboardSelectionRef.current = false; if (resultsRef.current) resultsRef.current.scrollTop = 0; setQuery(event.target.value); setSelected(0); }}
          placeholder="Search hosts, spaces, tabs, panes, actions…" />
        <div ref={resultsRef} className="palette-results" id={resultsId} aria-live="polite">
          {matches.length === 0 ? <p className="palette-empty">No matching commands</p> : matches.map((entry, index) => (
            <button key={entry.id} type="button" className="palette-result" data-active={index === active}
              aria-current={index === active ? "true" : undefined}
              onPointerMove={() => { keyboardSelectionRef.current = false; setSelected(index); }} onClick={() => choose(entry)}>
              <span className="palette-result-kind">{entry.kind}</span>
              <span className="palette-result-label">{entry.label}</span>
              {entry.shortcut ? <kbd className="palette-result-shortcut" aria-label={`Shortcut ${entry.shortcut}`}>{entry.shortcut}</kbd> : null}
              {entry.detail ? <span className="palette-result-detail">{entry.detail}</span> : null}
            </button>
          ))}
        </div>
        <span className="sr-only" aria-live="polite">
          {matches.length} results{matches[active] ? `, selected ${matches[active].kind} ${matches[active].label}${matches[active].detail ? ` on ${matches[active].detail}` : ""}` : ""}
        </span>
        <p className="palette-hint">↑↓ select · Enter open · Esc close</p>
      </div>
    </div>
  );
}
