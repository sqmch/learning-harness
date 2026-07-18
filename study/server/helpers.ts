// Pure, side-effect-free logic lifted out of server/index.ts so it can be unit
// tested without booting the server (index.ts starts listening on import). Every
// function here is data → data: no fs, no network, no process spawning. index.ts
// keeps the I/O (reading files, listing processes, statting transcripts) and
// delegates the decisions to these helpers. Behavior must stay byte-identical to
// the inline versions these replaced.

import path from "node:path";

// ── PTY classification ─────────────────────────────────────────────────────
// The quick-action buttons must never type into the wrong program, so before
// acting the client asks what the shell is running. Detection walks the shell's
// process tree; the failure mode is deliberate — an ambiguous or unreadable tree
// degrades to "unknown"/"busy" (refusal), never to "idle"/"agent" (a paste).

export interface ProcRow {
  pid: number;
  ppid: number;
  cmd: string;
}

export type PtyState = "idle" | "agent" | "busy" | "unknown";

// ── detached editor launch ──────────────────────────────────────────────────

/** The editor preference is a local shell command (built-ins are `code`, `zed`,
 * and `cursor`). Keep it one line and bounded before handing it to a detached
 * shell; arguments are intentionally allowed so custom choices such as
 * `code --reuse-window` keep working. */
export function validEditorCommand(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 1024 &&
    !/[\0\r\n]/.test(value)
  );
}

/** Append the repo root as one shell-safe argument to a user-configured editor
 * command. PowerShell and POSIX shells use different single-quote escaping. */
export function editorLaunchCommand(
  editorCommand: string,
  repoRoot: string,
  platform: NodeJS.Platform,
): string {
  const escaped =
    platform === "win32" ? repoRoot.replace(/'/g, "''") : repoRoot.replace(/'/g, `'"'"'`);
  return `${editorCommand.trim()} '${escaped}'`;
}

// ConPTY console hosts appear inside the tree but are not learner programs.
export const NOISE_STEMS = new Set(["conhost", "openconsole"]);

