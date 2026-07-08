// Session-close doctor: verify the protocol's atomic close actually happened.
// The close step — update progress + quiz-bank + journal, then commit — is prose,
// and on 2026-07-05 in instance #1 it half-ran: quiz-bank graded, journal never
// written, progress untouched, nothing committed, and no one noticed for days.
// This is the mechanical check that prose couldn't be. It is READ-ONLY: it
// inspects state and shells out to `git status` only to read it, never to write.
//
// Usage:  node scripts/doctor.mjs [repoPath] [--json]
//   repoPath   an instance to inspect; default walks up from cwd for .git/CLAUDE.md
//   HARNESS_REPO   env var honored too (same precedence the study server uses)
//   --json     print a stable [{ id, level, message }] array (feeds a study banner)
//
// Exit 0 when clean (warnings allowed), 1 when any check fails.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STALE_HOURS = 12;

// ---- repo root: explicit arg > HARNESS_REPO > walk up for .git/CLAUDE.md ----
// Mirrors study/server/index.ts resolveRepoRoot: an explicit target is taken as
// given; only the default case discovers the root by walking up from cwd.
function walkUp(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, "CLAUDE.md"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const isoDate = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const trim = (arr, n = 4) =>
  arr.length <= n ? arr.join(", ") : `${arr.slice(0, n).join(", ")}, +${arr.length - n} more`;

function readJson(repoRoot, rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return { missing: true };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(abs, "utf8")) };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

// git status --porcelain, one relative path per changed file. Rename lines
// ("orig -> new") report the current path; quoted paths (special chars) unwrap.
export function parsePorcelain(out) {
  const paths = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rest = line.slice(3); // strip the 2-char XY status + its trailing space
    const arrow = rest.indexOf(" -> ");
    if (arrow !== -1) rest = rest.slice(arrow + 4);
    if (rest.startsWith('"') && rest.endsWith('"')) rest = rest.slice(1, -1);
    paths.push(rest);
  }
  return paths;
}
export const isCourseState = (rel) => {
  const p = rel.replace(/\\/g, "/");
  return p.startsWith("tutor/") || p.startsWith("curriculum/") || p === "COURSE.md";
};

// Newest "## YYYY-MM-DD …" heading date in a journal, or null. Tolerant: a
// range heading like "## 2026-06-15/16 — …" contributes its first date.
export function newestJournalDate(text) {
  const re = /^##\s+(\d{4}-\d{2}-\d{2})/gm;
  let newest = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!newest || m[1] > newest) newest = m[1];
  }
  return newest;
}

