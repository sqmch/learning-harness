# Roadmap

The engine is extracted **incrementally** from a live source course (AI-engineering
fundamentals; its repo is the private instance #1). Rules and formats arrive here after they
survive contact with a real learner — never speculatively. Expect breaking changes until the
source course completes its final phase.

## v0 — now (this repo)

- [x] Tutor protocol (`CLAUDE.md`): onboarding, session loop, spaced repetition, JIT module
      generation with sealed-reference QA, check-design rules, hint escalation contract
- [x] File formats documented from reality (`docs/FORMAT.md`)
- [x] `templates/` for a fresh instance's `tutor/` state
- [x] **Study** (the web shell; moved here and renamed from "cockpit" 2026-07-03; the single
      copy — the source course consumes it): course rail, typeset doc pane, embedded PTY
      terminal, math-lab registry with two live labs (Vectors & Similarity, Chunking &
      Overlap). Serves its own repo by default, `--repo`/`HARNESS_REPO` for external course
      repos. Lab plan: `study/LAB.md`
- [x] Root `package.json` entry point (`npm install` + `npm run dev`, cross-platform, no
      launcher scripts) and `npm run update` (pulls engine updates from upstream/origin)
- [x] Agent-agnostic protocol entry: `AGENTS.md` points Codex-convention agents at
      `CLAUDE.md`; the study's ⚙ prefs pick the agent (claude/codex/gemini/custom) and
      editor (VS Code/Zed/Cursor/custom) its buttons drive
- [x] State-aware quick actions: the terminal server classifies the PTY (idle / agent /
      busy) from its process tree; buttons launch the agent with the opener as an argument,
      type into a running agent, refuse when the terminal is occupied, and offer
      "resume session" (`claude --continue`, directory-scoped) when a fresh interrupted
      conversation exists

## v0.x — while the source course runs (continuous)

- [x] ~~Port each new hard-won rule as it's earned~~ **Superseded 2026-07-03:** the source
      course converted in place into a proper instance (engine merged in, its course rules
      now in its `COURSE.md`). This repo is the single source of truth for the protocol;
      rules earned in source-course sessions are applied here first and pulled down like any
      instance update. The old porting queue (the source course's own `GENERALIZATION.md`,
      not a file in this repo) is closed.
- [ ] Keep earning rules from live sessions — they land here directly now
- [ ] Formats stabilize as the source course's later phases (agents, evals) stress them —
      expect additions: agent-module scaffolds, run traces, boss-check records, eval modules'
      interaction with the quiz bank

## Extraction — after the source course's final phase gate

- [ ] **Example course pack**: the completed AI-engineering course (content only — no learner
      data) as the bundled proof and reference implementation
- [ ] New labs land with the source course's modules (Top-k Retrieval, Precision & Recall are
      registered as planned; see `study/src/lab/registry.ts`)
- [ ] Onboarding polish: the interview → spine → review flow hardened against learners other
      than learner #1
- [ ] Install UX (`npx`-style bootstrap: named clone + remotes wired for updates — NOT a
      GitHub template repo, which severs history and breaks `git pull` updates), license,
      public launch
- [ ] Tutor eval harness: grade tutoring transcripts, regression-test protocol changes
      (built by learner #1 as their capstone — the protocol's only owned quality lever)

## Non-goals (recorded so they stay decided)

- **No API-based tutor agent.** The tutor is permanently the user's own subscription frontier
  agent; an API reimplementation would be worse and cost more (decided 2026-07-02).
- **No hosted edition / key-proxy.** Local-first.
- **"Any topic" is not promised.** Learn-by-building domains with machine-checkable output;
  degrading gracefully to quiz-only tutoring is explicitly not this product.
