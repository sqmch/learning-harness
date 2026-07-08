#!/usr/bin/env node
// Bootstrap a new course clone. This is the `coursesmith` bin (see package.json
// "bin"), meant to be run straight from GitHub with npx — no publish step:
//
//   npx github:sqmch/coursesmith new learn-rust
//
// npx git-installs this repo into its cache and runs the declared bin. `"private":
// true` in package.json does not block that (private only blocks `npm publish`).
//
// What it does, each step printed as it runs: verify git + Node >= 18; refuse if
// the target directory already exists; FULL git clone of the engine; optionally
// wire remotes for a backup (the README's documented rename dance, mechanized);
// npm install; print next steps. No interactive prompts — an npx run is often
// non-TTY, so every choice is a flag and every refusal says exactly what to do
// next.
//
// Usage:
//   coursesmith new <course-name> [--backup <url>] [--from <url>] [--skip-install]
//
// The script is main()-guarded like its siblings: the pure decisions (argv
// parse, the Node-version and name predicates, the remote-dance command list,
// the next-steps text) are exported for scripts/test/bootstrap.test.mjs; nothing
// with a side effect runs on import.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

// The engine's canonical home. --from overrides it (a fork, or — as the tests do
// — a local path clone source, which git resolves offline).
export const DEFAULT_ENGINE = "https://github.com/sqmch/coursesmith";
export const MIN_NODE_MAJOR = 18;

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

export const USAGE = `coursesmith — bootstrap a new course clone

usage:
  coursesmith new <course-name> [--backup <your-repo-url>] [--from <engine-url>]

  <course-name>    a new directory in the current folder, named after your course
  --backup <url>   wire your own (empty) GitHub repo as the backup remote now:
                   origin → your repo, upstream → the engine (updates keep flowing)
  --from <url>     clone the engine from somewhere else (a fork); default:
                   ${DEFAULT_ENGINE}
  --skip-install   clone and wire remotes but skip \`npm install\` (CI / offline)

Run it straight from GitHub, no install:
  npx github:sqmch/coursesmith new learn-rust`;

// ---- pure decisions (exported; tested without touching git/npm/the disk) ----

// argv (already sliced past node + script) → a parsed command, or { error }.
// Flags take their value as the next token (space form); --skip-install is a
// bare boolean. --from defaults here so callers read one field.
export function parseArgs(argv) {
  const positionals = [];
  const flags = { skipInstall: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-install") {
      flags.skipInstall = true;
      continue;
    }
    if (a === "--backup" || a === "--from") {
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) {
        return {
          error: `${a} needs a value (a URL) — e.g. ${a} https://github.com/you/your-course`,
        };
      }
      flags[a.slice(2)] = val;
      i++;
      continue;
    }
    if (a.startsWith("-")) return { error: `unknown flag "${a}"` };
    positionals.push(a);
  }
  const [command, name, ...extra] = positionals;
  if (extra.length) return { error: `too many arguments: ${extra.join(" ")}` };
  return {
    command,
    name,
    backup: flags.backup,
    from: flags.from ?? DEFAULT_ENGINE,
    skipInstall: flags.skipInstall,
  };
}

// process.version ("v24.9.1") → does its major clear the floor? Anything
// unparseable fails closed.
export function nodeVersionOk(version, min = MIN_NODE_MAJOR) {
  const m = /^v?(\d+)\./.exec(String(version));
  return m ? Number(m[1]) >= min : false;
}

// The course name must become a plain child directory of the cwd — no path
// separators (which would escape or nest), no flag-looking leading dash.
export function validateCourseName(name) {
  if (!name) return { error: "missing <course-name>" };
  if (name.startsWith("-"))
    return { error: `"${name}" looks like a flag; a course name can't start with "-"` };
  if (/[\\/]/.test(name) || name === "." || name === "..")
    return {
      error: `"${name}" must be a plain directory name (no path separators) — it becomes a folder in the current directory`,
    };
  return { ok: true, name };
}

// The remote rename dance, as an ordered list of argv arrays. This is exactly the
// README's "Updates, backup, more courses" recipe: the clone's origin (the engine)
// becomes `upstream` so `npm run update` keeps pulling from it, and the learner's
// own repo takes `origin`. The push is deliberately NOT here — wiring is safe and
// credential-free; pushing is the learner's call (next-steps prints the command).
export function remoteDance(backupUrl) {
  return [
    ["git", "remote", "rename", "origin", "upstream"],
    ["git", "remote", "add", "origin", backupUrl],
  ];
}

// The closing message, as lines. Pure so the exact guidance is a unit test, not
// a screen-scrape.
export function nextSteps({ name, backup, branch = "master", skipInstall = false }) {
  const lines = [
    `[coursesmith] done. Your course is in ${name}/.`,
    ``,
    `Next steps:`,
    `  cd ${name}`,
  ];
  if (skipInstall) lines.push(`  npm install          # you skipped this above`);
  lines.push(`  npm run dev          # → http://localhost:5173`);
  lines.push(`  then click "new course" in the browser to start onboarding`);
  if (backup) {
    lines.push(``);
    lines.push(`Backup remote wired: origin → ${backup}, upstream → the engine.`);
    lines.push(`Push your first commit when you're ready:`);
    lines.push(`  git -C ${name} push -u origin ${branch}`);
  }
  return lines;
}

