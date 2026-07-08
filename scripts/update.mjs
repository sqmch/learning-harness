// Pull engine updates into this instance. Safe because engine paths and course
// paths are disjoint (see README "Updates, backup, more courses") — your course
// files are never touched by an engine merge. This puller guards that invariant:
// it refuses on a dirty tree (a merge into uncommitted session state can corrupt
// it), refuses on any local edit to an engine file (which would conflict forever
// and break every future update), and auto-installs when a dependency bump comes
// down with the pull.
//
// Remote resolution: `upstream` if you renamed it to push your course to your
// own origin; otherwise `origin` (the clone-and-go case, still pointing at the
// canvas repo).
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const run = (cmd) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

// Engine paths — mirrors the protected list in CLAUDE.md's onboarding section.
// A local edit to any of these makes the engine/course path split leak, and the
// next `git pull` conflicts on it permanently.
const ENGINE_DIRS = ["study/", "docs/", "templates/", "scripts/", ".github/"];
const ENGINE_FILES = new Set([
  "CLAUDE.md",
  "AGENTS.md",
  "README.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
]);
export const isEngine = (p) => ENGINE_FILES.has(p) || ENGINE_DIRS.some((d) => p.startsWith(d));

// The tree owes an install when the repo's lockfile is newer than npm's hidden
// lockfile (node_modules/.package-lock.json — written by every real install).
// A missing hidden lockfile means no install ever ran here.
export const installStale = (lockMtimeMs, hiddenLockMtimeMs) =>
  hiddenLockMtimeMs === null || hiddenLockMtimeMs < lockMtimeMs;

function main() {
  const force = process.argv.includes("--force");

  const remotes = run("git remote").split(/\r?\n/).filter(Boolean);
  const remote = remotes.includes("upstream") ? "upstream" : "origin";

  // the engine's default branch, straight from the remote — never assume
  const symref = run(`git ls-remote --symref ${remote} HEAD`);
  const branch = symref.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m)?.[1] ?? "master";

  // 1) DIRTY-TREE GUARD. A pull merges into the working tree; doing that over
  //    uncommitted session state can wreck it. No auto-stash — state that is meant
  //    to be committed should be committed, not hidden. Refusal is the honest move.
  if (run("git status --porcelain")) {
    die(
      `[update] refusing: the working tree has uncommitted changes.\n` +
        `  A pull merges into these and can corrupt an unsaved session.\n` +
        `  Ask your tutor to close the session properly first (commit progress,\n` +
        `  quiz-bank, journal), then run \`npm run update\` again.\n` +
        `  To see exactly what's unsaved: npm run doctor`,
    );
  }

  // 2) ENGINE-DIVERGENCE PREFLIGHT. Fetch the remote branch, then look for local
  //    commits that touched an engine path. The three-dot diff compares the
  //    merge-base to the local HEAD, so it reports only *our* side's changes —
  //    upstream's own engine edits, which we are about to pull, are ignored.
  console.log(`[update] fetching ${remote}/${branch} ...`);
  execSync(`git fetch ${remote} ${branch}`, { stdio: "inherit" });

  const diverged = run(`git diff --name-only FETCH_HEAD...HEAD`)
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(isEngine);

  if (diverged.length && !force) {
    die(
      `[update] refusing: these engine files have local edits:\n` +
        diverged.map((f) => `    ${f}`).join("\n") +
        `\n` +
        `  Engine files belong to the harness and change only through this pull;\n` +
        `  an instance never edits them. Local edits conflict permanently and break\n` +
        `  every future update.\n` +
        `  Move the change into a course path, or revert it: git checkout -- <file>\n` +
        `  To pull anyway and take on the conflicts yourself: npm run update -- --force`,
    );
  }
  if (diverged.length) {
    console.warn(
      `[update] --force: pulling despite local edits to ${diverged.length} engine ` +
        `file(s) — expect conflicts:\n` +
        diverged.map((f) => `    ${f}`).join("\n"),
    );
  }

  // 3) PULL, then auto-install if the merge changed any package manifest or lock.
  //    --no-edit: an instance has its own commits, so the pull is usually a real
  //    merge, and git would open an editor for the message — which hangs or dies
  //    on machines whose editor git can't launch (a broken core.editor stranded
  //    instance #1 mid-merge on 2026-07-09). The default message is always right
  //    here; nobody edits an engine-update merge message.
  const oldHead = run("git rev-parse HEAD");
  console.log(`[update] pulling engine updates from ${remote}/${branch} ...`);
  try {
    execSync(`git pull --no-edit ${remote} ${branch}`, { stdio: "inherit" });
  } catch {
    die(
      `[update] the pull did not complete cleanly. Check \`git status\`:\n` +
        `  - conflicts        → resolve them, then \`git commit\`\n` +
        `  - merge unfinished → \`git commit --no-edit\` completes it\n` +
        `  then run \`npm run update\` again to finish the dependency step.`,
    );
  }
  const newHead = run("git rev-parse HEAD");

  const deps =
    oldHead === newHead
      ? []
      : run(`git diff --name-only ${oldHead} ${newHead}`)
          .split(/\r?\n/)
          .filter(Boolean)
          .filter((p) => {
            const base = p.split("/").pop();
            return base === "package.json" || base === "package-lock.json";
          });

  // Belt for the strap above: a crashed or hand-completed pull can land a new
  // lockfile without its install. Instance #1 hit this on 2026-07-09 — the
  // stranded merge was finished with `git commit --no-edit`, the re-run saw
  // "already up to date", skipped the dependency step, and the study died on
  // missing font packages. npm's hidden lockfile records the last actual
  // install; if ours is newer, install regardless of what this pull brought.
  const mtime = (p) => {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      return null;
    }
  };
  const lockM = mtime("package-lock.json");
  const stale =
    !deps.length && lockM !== null && installStale(lockM, mtime("node_modules/.package-lock.json"));

  if (deps.length || stale) {
    console.log(
      deps.length
        ? `[update] dependencies changed (${deps.join(", ")}) — running npm install ...`
        : `[update] the lockfile is newer than the last install — running npm install ...`,
    );
    execSync("npm install", { stdio: "inherit", shell: true });
  }

  console.log(`[update] done.`);
}

// Run only as a CLI; on import (tests) the isEngine matcher above is used directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