/** "C:\\...\\claude.CMD" → "claude"; "node" → "node" */
export const tokenStem = (token: string): string => {
  const base = token.replace(/["']/g, "").split(/[\\/]/).pop() ?? "";
  return base.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase();
};

/**
 * Classify the shell owning `ptyPid` from a process snapshot. An empty snapshot
 * (we could not read the process list) is "unknown"; a tree with no real
 * descendants is "idle"; a descendant whose command line carries the agent's
 * file stem is "agent"; anything else running is "busy".
 */
export function classifyProcesses(rows: ProcRow[], ptyPid: number, agentCmd: string): PtyState {
  if (rows.length === 0) return "unknown";
  const byParent = new Map<number, ProcRow[]>();
  for (const r of rows) {
    if (!byParent.has(r.ppid)) byParent.set(r.ppid, []);
    byParent.get(r.ppid)!.push(r);
  }
  const descendants: ProcRow[] = [];
  const queue = [ptyPid];
  while (queue.length) {
    for (const child of byParent.get(queue.shift()!) ?? []) {
      descendants.push(child);
      queue.push(child.pid);
    }
  }
  const real = descendants.filter((d) => !NOISE_STEMS.has(tokenStem(d.cmd.split(/\s+/)[0] ?? "")));
  if (real.length === 0) return "idle";
  // agent match: some token of some descendant's command line has the agent's
  // name as its exact file stem ("claude.cmd" yes, "claude-notes.md" no)
  const agentStem = tokenStem(agentCmd.trim().split(/\s+/)[0] ?? "");
  const isAgent =
    agentStem !== "" &&
    real.some((d) => d.cmd.split(/\s+/).some((t) => tokenStem(t) === agentStem));
  return isAgent ? "agent" : "busy";
}

// ── course: module manifest ⋈ progress ─────────────────────────────────────

export interface RawModuleProgress {
  status?: string;
  hintsUsed?: string[];
  checkAttempts?: number;
  [k: string]: unknown;
}

export interface MergedModule {
  id: string;
  status: string;
  hintsUsed: string[];
  checkAttempts: number;
  docs: string[];
  lab: unknown;
  /** Whether the scaffold carries a runnable `check` script — gates the study's
   *  on-demand check-run lens (POST /api/checks/:id). Derived, never stored. */
  hasChecks: boolean;
  [k: string]: unknown;
}

/** progress.json writes "completed"; the UI keys on "complete" — normalize.
 *  Absent status is a module the learner has not reached yet. */
export function normalizeStatus(rawStatus?: string): string {
  const raw = rawStatus ?? "not-started";
  return raw === "completed" ? "complete" : raw;
}

/** Does a scaffold's parsed package.json expose a runnable `check` script? This
 *  is exactly what `npm run check` (and the check-run lens) needs; a module
 *  missing it has no runnable checks and the affordance stays hidden. Tolerates
 *  any hand-edited shape — only a string `scripts.check` counts. */
export function hasRunnableCheck(pkg: unknown): boolean {
  if (!pkg || typeof pkg !== "object") return false;
  const scripts = (pkg as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== "object") return false;
  return typeof (scripts as { check?: unknown }).check === "string";
}

/** Overlay a module's progress onto its manifest — the shape /api/course serves.
 *  Missing progress fields fall back to neutral defaults so a module the learner
 *  has not started still renders. */
export function mergeModule(
  manifest: Record<string, unknown>,
  progressEntry: RawModuleProgress | undefined,
  docs: string[],
  lab: unknown,
  hasChecks: boolean,
): MergedModule {
  const p = progressEntry ?? {};
  return {
    ...manifest,
    status: normalizeStatus(p.status),
    hintsUsed: p.hintsUsed ?? [],
    checkAttempts: p.checkAttempts ?? 0,
    docs,
    lab,
    hasChecks,
  } as MergedModule;
}

// ── path-escape guards ─────────────────────────────────────────────────────
// Both guards resolve the requested path first, then confirm it stays inside
// its allowed root and carries an allowed extension. Resolving before checking
// is what neutralizes traversal: "../secret" and an absolute path both normalize
// to something outside the root and get refused.

const REPO_FILE_EXTS = [".md", ".json"];

/** Guard for GET /api/file: a repo-rooted read limited to .md / .json.
 *  ok when the resolved path is the repo root or inside it AND has an allowed
 *  extension. Returns the resolved absolute path for the caller to read. */
export function guardRepoFile(repoRoot: string, rel: string): { abs: string; ok: boolean } {
  const abs = path.resolve(repoRoot, rel);
  const inRepo = abs === repoRoot || abs.startsWith(repoRoot + path.sep);
  const allowed = REPO_FILE_EXTS.includes(path.extname(abs).toLowerCase());
  return { abs, ok: inRepo && allowed };
}

/** Guard for GET /visual/:moduleId/:file: only curriculum/<module>/visuals/*.html.
 *  ok when the resolved path is strictly inside the module's visuals dir (not the
 *  dir itself) AND ends in .html. */
export function guardVisualFile(
  repoRoot: string,
  moduleId: string,
  file: string,
): { abs: string; visualsDir: string; ok: boolean } {
  const visualsDir = path.join(repoRoot, "curriculum", moduleId, "visuals");
  const abs = path.resolve(visualsDir, file);
  const inDir = abs.startsWith(path.resolve(visualsDir) + path.sep);
  const ok = inDir && path.extname(abs).toLowerCase() === ".html";
  return { abs, visualsDir, ok };
}

/** Guard for POST /api/checks/:moduleId: the module id must be a single
 *  curriculum segment (no separators, no `..`), so the resolved scaffold dir
 *  stays directly under curriculum/. Same resolve-then-check discipline as the
 *  file guards — the check runner spawns a process in this dir, so an escape
 *  here would run `npm` somewhere it shouldn't. */
export function guardModuleDir(
  repoRoot: string,
  moduleId: string,
): { moduleDir: string; scaffoldDir: string; ok: boolean } {
  const curriculum = path.resolve(repoRoot, "curriculum");
  const moduleDir = path.resolve(curriculum, moduleId);
  // exactly one level below curriculum/ — rejects "", ".", "..", "a/b", absolute paths
  const ok = path.dirname(moduleDir) === curriculum && moduleDir !== curriculum;
  return { moduleDir, scaffoldDir: path.join(moduleDir, "scaffold"), ok };
}

// ── resume-freshness ───────────────────────────────────────────────────────

/** claude stores transcripts under ~/.claude/projects/<cwd with every
 *  non-alphanumeric char replaced by "-">. This computes that directory name. */
export function mungeProjectDir(repoRoot: string): string {
  return repoRoot.replace(/[^a-zA-Z0-9]/g, "-");
}

/** Decide whether the newest transcript is fresh enough to offer a resume.
 *  newestMs === 0 means there is no transcript at all → not fresh, no age. */
export function resumeFreshness(
  newestMs: number,
  nowMs: number,
  freshHours: number,
): { fresh: boolean; ageMinutes: number | null } {
  if (!newestMs) return { fresh: false, ageMinutes: null };
  const ageMinutes = Math.round((nowMs - newestMs) / 60000);
  return { fresh: ageMinutes <= freshHours * 60, ageMinutes };
}

// ── check-run summary ──────────────────────────────────────────────────────
// The study's on-demand check lens (POST /api/checks/:id) spawns a module's
// `npm run check` and parses vitest's summary into structured, EPHEMERAL data —
// never written anywhere. This parse is the counterpart to scripts/qa-module.mjs's
// `classify` (same proven regexes: the "Tests" summary line, "No test files
// found"), narrowed to the taxonomy this lens shows the learner:
//   pass       — tests ran, none failed
//   fail       — tests ran, ≥1 failed (assertion OR thrown-in-test; both are a
//                real failure the learner should see)
//   no-checks  — nothing to run (empty checks dir / zero tests)
//   crash      — the runner produced no test summary at all (import/syntax error,
//                timeout): the harness measured nothing, and says so loudly
// It is deliberately NOT imported from qa-module.mjs: that is a repo-root ESM
// script outside the study's tsconfig (allowJs off), so a direct import would not
// typecheck. Kept here, typed and unit-tested, it stays in the study workspace.

export type CheckOutcome = "pass" | "fail" | "crash" | "no-checks";

export interface CheckSummary {
  outcome: CheckOutcome;
  total: number;
  passed: number;
  failed: number;
  /** Present on `fail`: the "describe > test" path of each failing test. */
  failedNames?: string[];
  /** A plain one-liner for `crash`/`no-checks` the UI can state verbatim. */
  detail?: string;
}

// matching the ESC (\x1b) control char is unavoidable to strip terminal colour
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Pull each failing test's "describe > test" path out of vitest's "Failed
 *  Tests" section. Its ` FAIL  <file> > <describe> > <test>` lines are the
 *  cleanest machine-readable form (no trailing duration); the leading file path
 *  is stripped so the name reads as the test, not the file. */
function extractFailedNames(out: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*FAIL\s+(.+?)\s*$/);
    if (!m) continue;
    let name = m[1];
    const gt = name.indexOf(" > ");
    if (gt !== -1) name = name.slice(gt + 3); // drop "file.test.ts > "
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/** Parse a completed `npm run check` run (combined stdout+stderr) into the lens
 *  taxonomy. `timedOut` short-circuits to a crash — a killed run never printed a
 *  trustworthy summary. Pure: no I/O, no clock. */
export function parseCheckRun(output: string, timedOut = false): CheckSummary {
  const zero = { total: 0, passed: 0, failed: 0 };
  if (timedOut) return { outcome: "crash", ...zero, detail: "the check run timed out (over 120s)" };
  const out = output.replace(ANSI, "");
  if (/No test files? found/i.test(out))
    return { outcome: "no-checks", ...zero, detail: "no test files found in this module" };
  // the per-test summary line ("Tests  N failed | M passed (T)"), NOT "Test Files"
  const m = out.match(/^\s*Tests\s+(.+)$/m);
  if (!m)
    return {
      outcome: "crash",
      ...zero,
      detail: "the checks produced no test summary — they crashed before running",
    };
  const tail = m[1];
  const failed = Number((tail.match(/(\d+)\s+failed/) || [])[1] || 0);
  const passed = Number((tail.match(/(\d+)\s+passed/) || [])[1] || 0);
  const total = Number((tail.match(/\((\d+)\)\s*$/) || [])[1] || failed + passed);
  if (total === 0) return { outcome: "no-checks", ...zero, detail: "no tests ran" };
  if (failed === 0) return { outcome: "pass", total, passed, failed };
  return { outcome: "fail", total, passed, failed, failedNames: extractFailedNames(out) };
}
