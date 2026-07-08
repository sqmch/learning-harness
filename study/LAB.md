# The Lab — visual intuition, wired to the course

A full-screen playground inside the study for **feeling** the concepts a lesson can only
describe, built for learners who understand pictures before notation. Two kinds of
visualization plug into one shell:

- **Stock labs** — polished interactives shipped with the engine (today: **Vectors &
  Similarity**, **Chunking & Overlap**, **Top-k Retrieval**, and **Precision & Recall**). The
  engine never decides which course they belong to: a module *claims* a stock lab by carrying
  its config key in `lab.json`.
- **Course-owned visuals** — self-contained HTML files the tutor generates per module
  (`curriculum/NN/visuals/*.html`, declared in `lab.json`), rendered in sandboxed iframes —
  full-screen here, or inline in the lesson via a ```visual fence.

A course with no claims shows no lab at all — a fresh clone has no ◇ button.

Launch: the **`◇ lab`** topbar button (opens on the current module's visual), the **◇ chips**
on a lesson's tab row (open directly on that visual), or `esc` to close.

## Why this exists

The learner hit the exact rock most people hit here: the word **"length" means two unrelated
things** — number of components (dimensionality, what `a.length` checks) vs. magnitude (how long
the arrow is, `‖A‖`). On paper that collision is invisible; on a draggable 2-D plane it's
obvious — normalize, and every arrow snaps to the same on-screen length while keeping its
direction. The lab makes that one image do the teaching. Notation is optional (a "show the
arithmetic" toggle), numbers and motion are primary.

This is **learning-serving supplementary content**, the kind the tutor generates as part of a
module (`CLAUDE.md` → Module generation). It is *not* one of the deferred platform features
(quiz UI, WebContainers, hosted edition, tutor-agent service), and it's exempt from the
displacement-trap guard for the same reason content/architecture work is: it serves the
current module directly.

## Design invariants (kept)

- **Owns zero durable state.** All lab state is ephemeral React state. Nothing is written to the
  repo; `progress.json` and the markdown remain the single source of truth. The course works
  identically with the lab closed or deleted.
- **Never disrupts the session.** The overlay renders *on top* of a still-mounted workspace, so
  the PTY terminal and course selection survive open/close untouched.
- **Additive & neutral.** Reuses the study's `:root` design tokens, so it inherits the app's
  two-theme neutral system for free — a paper-and-ink light theme and a near-black dark theme,
  no accent colour, hierarchy from size/weight/space. It also inherits the three type roles:
  the lab is an *instrument* surface, so labels are set in IBM Plex Sans and numeric readouts,
  ids, and axis ticks in IBM Plex Mono (the reading serif is reserved for lesson/journal prose).
  Hand-rolled SVG, thin lines, no colour of its own. The lab adds no dependencies (the engine
  bundles the three IBM Plex families once, offline). Everything lab-specific lives under
  `src/lab/`; the only edits outside it are a topbar button + `.lab-launch` style.

## Anatomy

```
study/src/lab/
  registry.ts                 ← the extensibility seam: LabDef[] + current-topic resolver
  LabOverlay.tsx              ← full-screen shell: lab rail + main pane + esc-to-close
  lab.css                     ← styles, all reusing the study tokens
  vec.ts                      ← 2-D vector helpers (the lab's plumbing — see note below)
  labs/
    VectorSimilarityLab.tsx   ← lab #1 (live)
    ChunkingOverlapLab.tsx    ← lab #2 (live, built with module 02)
```

Wiring into the study (the whole footprint):
- `App.tsx` — `labOpen` + `labTarget` state, the topbar button (hidden when the course claims
  nothing), and an always-mounted `<LabOverlay open=…/>` handed the course's modules.
- `DocPane.tsx` — the ◇ chips on the tab row, and the ```visual fence → sandboxed-iframe
  rendering for in-lesson embeds.
- `Rail.tsx` — the ◇ badge on modules that have visuals.
- `styles.css` / `lab.css` — `.lab-launch`, `.doc-visual-*`, `.lab-iframe`.
- `server/index.ts` — reads each module's optional `lab.json` into `module.lab`, and serves
  `GET /visual/<module>/<file>.html` from the module's `visuals/` dir under a CSP that blocks
  all network access (self-containment is enforced, not requested).
- `api.ts` — `ModuleLabConfig` / `VisualDef` / per-lab config types + `module.lab`.

Plus content: `curriculum/NN/lab.json` and `curriculum/NN/visuals/` (tutor-generated).

## The extensibility model

A **stock lab** is one entry in `STOCK_LABS` (`registry.ts`):

```ts
interface StockLab {
  id: string;             // = the lab.json config key that claims this lab
  title: string;
  blurb: string;          // one line: what you'll feel by playing with it
  component: ComponentType<LabProps>;
}
```

**To add a stock lab to the engine:**
1. Drop a component in `src/lab/labs/` (receives `LabProps = { config?, moduleId? }`;
   reads/writes only its own state).
2. Add a `STOCK_LABS` entry keyed by the `lab.json` config key that claims it.
3. Done. Any course whose module carries that key gets the lab: listed in the overlay,
   badged **current topic** when the learner is on a claiming module, chip on the lesson,
   fed that module's config.

**A course adds its own visual without touching the engine:** a self-contained
`visuals/*.html` in the module dir, declared under `lab.json.visuals` (and optionally
embedded in LESSON.md with a ```visual fence). The engine ships no course visuals — it only
renders what the course declares. Formats: `docs/FORMAT.md`.

### Two layers of course coupling

**Structural** — the claim itself. `buildEntries()` (`registry.ts`) walks the course's
modules and derives every openable visual from their `lab.json`s: stock claims (a module
carrying `"vectors": {…}` claims the vectors lab) and custom `visuals` entries. The overlay
gets `currentModule` from the course API and opens on the entry tied to where the learner
actually is; the lesson chips and rail badges come from the same derivation. No module ids
live in engine code.

**Content** — a per-module **`curriculum/NN/lab.json`** (read by the server, delivered as
`module.lab`, passed to the active lab when it matches the current module). This is what makes the
visualization *about the lesson*, not generic, and what the tutor edits mid-session when a
specific confusion surfaces. The lab re-seeds its vectors **only when `moduleId` changes** — so a
window-focus refetch or the learner's own dragging is never clobbered (the overlay also stays
mounted across open/close, preserving state). Display-only fields (axis labels, example texts,
presets, `focus`) reflect the latest `lab.json` on the next course fetch.

```jsonc
// curriculum/NN-name/lab.json
{
  "provenance": "tutor-generated",
  "focus": "one line: the live confusion this module's picture should target",
  "focusLab": "chunking",            // which lab the focus is written for; when several
                                     // labs claim the module, the overlay opens to this one
  "vectors": {                       // config for the "vectors" lab
    "axisX": "topic: account / login",   // human-meaning axis labels
    "axisY": "topic: food / cooking",
    "a": { "role": "query",    "text": "how do I reset my password?", "v": [2.5, 0.5] },
    "b": { "role": "document", "text": "I can't log into my account",  "v": [2.2, 0.75] },
    "presets": [                     // mirror the LESSON's worked examples
      { "label": "near-duplicate", "a": [2.5,0.5], "b": [2.2,0.75],
        "aText": "…", "bText": "…" }
    ]
  },
  "chunking": {                      // config for the "chunking" lab
    "text": "The dev server runs on port 5173 by default in Vite",  // words ≈ tokens
    "size": 5,                       // initial slider values — start at the *failure*
    "overlap": 0,                    // state so the rescue story plays forward
    "factSpan": [3, 7],              // half-open token range of the tracked fact
    "factLabel": "runs on port 5173",
    "presets": [ { "label": "overlap 2 — fact survives", "size": 5, "overlap": 2 } ]
  }
}
```

All fields optional; absent ones fall back to neutral defaults (`x-axis`/`y-axis`, no example
text, the built-in presets and default document). Plane range is ±3, so keep vector components
in that box.

**Generation & adaptation protocol** (enforced in `CLAUDE.md`):
- *At module generation:* if the module has load-bearing math/geometry, derive `lab.json` from the
  LESSON/BRIEF you just wrote — same examples, same vocabulary — so the picture and the prose
  agree. Skip it for modules with no spatial intuition.
- *During sessions:* when a session reveals a *specific* misconception, update `lab.json` — rewrite
  `focus`, swap presets to target the gap, relabel axes. Same "detect struggle → adapt" loop as
  hints; it touches tutor-generated content only.

## Stock-lab roadmap (candidates ship as engine components when a live course needs them)

| Lab | Claimed today by (source course) | Makes tangible |
|---|---|---|
| **Vectors & Similarity** ✅ live | `01-embeddings`, `02-vector-store` | dot · length · normalize · cosine · euclidean |
| **Chunking & Overlap** ✅ live (2026-06-16) | `02-vector-store` | why long text is split; what overlap buys; the duplicated-token cost |
| **Top-k Retrieval** ✅ live (2026-07-08) | — · built for `03-rag-pipeline` | a draggable query ranking a corpus by cosine; what k buys (recall) vs costs (junk chunks, the floor) |
| **Precision & Recall** ✅ live (2026-07-08) | — · built for `04-rag-quality` | sliding the cutoff over a ranked golden set; hits / misses / false alarms as precision and recall pull apart |

The retrieval pair shipped **ahead of** their claiming modules by explicit decision
(2026-07-08): instance #1's next two modules are exactly these topics, so the wait-for-a-live-
module rule was waived. The engine ships the components; the modules still claim them via
`lab.json` at generation time (the `— · built for` column: no instance claims them on disk
yet). Later candidates: softmax/temperature, tokenization, attention as a weighted sum, a 2-D
projection (PCA) of *real* embedded points. Add them when a live course's module needs them —
never speculatively (cf. `docs/ROADMAP.md`). Planned labs never render placeholder cards: a
course only ever sees visuals it has claimed or shipped.

## Lab #1 — what it does

A draggable 2-D plane (grab either arrow tip; tweens on normalize/preset) with a live readout
built to make the *dot product* click for someone who doesn't read notation:

- **Mental-model line** up top: "dot product = how much the arrows agree, size included; cosine =
  the same, size-blind, −1…1."
- **"Dot product, built up"** — the centrepiece. One diverging bar per axis: multiply A's number
  by B's; same sign → bar goes **right** (agree), opposite → **left** (disagree); the bars add to
  the total. This turns "multiply pairwise and sum" into "tally agreement per axis." With
  `lab.json` the axes carry meaning ("topic: account / login"), so big agreement on the login
  axis = high similarity — straight from the embeddings lesson.
- **Cosine gauge** −1…1 with a plain-language verdict, and a footer showing cosine = dot ÷ lengths.
- **The "length means two things" card** — the crux: 2 components vs. the arrow's measured length,
  side by side, updating as you drag.
- **`normalize` toggle** — glides both arrows onto the (now large, legible) unit circle so only
  direction is left; lengths tick to 1.00.
- **Dot-product projection** (optional) — the geometric reading: dot = length of A × how far B
  reaches along it.
- **Scenario presets** from `lab.json` (query/document example texts), including the
  *same-direction-different-length* case for the magnitude lesson; **contextual coaching** names
  what the current geometry is doing.

New deps are fair game if a future lab needs them (the user has okayed this); lab #1 stays
hand-rolled SVG to match the study exactly.

Persistent footnote: it's 2-D so you can see it; real embeddings carry 384 numbers; the math —
and the intuition — is identical.

## A note on the prime directive

The course's prime directive forbids the tutor writing solution code into scaffold gaps. The
lab's `vec.ts` contains `dot`/`mag`/`cosine`/etc., but it is **not** a drop-in for any gap: it's
2-D and `{x, y}`-shaped, whereas the curriculum's `cosineSimilarity(a: number[], b: number[])`
runs over arbitrary-length embeddings — a different signature and shape. The formula itself is
already printed in `01-embeddings/LESSON.md §3`; the lab teaches the *intuition* behind it, and
the learner still writes (and gets checks to pass on) their own array implementation. The lab is
study app code — the "generic-dev" layer the tutor builds — not curriculum.

## Scope & provenance

This doc is the **dedicated plan** for the lab. The explicit-decision moment anticipated here
happened on **2026-07-02** (full-repo audit, learner-mandated): with two labs live and lab.json
generation folded into the module-generation protocol in `CLAUDE.md`, the lab was judged
load-bearing. `docs/ROADMAP.md` records the two live labs and `docs/FORMAT.md` documents
`lab.json`. The lab supplements modules; it isn't part of a course's spine (`COURSE.md`) — a
module claims a lab through its own `lab.json`, never the spine.
