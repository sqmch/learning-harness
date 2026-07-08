// Integration smoke tests: spawn the real CLIs against throwaway fixture
// instances and assert exit codes + key output lines. This is the end-to-end
// proof that the main()-guard refactor left the CLIs runnable. Fast: no network,
// no npm installs — each fixture is a handful of JSON files in an OS temp dir.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runCli = (script, args) =>
  spawnSync(process.execPath, [path.join(scriptsDir, script), ...args], { encoding: "utf8" });

const tempDirs = [];
function mkInstance(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coursesmith-it-"));
  tempDirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`);
  }
  return dir;
}
after(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});

const learner = { profile: "p", paceHoursPerWeek: "3-5", started: "2026-06-10" };

test("doctor CLI: clean instance exits 0; graded-but-unjournaled exits 1", () => {
  // clean: the newest grade is no newer than the last journal entry
  const clean = mkInstance({
    "tutor/progress.json": { learner, currentModule: null, modules: {} },
    "tutor/quiz-bank.json": {
      items: [
        {
          id: "x",
          module: "m",
          question: "q",
          interval: 1,
          due: "2026-06-20",
          history: [{ date: "2026-06-01", result: "correct" }],
        },
      ],
    },
    "tutor/journal.md": "## 2026-06-02 — Session 1\ncovered the basics\n",
  });
  const good = runCli("doctor.mjs", [clean]);
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.match(good.stdout, /✓ parse/);
  assert.match(good.stdout, /✓ unjournaled/);

  // desynced: a grade dated after the last journal entry — the 2026-07-05 failure
  const desynced = mkInstance({
    "tutor/progress.json": { learner, currentModule: null, modules: {} },
    "tutor/quiz-bank.json": {
      items: [
        {
          id: "x",
          module: "m",
          question: "q",
          interval: 2,
          due: "2026-07-10",
          history: [{ date: "2026-07-05", result: "correct" }],
        },
      ],
    },
    "tutor/journal.md": "## 2026-07-03 — Session 4\nlast real session\n",
  });
  const bad = runCli("doctor.mjs", [desynced]);
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /✗ unjournaled: quiz items were graded on 2026-07-05/);
});

test("validate CLI: a valid module passes; a corrupted one exits 1", () => {
  const validModule = {
    id: "00-demo",
    title: "Demo",
    phase: 0,
    prerequisites: [],
    runtime: "node",
    estimatedHours: 1,
    provenance: "core",
    volatileLayer: "generated-at-start",
  };
  const good = mkInstance({ "curriculum/00-demo/module.json": validModule });
  const gr = runCli("validate.mjs", [good]);
  assert.equal(gr.status, 0, gr.stdout + gr.stderr);
  assert.match(gr.stdout, /all \d+ file\(s\) valid/);

  const { volatileLayer, ...corrupt } = validModule; // drop a required field
  const bad = mkInstance({ "curriculum/00-demo/module.json": corrupt });
  const br = runCli("validate.mjs", [bad]);
  assert.equal(br.status, 1, br.stdout + br.stderr);
  assert.match(br.stdout, /failed validation/);
  assert.match(br.stdout, /volatileLayer/);
});

test("quiz CLI: grade applies the interval rule deterministically with --today", () => {
  const repo = mkInstance({
    "tutor/quiz-bank.json": {
      items: [
        {
          id: "00-x",
          module: "00-demo",
          question: "q?",
          interval: 1,
          due: "2026-07-08",
          history: [],
        },
      ],
    },
  });
  const r = runCli("quiz.mjs", ["grade", "00-x", "correct", "--today", "2026-07-08", repo]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /graded 00-x: correct — interval 1d→3d, due 2026-07-08→2026-07-11/);

  const bank = JSON.parse(fs.readFileSync(path.join(repo, "tutor", "quiz-bank.json"), "utf8"));
  assert.equal(bank.items[0].interval, 3);
  assert.equal(bank.items[0].due, "2026-07-11");
  assert.equal(bank.items[0].history.at(-1).date, "2026-07-08");
  assert.equal(bank.items[0].history.at(-1).result, "correct");
});

test("quiz CLI: reschedule writes a moves[] entry, never a history grade", () => {
  const repo = mkInstance({
    "tutor/quiz-bank.json": {
      items: [
        {
          id: "00-x",
          module: "00-demo",
          question: "q?",
          interval: 4,
          due: "2026-07-08",
          history: [],
        },
      ],
    },
  });
  const r = runCli("quiz.mjs", [
    "reschedule",
    "00-x",
    "2026-07-15",
    "--note",
    "declump",
    "--today",
    "2026-07-08",
    repo,
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /rescheduled 00-x: due 2026-07-08→2026-07-15 \(bookkeeping in moves\[\]/);

  const bank = JSON.parse(fs.readFileSync(path.join(repo, "tutor", "quiz-bank.json"), "utf8"));
  assert.equal(bank.items[0].due, "2026-07-15");
  assert.equal(bank.items[0].interval, 4); // untouched — a reschedule does not grade
  assert.equal(bank.items[0].history.length, 0); // NOT in history
  assert.deepEqual(bank.items[0].moves, [
    { date: "2026-07-08", action: "rescheduled", to: "2026-07-15", note: "declump" },
  ]);
});

test("quiz CLI: legacy bank prints a migrate hint (stderr); migrate relocates + is idempotent", () => {
  const legacy = {
    items: [
      {
        id: "00-x",
        module: "00-demo",
        question: "q?",
        interval: 3,
        due: "2026-06-16",
        history: [
          { date: "2026-06-11", result: "correct" },
          { date: "2026-06-13", result: "rescheduled", note: "re-spaced" },
        ],
      },
    ],
  };
  const repo = mkInstance({ "tutor/quiz-bank.json": legacy });

  // any command that loads a legacy bank nudges toward migrate (on stderr, so
  // stdout a caller might parse stays clean)
  const due = runCli("quiz.mjs", ["due", "--today", "2026-06-20", repo]);
  assert.equal(due.status, 0, due.stdout + due.stderr);
  assert.match(due.stderr, /legacy "rescheduled".*npm run quiz -- migrate/s);

  // migrate relocates the legacy entry into moves[] and drops "to"
  const m1 = runCli("quiz.mjs", ["migrate", repo]);
  assert.equal(m1.status, 0, m1.stdout + m1.stderr);
  assert.match(m1.stdout, /migrated 1 legacy "rescheduled" entry from history\[\] into moves\[\]/);
  const after = JSON.parse(fs.readFileSync(path.join(repo, "tutor", "quiz-bank.json"), "utf8"));
  assert.deepEqual(after.items[0].history, [{ date: "2026-06-11", result: "correct" }]);
  assert.deepEqual(after.items[0].moves, [
    { date: "2026-06-13", action: "rescheduled", note: "re-spaced" }, // no "to"
  ]);

  // idempotent: a second migrate finds nothing, exits 0, and leaves bytes identical
  const bytesBefore = fs.readFileSync(path.join(repo, "tutor", "quiz-bank.json"), "utf8");
  const m2 = runCli("quiz.mjs", ["migrate", repo]);
  assert.equal(m2.status, 0, m2.stdout + m2.stderr);
  assert.match(m2.stdout, /nothing to migrate/);
  assert.equal(fs.readFileSync(path.join(repo, "tutor", "quiz-bank.json"), "utf8"), bytesBefore);
  // and the migrated bank no longer triggers the hint
  assert.doesNotMatch(m2.stderr, /npm run quiz -- migrate/);
});

test("doctor CLI: a reschedule newer than the last journal entry fails as unjournaled", () => {
  const repo = mkInstance({
    "tutor/progress.json": { learner, currentModule: null, modules: {} },
    "tutor/quiz-bank.json": {
      items: [
        {
          id: "x",
          module: "m",
          question: "q",
          interval: 2,
          due: "2026-07-20",
          history: [{ date: "2026-07-01", result: "correct" }],
          moves: [{ date: "2026-07-06", action: "rescheduled", to: "2026-07-20" }],
        },
      ],
    },
    "tutor/journal.md": "## 2026-07-03 — Session 4\nlast real session\n",
  });
  const r = runCli("doctor.mjs", [repo]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗ unjournaled: a quiz item was rescheduled on 2026-07-06/);
});

test("quiz CLI: due lists what's due, most overdue first", () => {
  const repo = mkInstance({
    "tutor/quiz-bank.json": {
      items: [
        { id: "a", module: "m", question: "qa", interval: 1, due: "2026-07-01", history: [] },
        { id: "b", module: "m", question: "qb", interval: 1, due: "2026-07-05", history: [] },
        { id: "c", module: "m", question: "qc", interval: 1, due: "2026-07-20", history: [] }, // not yet due
      ],
    },
  });
  const r = runCli("quiz.mjs", ["due", "--today", "2026-07-08", repo]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 quiz item\(s\) due as of 2026-07-08/);
  // a (2026-07-01) is more overdue than b (2026-07-05), so it is listed first
  assert.ok(r.stdout.indexOf("\n  a ") < r.stdout.indexOf("\n  b "), r.stdout);
});
