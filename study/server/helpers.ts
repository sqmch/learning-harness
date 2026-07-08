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
  [k: string]: unknown;
}

/** progress.json writes "completed"; the UI keys on "complete" — normalize.
 *  Absent status is a module the learner has not reached yet. */
export function normalizeStatus(rawStatus?: string): string {
  const raw = rawStatus ?? "not-started";
  return raw === "completed" ? "complete" : raw;
}

/** Overlay a module's progress onto its manifest — the shape /api/course serves.
 *  Missing progress fields fall back to neutral defaults so a module the learner
 *  has not started still renders. */
export function mergeModule(
  manifest: Record<string, unknown>,
  progressEntry: RawModuleProgress | undefined,
  docs: string[],
  lab: unknown,
): MergedModule {
  const p = progressEntry ?? {};
  return {
    ...manifest,
    status: normalizeStatus(p.status),
    hintsUsed: p.hintsUsed ?? [],
    checkAttempts: p.checkAttempts ?? 0,
    docs,
    lab,
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
