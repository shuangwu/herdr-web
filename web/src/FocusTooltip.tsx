import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Tip = { text: string; left: number; top: number; above: boolean };

/** Show icon-button title text when reached with the keyboard. Hover keeps the browser's native title. */
export function FocusTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const show = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches('button[title][aria-label], [role="button"][title][aria-label]')) {
        setTip(null);
        return;
      }
      const label = target.getAttribute("title")?.trim();
      if (!label) { setTip(null); return; }
      const rect = target.getBoundingClientRect();
      const above = rect.bottom + 72 > window.innerHeight;
      setTip({ text: label, left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
        top: above ? rect.top - 8 : rect.bottom + 8, above });
    };
    const hide = () => setTip(null);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  return tip ? createPortal(<div className="focus-tooltip" role="tooltip" style={{ left: tip.left, top: tip.top,
    transform: tip.above ? "translateY(-100%)" : undefined }}>{tip.text}</div>, document.body) : null;
}
