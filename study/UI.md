# UI conventions

The study's colour and type layers were systematised from the start (see the header of
`src/styles.css`). Its **spatial** layer was not: a 2026-07-21 audit found 821 raw px literals
against 3 spatial tokens — 27 font sizes on a 0.5px drift ladder, every integer radius from 2
to 10, both `99px` and `999px` doing "pill" — plus Unicode glyphs standing in for icons and 28
native `title` tooltips. This file is the standard that replaced all three.

## The scale

Defined in `src/styles.css`, in a `:root` block after the palettes (it is theme-independent).
The steps were **derived from what the design already used** — the largest cluster in each band
became the step — so applying them was mostly lossless rather than a re-design.

| group   | tokens                                                              |
| ------- | ------------------------------------------------------------------- |
| space   | `--space-px .5 1 1-5 2 2-5 3 3-5 4 5 6 7 8 10` → 1,2,4,6,8,10,12,14,16,20,24,28,32,40 |
| radius  | `--radius-xs sm md lg pill` → 3, 5, 8, 12, 999                       |
| type    | `--text-2xs xs sm md lg xl 2xl 3xl 4xl 5xl` → 9, 10.5, 11, 12, 13.5, 15, 17, 21, 26, 30 |
| leading | `--leading-tight snug normal read` → 1.25, 1.35, 1.5, 1.65           |
| icon    | `--icon-xs sm md lg` → 12, 14, 16, 20                                |
| stroke  | `--border-hair` 1px, `--border` 1.5px                                |
| motion  | `--dur-fast` 120ms, `--dur-slow` 200ms, `--ease`                     |
| elev    | `--elev-popover`, `--elev-overlay`                                   |

**Pick a step.** If nothing fits, the scale is wrong and gains a step — don't reintroduce a
literal. A raw px value is a bug unless a comment says why; optical alignment against a specific
line box is the one honest reason (`.node`'s `margin-top` is the canonical example). `--text-5xl`
is what that rule looks like in practice: the sweep left two `30px` page headings stranded above
the top step, and the answer was the missing step, not two justified literals.

Not everything is spacing. Component measures (a 232px rail, a 760px reading measure), viewport
breakpoints, hairlines, and anything inside an SVG `viewBox` answer to their content or their
maths, not to a rhythm — snapping those would look systematic without being so. The convention
applied here: snap when the nearest step is within 4px, leave it otherwise, and say why once per
region rather than at every line.

When snapping an off-scale value, take the nearest step; on a tie round **down**, because tight
chrome spacing that grows is more noticeable than spacing that tightens. `1px` hairlines,
`0`, `100%`, `50%`, viewport units, and geometry inside a lab's SVG `viewBox` are not spacing —
leave them.

## Icons

`src/ui/icons.tsx` is the only door. Two populations:

**`<Icon name size filled label />`** wraps a curated lucide set. Never import `lucide-react`
anywhere else — that is how inconsistency creeps back. Registry:

| was  | name       | for                                    |
| ---- | ---------- | -------------------------------------- |
| `✓`  | `check`    | pass, complete                          |
| `✗ ×`| `x`        | fail, dismiss, close                    |
| `⚠`  | `warn`     | doctor warnings                         |
| `≡`  | `record`   | the record overlay                      |
| `◇ ◆`| `diamond`  | the lab, "has a visualization", boss-check (`filled` for `◆`) |
| `⚙`  | `prefs`    | terminal preferences                    |
| `▷`  | `run`      | run checks                              |
| `▸`  | `expand`   | collapsed disclosure                    |
| `▾`  | `collapse` | expanded disclosure                     |

Sizes come from the icon scale and carry **optical stroke compensation** — lucide draws on a
24-unit viewBox, so a fixed stroke thins as the icon shrinks. The size→strokeWidth pairs hold
the rendered stroke at ~1.33px (the weight of `--border`) at every step. Set `size`, never
`strokeWidth`.

`label` only when the icon is the *whole* control. Beside a text label it is decorative and
stays `aria-hidden` — otherwise a screen reader says the meaning twice.

**Hand-authored marks** carry the study's own design language, where exact geometry is
load-bearing: `<ModuleNode>` (the rail) and `<RecallMark>` (the quiz's ● ◐ ○ ◎ · grades). Both
draw classed sub-elements — `.node-shape`, `.node-check`, `.node-ring`, `.recall-ring`,
`.recall-fill` — whose **paint stays in the owning stylesheet**, so each region keeps expressing
its own state through selectors. `ui.css` sets only their structure.

Those structural rules are wrapped in `:where()`, which zeroes their specificity. `ui.css` loads
*after* both region stylesheets, so a plain `.node-shape { fill: none }` default there outranked
the region's real `fill` on source order alone — the phase-track line showed straight through
every incomplete node, and the fix looked like "add a parent selector" rather than "a default
should never have been competing". Keep new resets in `:where()` for the same reason.

**Punctuation is not iconography.** `·` `…` `→` `←` `↑`, and `×` as a multiplication sign in the
labs, stay as text.

## Tooltips and popovers

`title` is banned. It never appears on keyboard focus, can't be styled, truncates at the OS's
discretion, and its delay is untunable.

```tsx
<Tooltip content="Run the selected module's checks">
  <button>run checks</button>
</Tooltip>
```

- A tooltip **explains**; it never holds the only copy of something essential. An icon-only
  control still needs its own `aria-label`.
- Never leave a `title` alongside one — the browser renders the native tip over it.
- `wide` for tips that run to a sentence or two.
- Disabled controls are handled: the wrapper re-hosts them in a focusable span, because a
  disabled button is exactly when "why is this off?" needs answering.

`<Popover>` (Radix) for anything panel-shaped hanging off a control: portalled, so a pane's
overflow can't clip it, with outside-click and Escape dismissal, focus return, and collision
handling. The caller keeps owning `open`.

## Territories

The three stylesheets are strictly scoped, and nothing crosses:

| region | components                          | stylesheet          |
| ------ | ----------------------------------- | ------------------- |
| shell  | `App`, `components/*`               | `src/styles.css`    |
| record | `state/*`                           | `src/state/state.css` |
| lab    | `lab/*`, `lab/labs/*`               | `src/lab/lab.css`   |

Shared tokens live in `styles.css`; shared primitives in `src/ui/`. Keep it that way — the
scoping is what makes the three regions independently editable.

## Lint

`eslint-plugin-jsx-a11y` runs over `study/**` with its recommended set and no rule turned off.
The repo also fails on unused disable directives, so any `eslint-disable` here is load-bearing.
