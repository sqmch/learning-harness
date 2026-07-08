# Contributing

coursesmith is **v0**, extracted from a single live course as it runs. The file formats
([`docs/FORMAT.md`](docs/FORMAT.md)) and the tutor protocol ([`CLAUDE.md`](CLAUDE.md)) still move
as the course surfaces new failures. So: **open an issue before building anything sizable** — a
format change or a study feature may already be pending, in flight, or a deliberate non-goal
([`docs/ROADMAP.md`](docs/ROADMAP.md) lists them). Small, obvious fixes — a broken link, a stale
doc reference, a failing edge case — just send.

## The most valuable contribution: a course-run report

This engine has one real source of truth: courses actually run through it. If you've taken a
module — or a whole course — to the tutor, a report on how it went is worth more than any feature.
There's a **Course-run report** issue template; a good one carries:

- the topic and which module, and what the tutor did **well** and **badly**, with specifics
  ("graded a correct refusal as a failure", not "the tutor was off");
- **materials bugs** the QA ritual should have caught — a scaffold that passed with the gaps still
  empty, a hint-2 you could paste, a check that graded implementation detail instead of behavior,
  a flaky timing assertion;
- **state desyncs** — a session close that graded the quiz bank but never journaled, synced
  progress, or committed; anything `npm run doctor` flagged;
- the relevant output of `npm run doctor` and `npm run validate` on your course.

Engine bugs (a script that crashes, a study rendering fault) go in the **Bug report** template:
repro, expected, and the gate output.

## Running the gate

Node 18+ (CI runs 22). From the repo root:

```
npm install
npm run typecheck
npm run lint
npm run format:check
npm run validate
npm test
npm run build --workspace study
```

CI runs exactly this sequence ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)); run it
locally before opening a PR. `npm run format` fixes formatting in place. The enforcement scripts
under `scripts/` are zero-dependency Node ESM, must stay cross-platform (Windows is first-class),
and ship with a `node:test` suite under `scripts/test/` — a script change without a test change is
usually incomplete.

## The engine / instance split — the one rule that can't bend

A course is a **clone** of this repo. Engine files and course files occupy **disjoint paths** so
an instance can `git pull` engine updates without a merge conflict. Engine paths — everything this
repo ships: `study/`, `docs/`, `templates/`, `scripts/`, `.github/`, `CLAUDE.md`, `AGENTS.md`,
`README.md`, `LICENSE`, the root `package.json` — belong to the engine. Course paths — `COURSE.md`,
`curriculum/`, `tutor/` — belong to the learner and never appear in this repo.

**Editing an engine file inside an instance breaks updates forever** — the pull stops
fast-forwarding, and it's how a protocol edit once went silently lost for two weeks. If you're
improving the engine, do it here, in a clone of coursesmith itself, not in a course. If you're
running a course and hit an engine limitation, that's a course-run report, not a local edit.

## License

By contributing you agree that your work is licensed under the repo's [MIT license](LICENSE).
