# File formats (v0 — documented from reality, subject to change until the source course completes)

These formats are the de facto schema extracted from the first live course. They are what the
tutor protocol reads/writes and what the study (the bundled UI) renders.

The precise, machine-checkable spec lives in [`docs/schema/`](schema/) (JSON Schema draft-07);
`npm run validate` checks a course against it. The prose below is the annotated tour.

## Repository layout

```
CLAUDE.md            ← the tutor protocol (the engine)
AGENTS.md            ← pointer to CLAUDE.md for agents that read the AGENTS.md convention (codex, …)
COURSE.md            ← generated at onboarding: learner profile, phases, module arc, boss-checks
curriculum/
  NN-name/           ← one directory per module, numbered
    module.json      ← manifest (below)
    LESSON.md        ← teaching (textbook chapter)
    BRIEF.md         ← task spec + acceptance criteria
    scaffold/        ← runnable starter project with TODO(you) gaps
    checks/          ← automated tests, run by the learner
    hints/           ← hint-1.md (nudge), hint-2.md (approach), hint-3.md (near-spoiler)
    quiz.md          ← 4–8 retrieval questions
    lab.json         ← optional: claims/configures the module's visualizations (below)
    visuals/         ← optional: self-contained interactive HTML, rendered sandboxed
tutor/
  progress.json      ← module status, hint usage, check attempts, tutor notes
  quiz-bank.json     ← spaced-repetition items with intervals, due dates, history
  journal.md         ← append-only session log; the tutor's cross-session memory
```

## module.json

```jsonc
{
  "id": "02-vector-store",          // = directory name
  "title": "A Vector Store from Scratch",
  "phase": 1,
  "phaseName": "Retrieval — RAG",   // optional: display name for the phase in the study's
                                    // course rail (any module in the phase may carry it;
                                    // absent everywhere → "Phase N")
  "prerequisites": ["01-embeddings"],
  "runtime": "node",                // what the scaffold needs to run
  "estimatedHours": 4,
  "provenance": "core",             // "core" (reviewed curriculum) | "tutor-generated"
  "volatileLayer": "generated-at-start",  // scaffold/checks/hints are JIT-generated
  "bossCheck": true                 // optional: this module ends a phase gate
}
```

**Stable/volatile split:** `LESSON.md`, `BRIEF.md`, `quiz.md`, `module.json` are the *stable
layer* — written when the course spine is built. `scaffold/`, `checks/`, `hints/` are the
*volatile layer* — generated when the learner starts the module (facts drift: versions, prices,
APIs), and always QA'd against a sealed reference solution first.

## tutor/progress.json

```jsonc
{
  "learner": { "profile": "…", "paceHoursPerWeek": "3-5", "started": "2026-06-10" },
  "currentModule": "02-vector-store",
  "modules": {
    "00-orientation": {
      "status": "completed",        // "not-started" | "in-progress" | "completed"
      "startedAt": "2026-06-10",
      "completedAt": "2026-06-11",
      "hintsUsed": ["hint-1"],
      "checkAttempts": 3,
      "notes": "free-form tutor notes: struggles, calibration decisions, open threads"
    }
  }
}
```

## tutor/quiz-bank.json

```jsonc
{
  "items": [
    {
      "id": "00-statelessness",     // module prefix + slug
      "module": "00-orientation",
      "question": "…",
      "interval": 3,                // days; ×2.5 on correct, 2 on partial, 1 on wrong
      "due": "2026-06-16",          // ISO date; due when today ≥ due
      "history": [
        { "date": "2026-06-11", "result": "correct", "note": "…" }
        // results: correct | partial | wrong | tutored | rescheduled
        // entries ONLY for items actually asked (rescheduled = bookkeeping, not a grade)
      ]
    }
  ]
}
```

**`scripts/quiz.mjs` is the writer of record** for `interval`, `due`, and `history`
(`npm run quiz -- grade|tutored|seed|reschedule`): the tutor judges the answer, the script does
the arithmetic and the history append, so an earned interval can't be flattened by a hand edit
(it was, once — a close-time reseed sent module 01's quiz dark). It emits exactly this shape —
2-space JSON, one-line history entries, trailing newline — to keep a single grade's git diff to
a few lines.

## tutor/journal.md

Append-only, newest at the bottom, one `## date — title` entry per session (or maintenance
event). Content contract: what was covered; where the learner struggled or shone, with
specifics; open threads; pedagogy/calibration decisions. The tutor reads the last few entries
at every session open.

## lab.json (optional, per module) — visualizations

A module gets a visualization in one (or both) of two ways, both declared here. The study
derives everything from this file: the ◇ lab button (hidden when no module claims anything),
the ◇ chips on the module's lesson, and the rail badge. **Nothing about visuals is hardcoded
in the engine.**

```jsonc
{
  "provenance": "tutor-generated",
  "focus": "one line: the live confusion this module's picture should target",
  "focusLab": "chunking",           // which entry the focus targets, when the module has several

  // 1) CLAIM A STOCK LAB: carrying a stock lab's config key claims it for this
  //    module. The engine ships the components (see study/src/lab/registry.ts:
  //    "vectors", "chunking"); the course decides which modules they serve.
  "vectors": { /* lab-specific config — axes, example vectors, presets */ },

  // 2) SHIP YOUR OWN: self-contained HTML files under this module's visuals/.
  "visuals": [
    {
      "file": "event-loop.html",    // inside visuals/; inline CSS/JS ONLY — the study
                                    // serves it under a CSP that blocks all network
      "title": "The event loop, animated",
      "blurb": "one line: what you'll feel by playing with it"
    }
  ]
}
```

A custom visual can also be embedded **inline in LESSON.md**, right where the picture
belongs, with a `visual` fence (the study renders it as a sandboxed iframe):

````markdown
```visual
{ "file": "event-loop.html", "height": 420, "title": "The event loop" }
```
````
