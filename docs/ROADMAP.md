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

## v0.x — while the source course runs (continuous)

- [ ] Port each new hard-won rule as it's earned (source repo's `GENERALIZATION.md` is the
      queue; source stays the source of truth, this repo receives)
- [ ] Formats stabilize as the source course's later phases (agents, evals) stress them —
      expect additions: agent-module scaffolds, run traces, boss-check records, eval modules'
      interaction with the quiz bank

## Extraction — after the source course's final phase gate

- [ ] **Cockpit port**: the local web UI (course rail, typeset lesson panes, embedded
      terminal, math-lab registry with pluggable visualizations). Lives in the source repo
      until then so it evolves with the course rather than diverging.
- [ ] **Example course pack**: the completed AI-engineering course (content only — no learner
      data) as the bundled proof and reference implementation
- [ ] Onboarding polish: the interview → spine → review flow hardened against learners other
      than learner #1
- [ ] Install UX (`npx`-style bootstrap or template repo), license, public launch
- [ ] Tutor eval harness: grade tutoring transcripts, regression-test protocol changes
      (built by learner #1 as their capstone — the protocol's only owned quality lever)

## Non-goals (recorded so they stay decided)

- **No API-based tutor agent.** The tutor is permanently the user's own subscription frontier
  agent; an API reimplementation would be worse and cost more (decided 2026-07-02).
- **No hosted edition / key-proxy.** Local-first.
- **"Any topic" is not promised.** Learn-by-building domains with machine-checkable output;
  degrading gracefully to quiz-only tutoring is explicitly not this product.
