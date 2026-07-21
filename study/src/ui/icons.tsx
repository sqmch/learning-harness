/* ── icons — one surface, one optical grid ─────────────────────────────────
   Every icon in the study used to be a Unicode glyph in a text node (≡ ◇ ◆ ⚙
   ✓ ✗ ⚠ × ▷ ▾ ▸ ● ◐ ○ ◎). Glyphs inherit text metrics, so they can't be
   optically centred, they change weight and shape with the font stack, and any
   transform on their box transforms the glyph with it — which is how the rail's
   completed boss-check node ended up with a checkmark rotated 45° along with
   its diamond.

   Two populations live here:

   1. `Icon` wraps a CURATED lucide set for standard UI verbs. Importing lucide
      directly is how inconsistency creeps back in, so the registry below is the
      only door — add a name here rather than reaching past it.
   2. Hand-authored marks (`ModuleNode`, `RecallMark`) carry the study's OWN
      design language, where the exact geometry is load-bearing and no icon set
      has the right primitive. Both expose classed sub-elements so their fills
      and strokes stay in CSS with everything else.

   Typographic punctuation — · … → ← ↑ and × as a multiplication sign in the
   labs — is NOT iconography and stays as text. */

import {
  Check,
  ChevronDown,
  ChevronRight,
  Diamond,
  NotebookText,
  Play,
  Settings2,
  TriangleAlert,
  X,
} from "lucide-react";

const REGISTRY = {
  check: Check, // pass, complete
  x: X, // fail, dismiss, close
  warn: TriangleAlert, // doctor warnings
  record: NotebookText, // the record overlay (was ≡)
  diamond: Diamond, // the lab, "has a visualization", boss-check (was ◇ ◆)
  prefs: Settings2, // terminal preferences (was ⚙)
  run: Play, // run checks (was ▷)
  expand: ChevronRight, // collapsed disclosure (was ▸)
  collapse: ChevronDown, // expanded disclosure (was ▾)
} as const;

export type IconName = keyof typeof REGISTRY;
export type IconSize = "xs" | "sm" | "md" | "lg";

/* Optical compensation. lucide draws on a 24-unit viewBox, so a fixed
   strokeWidth thins as the icon shrinks and thickens as it grows. These pairs
   hold the RENDERED stroke at ~1.33px at every step — the same weight as
   --border — so icons sit level with the rules and borders around them instead
   of reading lighter at 12px and heavier at 20px. */
const STROKE: Record<IconSize, number> = {
  xs: 2.6, // 12px → 1.30px
  sm: 2.3, // 14px → 1.34px
  md: 2.0, // 16px → 1.33px
  lg: 1.7, // 20px → 1.42px
};

export function Icon(props: {
  name: IconName;
  size?: IconSize;
  /** Fills the glyph as well as stroking it — the ◆ (boss) to ◇ (lab)
   *  distinction, kept as one icon with two weights rather than two icons. */
  filled?: boolean;
  /** Give a label ONLY when the icon stands alone as the whole control. Beside
   *  a text label it is decorative and must stay hidden from screen readers,
   *  or it reads the meaning out twice. */
  label?: string;
  className?: string;
}) {
  const { name, size = "sm", filled, label, className } = props;
  const Glyph = REGISTRY[name];
  return (
    <Glyph
      className={["icon", `icon-${size}`, className].filter(Boolean).join(" ")}
      strokeWidth={STROKE[size]}
      fill={filled ? "currentColor" : "none"}
      absoluteStrokeWidth={false}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}

/* ── the rail's module node ────────────────────────────────────────────────
   Drawn, not typeset. The diamond is a PATH, so the completed check inside it
   is never rotated — the bug that made this component necessary. Every paint
   is left to CSS via the classed parts (.node-shape, .node-check, .node-ring)
   so the rail keeps expressing status the way it already did, with selectors
   rather than props.

   Geometry: a 20-unit box. The circle sits at r=6; the diamond's half-diagonal
   is 6.6 rather than 6 because equal radii make a diamond read visibly smaller
   than a circle — it encloses about a third less area. The ring rides outside
   both at 8.6, leaving the box edge clear so it never clips. */
const DIAMOND = "M10 3.4 L16.6 10 L10 16.6 L3.4 10 Z";
const DIAMOND_RING = "M10 1.4 L18.6 10 L10 18.6 L1.4 10 Z";
const CHECK = "M6.9 10.1 L9 12.2 L13.1 8";

export function ModuleNode(props: {
  /** Boss-check modules are diamonds; everything else is a circle. */
  boss?: boolean;
  /** Draws the check — the module is complete. */
  complete?: boolean;
  /** Ephemeral check-run ring. CSS colours it and pulses the running state. */
  ring?: "running" | "pass" | "fail" | "crash" | null;
  className?: string;
}) {
  const { boss, complete, ring, className } = props;
  return (
    <svg viewBox="0 0 20 20" className={["node", className].filter(Boolean).join(" ")} aria-hidden>
      {ring &&
        (boss ? (
          <path d={DIAMOND_RING} className={`node-ring node-ring-${ring}`} />
        ) : (
          <circle cx="10" cy="10" r="8.6" className={`node-ring node-ring-${ring}`} />
        ))}
      {boss ? (
        <path d={DIAMOND} className="node-shape" strokeLinejoin="round" />
      ) : (
        <circle cx="10" cy="10" r="6" className="node-shape" />
      )}
      {complete && (
        <path d={CHECK} className="node-check" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/* ── the quiz's recall marks ───────────────────────────────────────────────
   Shape carries the grade, never colour — a deliberate choice the glyph set
   (● ◐ ○ ◎ ·) already made, kept intact here. Redrawn because ◐ in particular
   is the least reliable glyph in the set: fonts disagree on which half is
   filled, and several fall back to a different face for it entirely. */
export type RecallResult = "correct" | "partial" | "wrong" | "tutored" | "rescheduled";

export function RecallMark(props: { result: RecallResult; className?: string }) {
  const { result, className } = props;
  const cls = ["recall-mark", `recall-${result}`, className].filter(Boolean).join(" ");
  return (
    <svg viewBox="0 0 16 16" className={cls} aria-hidden>
      {result === "rescheduled" ? (
        <circle cx="8" cy="8" r="1.6" className="recall-fill" />
      ) : (
        <>
          <circle cx="8" cy="8" r="5.4" className="recall-ring" />
          {result === "correct" && <circle cx="8" cy="8" r="5.4" className="recall-fill" />}
          {result === "partial" && (
            /* the left half, closed across the diameter — unambiguous at 11px */
            <path d="M8 2.6 A5.4 5.4 0 0 0 8 13.4 Z" className="recall-fill" />
          )}
          {result === "tutored" && <circle cx="8" cy="8" r="2.4" className="recall-fill" />}
        </>
      )}
    </svg>
  );
}