function main() {
  // ---- argv: flags vs the one optional positional path (order-independent) ----
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes("--json");
  const repoArg = argv.find((a) => !a.startsWith("--"));

  const chosen = repoArg ?? process.env.HARNESS_REPO ?? walkUp(process.cwd()) ?? process.cwd();
  const repoRoot = path.resolve(chosen);

  // ---- results: one entry per check, worst level wins the exit code ----
  const results = [];
  const add = (id, level, message) => results.push({ id, level, message });

  if (!fs.existsSync(path.join(repoRoot, "tutor"))) {
    // Not an instance (or not onboarded yet) — nothing to check, and that's fine.
    add("course-state", "ok", `no tutor/ directory under ${repoRoot} — no course state to check`);
  } else {
    // 1) PARSE — the state files the tutor read/writes must be readable.
    const progress = readJson(repoRoot, "tutor/progress.json");
    const quizBank = readJson(repoRoot, "tutor/quiz-bank.json");
    const journalPath = path.join(repoRoot, "tutor", "journal.md");
    const journalExists = fs.existsSync(journalPath);

    const parseProblems = [];
    if (progress.missing) parseProblems.push("tutor/progress.json is missing");
    else if (!progress.ok)
      parseProblems.push(`tutor/progress.json is not valid JSON (${progress.error})`);
    if (quizBank.missing) parseProblems.push("tutor/quiz-bank.json is missing");
    else if (!quizBank.ok)
      parseProblems.push(`tutor/quiz-bank.json is not valid JSON (${quizBank.error})`);
    if (!journalExists) parseProblems.push("tutor/journal.md is missing");

    if (parseProblems.length === 0) {
      add("parse", "ok", "progress.json and quiz-bank.json parse; journal.md present");
    } else {
      add("parse", "fail", parseProblems.join("; "));
    }

    // 2) UNCOMMITTED STATE — dirty course files warn; dirty AND stale (>12h) fail,
    //    because that is a session whose state was never committed.
    let gitOut = null;
    try {
      // stderr ignored: git's own "fatal: not a git repository" is noise here —
      // the check reports that state itself, in its own voice.
      gitOut = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      add(
        "uncommitted",
        "warn",
        "could not run git status (not a git repo, or git unavailable) — skipping the uncommitted-state check",
      );
    }
    if (gitOut !== null) {
      const dirty = parsePorcelain(gitOut).filter(isCourseState);
      if (dirty.length === 0) {
        add(
          "uncommitted",
          "ok",
          "no uncommitted course state (tutor/, curriculum/, COURSE.md clean)",
        );
      } else {
        const stale = [];
        for (const rel of dirty) {
          let mt;
          try {
            mt = fs.statSync(path.join(repoRoot, rel)).mtimeMs;
          } catch {
            continue; // deleted file: dirty, but there's no mtime to age
          }
          const ageH = (Date.now() - mt) / 3_600_000;
          if (ageH > STALE_HOURS) stale.push(`${rel} (${ageH.toFixed(0)}h)`);
        }
        if (stale.length > 0) {
          add(
            "uncommitted",
            "fail",
            `uncommitted course state older than ${STALE_HOURS}h — a session's state was never committed: ${trim(stale)}`,
          );
        } else {
          add(
            "uncommitted",
            "warn",
            `uncommitted course state (commit at session close): ${trim(dirty)}`,
          );
        }
      }
    }

    // 3) UNJOURNALED GRADING — the newest quiz grading vs the newest journal entry.
    //    Grading newer than the last journal entry means a session was graded but
    //    never journaled (the 2026-07-05 failure exactly).
    let newestGrade = null;
    if (quizBank.ok && Array.isArray(quizBank.value?.items)) {
      for (const item of quizBank.value.items) {
        for (const h of item?.history ?? []) {
          const d = isoDate(h?.date);
          if (d && (!newestGrade || d > newestGrade)) newestGrade = d;
        }
      }
    }
    let newestJournal = null;
    if (journalExists) {
      // tolerant: any "## YYYY-MM-DD …" heading; a "…-15/16" range takes the first date
      newestJournal = newestJournalDate(fs.readFileSync(journalPath, "utf8"));
    }
    if (!quizBank.ok) {
      add("unjournaled", "warn", "skipped — quiz-bank.json did not parse");
    } else if (!newestGrade) {
      add("unjournaled", "ok", "no graded quiz items yet — nothing to journal");
    } else if (!newestJournal) {
      add(
        "unjournaled",
        "fail",
        `quiz items were graded on ${newestGrade} but journal.md has no dated session entries`,
      );
    } else if (newestGrade > newestJournal) {
      add(
        "unjournaled",
        "fail",
        `quiz items were graded on ${newestGrade} but that session was never journaled (last journal entry ${newestJournal})`,
      );
    } else {
      add(
        "unjournaled",
        "ok",
        `last journal entry (${newestJournal}) is current with the newest grading (${newestGrade})`,
      );
    }

    // 4) PROGRESS SYNC — currentModule points at a real module dir; statuses are
    //    from the known vocabulary ("complete" is the UI's word, tolerated with a warn).
    if (!progress.ok) {
      add("progress-sync", "warn", "skipped — progress.json did not parse");
    } else {
      const prog = progress.value ?? {};
      const problems = [];
      const warns = [];
      const cur = prog.currentModule;
      if (cur && !fs.existsSync(path.join(repoRoot, "curriculum", cur))) {
        problems.push(`currentModule "${cur}" has no directory under curriculum/`);
      }
      const VALID = new Set(["not-started", "in-progress", "completed"]);
      for (const [id, m] of Object.entries(prog.modules ?? {})) {
        const st = m?.status;
        if (st === undefined) continue;
        if (st === "complete")
          warns.push(
            `module "${id}" status "complete" (UI vocabulary; disk vocabulary is "completed")`,
          );
        else if (!VALID.has(st)) problems.push(`module "${id}" has unknown status "${st}"`);
      }
      if (problems.length > 0) add("progress-sync", "fail", [...problems, ...warns].join("; "));
      else if (warns.length > 0) add("progress-sync", "warn", warns.join("; "));
      else
        add(
          "progress-sync",
          "ok",
          cur
            ? `currentModule "${cur}" exists; all module statuses valid`
            : "no currentModule set; all module statuses valid",
        );
    }
  }

  // ---- render + exit ----
  const anyFail = results.some((r) => r.level === "fail");
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const glyph = { ok: "✓", warn: "⚠", fail: "✗" };
    console.log(`doctor — ${repoRoot}`);
    for (const r of results) console.log(`${glyph[r.level]} ${r.id}: ${r.message}`);
    const fails = results.filter((r) => r.level === "fail").length;
    const warns = results.filter((r) => r.level === "warn").length;
    console.log(
      anyFail
        ? `\n${fails} check(s) failing${warns ? `, ${warns} warning(s)` : ""} — reconcile before continuing.`
        : warns
          ? `\nclean, ${warns} warning(s).`
          : `\nall clear.`,
    );
  }
  process.exit(anyFail ? 1 : 0);
}

// Run only as a CLI; on import (tests) the pure helpers above are used directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
