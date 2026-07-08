# coursesmith

A file protocol + local web UI that turns the agentic CLI you already pay for — Claude
Code, Codex, or similar — into a rigorous personal tutor for **learn-by-building** topics.
It forges your course one module at a time, calibrated to how the last one actually went.

No API keys, no hosted service, no accounts. Your course is generated into your clone as
plain markdown and JSON: readable, versioned, yours.

**Status: v0.** Extracted incrementally from a live course; every rule in the protocol
exists because its absence caused a real failure there. Expect breaking format changes —
see [docs/ROADMAP.md](docs/ROADMAP.md).

## What it does

- Builds your course from an onboarding interview, then generates it **one module at a
  time** — each calibrated to how the previous one actually went.
- Modules are built, not read: a lesson, a build task, a scaffold that runs but fails its
  checks, and automated checks **you** run. Red → green is the unit of progress.
- Hints are sealed and escalate (nudge → approach → near-spoiler). The tutor is forbidden
  from writing your solution code.
- Every session opens with a recall quiz — spaced repetition with due dates and honest
  grading.
- State survives the chat: progress, quiz bank, and a tutor journal live in files,
  committed to git at every session close. Any session, any model, picks up where you left
  off.

Honest scope: built for topics where progress is machine-checkable — programming, tools,
technical systems. Topics with no runnable output would degrade into quiz-and-judge
tutoring, and this tool doesn't pretend to be that.

## Setup

You need `git`, Node 18+, and an agentic CLI you already use.

```
git clone https://github.com/sqmch/coursesmith learn-rust   # name it after your course
cd learn-rust
npm install
npm run dev          # → http://localhost:5173
```

In the UI: click **new course** — it starts your agent in the embedded terminal with the
onboarding opener already sent (`claude` by default; the ⚙ picker switches it to `codex`
or any other CLI). The tutor interviews you — topic, goals, background, hours per week —
drafts a course arc, and asks you to review it before building anything. When module 00
exists, the page becomes your course.

## A session, day to day

1. `npm run dev`, click **start session**. It does the right thing for the state you're
   in: starts your agent with the opener already sent, relabels itself **resume session**
   when a fresh interrupted conversation exists (claude's conversations are per-directory,
   so it can never resume the wrong project's), types the opener in if the tutor is
   already running — and refuses, with a note, if something else is using the terminal.
2. The tutor quizzes you on what's due, teaches the next concept, hands you the build task.
3. You write code in your own editor (**edit** opens it) and run the module's checks
   (**run checks**, or `npm run check` inside the module's scaffold).
4. Stuck? Ask for a hint — they unseal one level at a time.
5. Say you're done: the tutor updates progress, banks new quiz questions, journals the
   session, and commits. (`npm run doctor` verifies that close actually landed — nothing
   graded but unjournaled, nothing left uncommitted.)

No UI required: open the repo in your agent and say "new course" / "start session" — the
web UI is a lens over the same files, never a dependency.

## The study (the web UI)

Local only; owns zero state. A course rail with your progress, a typeset
lesson/brief/quiz pane, an embedded terminal with the quick actions above, and **◇ lab** —
interactive visualizations the tutor claims or generates per module, embedded in lessons
and available full-screen.

## Updates, backup, more courses

Engine files and course files occupy disjoint paths, so pulling from this repo updates the
machinery without touching your course: `npm run update` (or plain `git pull`).

To back your course up on your own GitHub — clone, don't use "Use this template" (template
copies sever the history that updates flow through) — repoint the remotes:

```
git remote rename origin upstream        # engine updates keep coming from here
git remote add origin <your-repo>
git push -u origin master
```

Another course is another clone, named after it. Run two side by side with
`PORT=7332 npm run dev`.

## Bring your own agent

Claude Code reads the protocol (`CLAUDE.md`) natively; `AGENTS.md` points Codex and other
AGENTS.md-convention tools at the same file. Anything else: tell it to read `CLAUDE.md`
and follow it.

## Docs

- [`CLAUDE.md`](CLAUDE.md) — the tutor protocol; this is the actual product
- [`docs/FORMAT.md`](docs/FORMAT.md) — the file formats a course is made of
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — status, plans, non-goals
- [`study/LAB.md`](study/LAB.md) — how course-owned visualizations work

## Contributing

It's v0 and the formats are still moving — open an issue before building anything sizable.
Reports from real course runs are the most valuable thing you can send.

## License

[MIT](LICENSE)
