# learning-harness *(working name)*

An open-source **learning harness**: a file protocol + tutor rulebook that turns the AI
subscription you already pay for (Claude Code or a comparable agentic CLI) into a rigorous,
personal tutor for **learn-by-building** topics.

No API keys, no hosted service, no metered costs. You bring your own frontier agent; the
harness brings the structure that a bare "be my tutor" prompt can never have:

- **A course generated for you, just-in-time** — an onboarding interview produces your course
  spine; each module (lesson, build task, starter scaffold, automated checks, sealed hints) is
  generated when you reach it, calibrated to how the previous one actually went.
- **Real feedback loops** — modules ship with runnable checks. Red → green is the unit of
  progress, not "I think I get it." Generated checks are QA'd against a sealed reference
  solution before you ever see them.
- **Spaced repetition that actually runs** — every session opens with recall questions from a
  quiz bank with due dates, intervals, and honest grading. Miss something and it comes back
  sooner.
- **Sealed, escalating hints** — nudge → approach → near-spoiler, revealed one level at a
  time, never solutions. The tutor is forbidden from writing your code.
- **Memory that survives the chat** — progress, quiz history, and a tutor journal live in
  files, committed to git. Any session, any model, picks up exactly where you left off.

## Status: v0 skeleton — extracted from a live course

This protocol is being extracted **incrementally** from a real course
(AI-engineering fundamentals: RAG, agents, evals) currently being run by its first learner.
Every rule in `CLAUDE.md` exists because its absence caused a real failure there. Expect
breaking format changes until the source course completes; see `docs/ROADMAP.md`.

## Honest scope

The harness's sharpest tool is machine-checkable progress. It is built for topics you learn
by **building** — programming, tools, technical systems — where a scaffold can compile and
checks can fail. Topics without executable output (languages, theory-only subjects) would
degrade to quiz-and-judge tutoring; that is a different product, and this one does not
pretend to be it.

## How to use it (v0)

1. Clone this repo, open it in Claude Code (or a comparable agentic CLI).
2. Say **"new course"** — the tutor interviews you (topic, goals, background, hours/week,
   what "done" looks like), generates a course spine, and asks you to review the arc before
   anything else is built.
3. Say **"start session"** whenever you sit down. The tutor runs your due recall quiz,
   teaches, hands you the next build task, and updates your files at close.
4. Run checks yourself (`npm run check` inside a module's scaffold). Ask for hints when
   stuck; they unseal one level at a time.

Everything the tutor knows about you lives in `tutor/` and `curriculum/` in this repo —
plain markdown and JSON, yours to read, version, and delete.
