// Unit tests for the engine/course path matcher in scripts/update.mjs — the
// guard that refuses a pull when an instance has edited an engine file — and
// the install-staleness comparator behind the dependency safety net.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStale, isEngine } from "../update.mjs";

test("isEngine: engine dirs and top-level engine files are engine", () => {
  for (const p of [
    "study/src/App.tsx",
    "docs/FORMAT.md",
    "docs/schema/module.schema.json",
    "templates/tutor/progress.json",
    "scripts/quiz.mjs",
    "scripts/test/quiz.test.mjs",
    ".github/workflows/ci.yml",
    "CLAUDE.md",
    "AGENTS.md",
    "README.md",
    "LICENSE",
    "package.json",
    "package-lock.json",
  ]) {
    assert.equal(isEngine(p), true, p);
  }
});

test("isEngine: course paths are NOT engine (a scaffold's own package.json included)", () => {
  for (const p of [
    "curriculum/02-vector-store/scaffold/package.json", // the trap: basename is package.json, but the path is course-owned
    "curriculum/00-orientation/module.json",
    "curriculum/01-embeddings/lab.json",
    "tutor/progress.json",
    "tutor/quiz-bank.json",
    "tutor/journal.md",
    "COURSE.md",
  ]) {
    assert.equal(isEngine(p), false, p);
  }
});

test("installStale: a lockfile newer than the last install owes an npm install", () => {
  // the 2026-07-09 shape: a hand-completed merge landed a new lockfile at t=200
  // after the last real install at t=100 — stale, install needed
  assert.equal(installStale(200, 100), true);
  // no install has ever run here (fresh clone) — stale
  assert.equal(installStale(200, null), true);
  // install ran after the lockfile last changed — in sync
  assert.equal(installStale(100, 200), false);
  assert.equal(installStale(100, 100), false);
});
