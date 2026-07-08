import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Modal-dialog focus behaviour for the study's overlays (lab, record). They stay
 * MOUNTED when closed (display:none) so their state survives open/close — so this
 * is keyed on `open`, not mount: when the overlay opens it captures the trigger,
 * moves focus inside, and traps Tab within; when it closes it restores focus to
 * the trigger. Pair with role="dialog" aria-modal + a tabindex=-1 root so the
 * container itself can hold focus when nothing else is focusable yet.
 */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>) {
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    trigger.current = document.activeElement as HTMLElement | null;
    const first = root.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === root)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      trigger.current?.focus?.();
    };
  }, [open, ref]);
}