// ---- effects (git / npm / fs) — only reached from main() ----

// git on PATH? Capture output so a missing binary is silent; ENOENT surfaces as
// r.error.
function hasGit() {
  const r = spawnSync("git", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
  return !r.error && r.status === 0;
}

// The fresh clone's checked-out branch, for the push hint. Best-effort: null if
// git can't answer, and the caller falls back to "master".
function currentBranch(dir) {
  const r = spawnSync("git", ["-C", dir, "branch", "--show-current"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout.toString().trim() || null;
}

// Run a step with inherited stdio (the learner watches git/npm work); any failure
// is fatal with a message that says what to do.
function runStep(label, file, args, opts = {}) {
  const r = spawnSync(file, args, { stdio: "inherit", ...opts });
  if (r.error) die(`[coursesmith] could not run ${file}: ${r.error.message}`);
  if (r.status !== 0)
    die(`[coursesmith] ${label} failed (exit ${r.status}). See the output above.`);
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) die(`${USAGE}\n\n[coursesmith] ${parsed.error}`);
  if (!parsed.command) {
    // bare `coursesmith` (or an npx run with no args): show help, exit clean.
    console.log(USAGE);
    process.exit(0);
  }
  if (parsed.command !== "new")
    die(
      `${USAGE}\n\n[coursesmith] unknown command "${parsed.command}" — the only command is "new".`,
    );

  // 1) ENVIRONMENT — git + a new-enough Node, before anything is created.
  console.log(`[coursesmith] checking git and Node (>= ${MIN_NODE_MAJOR}) ...`);
  if (!nodeVersionOk(process.version))
    die(
      `[coursesmith] refusing: Node ${process.version} is too old.\n` +
        `  Install Node ${MIN_NODE_MAJOR}+ (https://nodejs.org) and run this again.`,
    );
  if (!hasGit())
    die(
      `[coursesmith] refusing: git is not on your PATH.\n` +
        `  Install git (https://git-scm.com/downloads) and run this again.`,
    );

  const nameCheck = validateCourseName(parsed.name);
  if (nameCheck.error) die(`${USAGE}\n\n[coursesmith] refusing: ${nameCheck.error}.`);
  const name = parsed.name;
  const target = path.resolve(process.cwd(), name);

  // 2) REFUSE ON EXISTING DIR — clone would fail later; refuse early and clearly.
  if (fs.existsSync(target))
    die(
      `[coursesmith] refusing: "${name}" already exists here (${target}).\n` +
        `  Choose a different course name, or remove that directory first, then run this again.`,
    );

  // 3) FULL CLONE — never degit, never a depth-1 or "Use this template" copy: the
  //    git history IS the update channel (`npm run update` fast-forwards engine
  //    commits from upstream), and a severed history breaks every future update
  //    permanently. A plain `git clone` keeps it.
  console.log(
    `[coursesmith] cloning ${parsed.from} into ${name}/ (full clone — history is the update channel) ...`,
  );
  runStep("git clone", "git", ["clone", parsed.from, name]);

  // 4) REMOTES — only with --backup. Mechanizes the README's rename dance.
  if (parsed.backup) {
    console.log(`[coursesmith] wiring remotes: origin → your backup, upstream → the engine ...`);
    for (const cmd of remoteDance(parsed.backup)) {
      runStep(cmd.slice(0, 3).join(" "), cmd[0], cmd.slice(1), { cwd: target });
    }
  }

  const branch = currentBranch(target) ?? "master";

  // 5) INSTALL — the study's packages. npm is npm.cmd on Windows, so shell:true
  //    resolves it (mirrors scripts/update.mjs). --skip-install is the CI/offline
  //    escape hatch, announced loudly, never silent.
  if (parsed.skipInstall) {
    console.log(
      `[coursesmith] skipping npm install (--skip-install) — run it yourself before npm run dev.`,
    );
  } else {
    console.log(
      `[coursesmith] installing dependencies (npm install — this pulls the study's packages) ...`,
    );
    const r = spawnSync("npm", ["install"], { cwd: target, stdio: "inherit", shell: true });
    if (r.error) die(`[coursesmith] could not run npm: ${r.error.message}`);
    if (r.status !== 0)
      die(
        `[coursesmith] npm install failed (exit ${r.status}).\n` +
          `  Fix the error above, then run \`npm install\` inside ${name}/.`,
      );
  }

  // 6) NEXT STEPS.
  console.log("");
  for (const line of nextSteps({
    name,
    backup: parsed.backup,
    branch,
    skipInstall: parsed.skipInstall,
  }))
    console.log(line);
}

// Is this file the entry point (run it) or an import (tests — use the exports)?
// The strict URL match is enough for `node scripts/bootstrap.mjs`, but NOT for
// the bin case that is the whole point of this file: `npx`/`npm exec` runs a
// SYMLINKED COPY out of its cache, so process.argv[1] is that cache path while
// import.meta.url resolves to the real file — the two hrefs differ and main()
// would silently never fire (verified: an npx run did nothing, exit 0). Comparing
// realpaths collapses the symlink so the bin actually runs; the try/catch falls
// back to the strict result if a path can't be resolved.
function invokedAsScript() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  if (pathToFileURL(argv1).href === import.meta.url) return true;
  try {
    return fs.realpathSync(argv1) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (invokedAsScript()) main();
