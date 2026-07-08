# Example module (illustrative)

This directory is a **worked example of a coursesmith module** — the anatomy a first-time reader
can't otherwise see without generating one. It is **not part of any course** and is **not
npm-runnable**: the `scaffold/` and `checks/` here are compact **sketches** meant to be read, not
executed. The full format spec is [`docs/FORMAT.md`](../FORMAT.md); a real module lives under
`curriculum/NN-name/` in a course clone, and the tutor generates it one at a time per the protocol
in [`CLAUDE.md`](../../CLAUDE.md).

The topic — retrying a failing call with exponential backoff and jitter — was chosen because it's
small, domain-neutral, genuinely machine-checkable, and carries a real "why it's built this way"
(jitter defeats the thundering herd) rather than a toy one.

## What a module is made of

| File                    | Role                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `module.json`           | manifest: id, phase, prerequisites, runtime — the _stable_ layer, schema-checked by `npm run validate` |
| `LESSON.md`             | the teaching: concept, a worked example, and the _why-built-this-way_ reasoning                  |
| `BRIEF.md`              | the build task + acceptance criteria; leans on LESSON for the concepts                           |
| `scaffold/`             | a runnable starter with the load-bearing parts left as `// TODO(you):` gaps                      |
| `checks/`               | automated tests the learner runs; they grade **behavior**, never implementation                  |
| `hints/hint-{1,2,3}.md` | the escalation contract: nudge → approach → near-spoiler pseudocode                               |
| `quiz.md`               | 4–8 retrieval questions, banked for spaced repetition when the module completes                  |

An optional `lab.json` + `visuals/` (an interactive visualization) is covered in
[`docs/FORMAT.md`](../FORMAT.md) and [`study/LAB.md`](../../study/LAB.md); this example ships none
because prose and code teach it fine — the protocol adds a visual only when a picture genuinely
teaches.

## How to read it

Start with `LESSON.md`, then `BRIEF.md`. Open `hints/hint-1.md` → `hint-2.md` → `hint-3.md` in
order and watch the specificity escalate: hint-2 gives the approach in prose but never pasteable
code (that would make it a hint-3). Then read `scaffold/backoff.ts` (the gaps) against
`checks/backoff.test.ts` (what filling them must satisfy).

## Two ways this differs from a real module

- **Location & id.** A real module's directory is named after its `module.json` `id`
  (`curriculum/07-retry-backoff/`); this one sits at `docs/example-module/` so it's easy to find
  and so `npm run validate` doesn't scan it as a course.
- **Abbreviated.** The scaffold omits `tsconfig.json` and its installed `node_modules`, and the
  checks are a handful of cases rather than exhaustive. Before a learner ever sees a real module
  it's QA'd mechanically: `npm run qa -- <module>` runs the sealed-reference ritual (reference
  green → stripped scaffold red _on assertions_) and the materials lints — `TODO(you)` gaps
  present, no pasteable code in hint-2, 4–8 quiz questions, no flaky timing checks, `module.json`
  valid against the schema. This example passes the lints it can (the sealed-reference run needs a
  runnable scaffold, which a sketch deliberately isn't).
