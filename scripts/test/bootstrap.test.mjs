// Tests for the `praxeum new` bootstrap. Two layers:
//   1. unit — the exported pure decisions (argv parse, Node-version + name
//      predicates, the remote-dance list, the next-steps text). No git, no disk.
//   2. integration — spawn the real CLI with --from pointing at a local path
//      clone of THIS repo (git resolves file-path sources offline) and --skip-install
//      (the real npm install is slow and unrelated to the wiring). Asserts the clone
//      lands, remotes wire only under --backup, and refusals fire. The real
//      npx-from-GitHub path can only be exercised after the bin is pushed — the
//      orchestrator does that.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  nodeVersionOk,
  validateCourseName,
  remoteDance,
  nextSteps,
  DEFAULT_ENGINE,
} from "../bootstrap.mjs";

// ---------------------------------------------------------------- unit ----

test("parseArgs: `new <name>` fills defaults", () => {
  assert.deepEqual(parseArgs(["new", "learn-rust"]), {
    command: "new",
    name: "learn-rust",
    backup: undefined,
    from: DEFAULT_ENGINE,
    skipInstall: false,
  });
});

test("parseArgs: flags in any order take their value; --skip-install is boolean", () => {
  assert.deepEqual(
    parseArgs([
      "new",
      "learn-rust",
      "--backup",
      "https://x/y.git",
      "--from",
      "https://e/f",
      "--skip-install",
    ]),
    {
      command: "new",
      name: "learn-rust",
      backup: "https://x/y.git",
      from: "https://e/f",
      skipInstall: true,
    },
  );
});

test("parseArgs: a value-taking flag with no value is an error", () => {
  assert.match(parseArgs(["new", "x", "--backup"]).error, /--backup needs a value/);
  // and it must not swallow the following flag as its value
  assert.match(
    parseArgs(["new", "x", "--backup", "--skip-install"]).error,
    /--backup needs a value/,
  );
});

test("parseArgs: unknown flags and extra positionals are rejected", () => {
  assert.match(parseArgs(["new", "x", "--nope"]).error, /unknown flag "--nope"/);
  assert.match(parseArgs(["new", "x", "y"]).error, /too many arguments: y/);
});

test("nodeVersionOk: 18 is the floor", () => {
  assert.equal(nodeVersionOk("v18.0.0"), true);
  assert.equal(nodeVersionOk("v24.9.1"), true);
  assert.equal(nodeVersionOk("v16.20.2"), false);
  assert.equal(nodeVersionOk("v8.17.0"), false);
  assert.equal(nodeVersionOk("garbage"), false);
});

test("validateCourseName: plain names ok; separators and flag-shapes refused", () => {
  assert.deepEqual(validateCourseName("learn-rust"), { ok: true, name: "learn-rust" });
  assert.match(validateCourseName("").error, /missing <course-name>/);
  assert.match(validateCourseName("../escape").error, /plain directory name/);
  assert.match(validateCourseName("a/b").error, /plain directory name/);
  assert.match(validateCourseName("a\\b").error, /plain directory name/);
  assert.match(validateCourseName(".").error, /plain directory name/);
  assert.match(validateCourseName("-x").error, /can't start with "-"/);
});

test("remoteDance: the exact rename recipe, push omitted", () => {
  assert.deepEqual(remoteDance("https://github.com/me/backup.git"), [
    ["git", "remote", "rename", "origin", "upstream"],
    ["git", "remote", "add", "origin", "https://github.com/me/backup.git"],
  ]);
});

test("nextSteps: always cd/dev/new-course; backup adds a push hint", () => {
  const plain = nextSteps({ name: "learn-rust" }).join("\n");
  assert.match(plain, /cd learn-rust/);
  assert.match(plain, /npm run dev/);
  assert.match(plain, /click "new course"/);
  assert.doesNotMatch(plain, /push -u origin/);

  const withBackup = nextSteps({
    name: "learn-rust",
    backup: "https://github.com/me/backup.git",
    branch: "master",
  }).join("\n");
  assert.match(withBackup, /origin → https:\/\/github\.com\/me\/backup\.git/);
  assert.match(withBackup, /git -C learn-rust push -u origin master/);

  // --skip-install reinserts the install line the fast path prints for you
  assert.match(nextSteps({ name: "x", skipInstall: true }).join("\n"), /npm install/);
});

// -------------------------------------------------------- integration ----

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(scriptsDir, "..");
const bootstrap = path.join(scriptsDir, "bootstrap.mjs");

// run the CLI inside `cwd` so the clone lands in a throwaway dir, never the repo
const runIn = (cwd, args) =>
  spawnSync(process.execPath, [bootstrap, ...args], { cwd, encoding: "utf8" });
const git = (cwd, args) => spawnSync("git", args, { cwd, encoding: "utf8" });

const tempDirs = [];
function mkWork() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-boot-"));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});

test("bootstrap: --from local clone + --backup wires remotes and lands the tree", () => {
  const work = mkWork();
  const r = runIn(work, [
    "new",
    "mycourse",
    "--from",
    repoRoot,
    "--backup",
    "https://github.com/me/backup.git",
    "--skip-install",
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cloning .* into mycourse\/ \(full clone/);
  assert.match(r.stdout, /wiring remotes/);
  assert.match(r.stdout, /skipping npm install/);
  assert.match(r.stdout, /cd mycourse/);
  assert.match(r.stdout, /push -u origin/);

  // the FULL clone actually landed: engine files + a real .git
  const course = path.join(work, "mycourse");
  assert.ok(fs.existsSync(path.join(course, ".git")), "clone has no .git");
  assert.ok(fs.existsSync(path.join(course, "CLAUDE.md")), "clone missing CLAUDE.md");
  assert.ok(fs.existsSync(path.join(course, "package.json")), "clone missing package.json");

  // remotes flipped: origin → backup, upstream → the engine source
  const remotes = git(course, ["remote", "-v"]).stdout;
  assert.match(remotes, /origin\s+https:\/\/github\.com\/me\/backup\.git/);
  assert.match(remotes, /upstream\s/);
  assert.doesNotMatch(remotes, /origin\s+https:\/\/github\.com\/sqmch/);

  // re-running the same command refuses on the now-existing directory
  const again = runIn(work, ["new", "mycourse", "--from", repoRoot, "--skip-install"]);
  assert.equal(again.status, 1, again.stdout + again.stderr);
  assert.match(again.stderr, /refusing: "mycourse" already exists/);
});

test("bootstrap: without --backup the clone's origin is left pointing at the engine", () => {
  const work = mkWork();
  const r = runIn(work, ["new", "solo", "--from", repoRoot, "--skip-install"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /wiring remotes/);

  const remotes = git(path.join(work, "solo"), ["remote", "-v"]).stdout;
  assert.match(remotes, /origin\s/);
  assert.doesNotMatch(remotes, /upstream/); // no rename happened
});

test("bootstrap: `new` with no course name refuses with the usage", () => {
  const work = mkWork();
  const r = runIn(work, ["new"]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /missing <course-name>/);
  assert.match(r.stderr, /praxeum new <course-name>/);
});
