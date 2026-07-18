/** Optional per-module math-lab config (curriculum/NN/lab.json). See LAB.md. */
export interface VectorLabConfig {
  axisX?: string;
  axisY?: string;
  a?: { role?: string; text?: string; v?: [number, number] };
  b?: { role?: string; text?: string; v?: [number, number] };
  presets?: {
    label: string;
    a: [number, number];
    b: [number, number];
    aText?: string;
    bText?: string;
  }[];
}
/** Config for the Chunking & Overlap lab — words stand in for tokens. */
export interface ChunkingLabConfig {
  /** The document to chunk (whitespace-split; each word is a token stand-in). */
  text?: string;
  /** Initial chunk size, in tokens. */
  size?: number;
  /** Initial overlap, in tokens. */
  overlap?: number;
  /** Half-open token range [start, end) of a "fact" to track across boundaries. */
  factSpan?: [number, number];
  /** Human label for the tracked fact, e.g. "runs on port 5173". */
  factLabel?: string;
  presets?: { label: string; size: number; overlap: number }[];
}
/** Config for the Top-k Retrieval lab — a 2-D corpus, a query, and the k knob. */
export interface TopkLabConfig {
  axisX?: string;
  axisY?: string;
  /** The draggable query point (a direction in the same 2-D space as the corpus). */
  query?: { text?: string; v?: [number, number] };
  /** The corpus: short chunk texts at 2-D positions (plane range ±3, like the vectors lab). */
  corpus?: { text: string; v: [number, number] }[];
  /** Initial k — how many chunks retrieval returns unconditionally. */
  k?: number;
  /** Similarity-threshold floor (LESSON 03 §7): a top score below it means "refuse". */
  floor?: number;
  presets?: { label: string; query: [number, number]; k: number }[];
}
/** One ranked retrieval result in the Precision & Recall lab's golden-set list. */
export interface RankedItem {
  /** Short label for the retrieved chunk (e.g. a source path + snippet). */
  text: string;
  /** Whether this chunk is actually relevant to the question (the golden-set truth). */
  relevant: boolean;
}
/** Config for the Precision & Recall lab — a ranked list and a cutoff. */
export interface PrecisionRecallLabConfig {
  /** The ranked retrieval list, best-first; array order is the rank. */
  items?: RankedItem[];
  /** Initial cutoff k (how far down the ranking counts as "retrieved"). */
  cutoff?: number;
  /** Characteristic shapes to load; each may carry its own ranking and cutoff. */
  presets?: { label: string; items?: RankedItem[]; cutoff?: number }[];
}
/** A course-owned visualization: a self-contained HTML file under the module's visuals/. */
export interface VisualDef {
  /** Filename inside the module's visuals/ dir (a leading "visuals/" is tolerated). */
  file: string;
  title: string;
  /** One line: what you'll feel by playing with it. */
  blurb?: string;
}
export interface ModuleLabConfig {
  /** What the learner is currently wrestling with — shown as a callout in the lab. */
  focus?: string;
  /**
   * Id of the lab entry the `focus` text is written for. When a module claims
   * several visuals, this picks which one shows the callout and which one the
   * overlay opens to. Absent → the module's first visual.
   */
  focusLab?: string;
  /**
   * Claiming a stock lab = carrying its config key. The engine ships the
   * components; the course decides (via lab.json) which modules they serve.
   */
  vectors?: VectorLabConfig;
  chunking?: ChunkingLabConfig;
  topk?: TopkLabConfig;
  "precision-recall"?: PrecisionRecallLabConfig;
  /** Course-generated visuals (self-contained HTML, rendered in sandboxed iframes). */
  visuals?: VisualDef[];
}

export interface ModuleInfo {
  id: string;
  title: string;
  phase: number;
  /** Optional display name for the phase (from module.json); rail falls back to "Phase N". */
  phaseName?: string;
  prerequisites: string[];
  runtime: string;
  estimatedHours: number;
  bossCheck?: boolean;
  status: "not-started" | "in-progress" | "complete" | string;
  hintsUsed: string[];
  checkAttempts: number;
  docs: string[];
  lab?: ModuleLabConfig | null;
  /** Whether the scaffold has a runnable `check` script — gates the run-checks
   *  lens. Derived server-side; false when there's nothing to run. */
  hasChecks?: boolean;
}

export interface Course {
  repoRoot: string;
  currentModule: string | null;
  learner: { profile?: string } | null;
  modules: ModuleInfo[];
}

export async function fetchCourse(): Promise<Course> {
  const res = await fetch("/api/course");
  if (!res.ok) throw new Error(`course fetch failed: ${res.status}`);
  return res.json();
}

/** One check from the session-close doctor (scripts/doctor.mjs --json contract). */
export interface DoctorResult {
  id: string;
  level: "ok" | "warn" | "fail";
  message: string;
}
export interface DoctorReport {
  results: DoctorResult[];
  /** ISO timestamp of when the server ran the doctor. */
  checkedAt: string;
  /** false when the doctor couldn't be spawned — the UI degrades to no banner. */
  ok?: boolean;
}

/** Ask the server to run the doctor and report its findings. Never throws for
 *  "found problems" — a non-empty `results` with `fail` entries is the signal. */
export async function fetchDoctor(): Promise<DoctorReport> {
  const res = await fetch("/api/doctor");
  if (!res.ok) throw new Error(`doctor fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchFile(path: string): Promise<string> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return data.content as string;
}

// ── check-run lens ──────────────────────────────────────────────────────────
// An independent `npm run check` path used by both UI buttons, even while the
// tutor owns the PTY. The result is EPHEMERAL: it lives in React state, is never
// persisted, and is gone on reload.
export type CheckOutcome = "pass" | "fail" | "crash" | "no-checks";
export interface CheckSummary {
  outcome: CheckOutcome;
  total: number;
  passed: number;
  failed: number;
  /** Present on `fail`: the "describe > test" path of each failing test. */
  failedNames?: string[];
  /** A plain one-liner for `crash`/`no-checks`. */
  detail?: string;
}
/** The single-flight refusal shape (HTTP 409) — one run at a time per server. */
export type CheckRunResponse = CheckSummary | { busy: true };

/** One module's check-run status as the study holds it — ephemeral, keyed by
 *  module id in App state. The study owns zero durable state: this lives only in
 *  React and dies on reload. */
export interface CheckRunState {
  phase: "running" | "done" | "error";
  summary?: CheckSummary;
  error?: string;
}

/** Ask the server to run a module's checks once and summarize them. Returns
 *  `{ busy: true }` when another run is already in flight (409). Throws only on
 *  an unexpected transport/server error. */
export async function runChecks(moduleId: string): Promise<CheckRunResponse> {
  const res = await fetch(`/api/checks/${encodeURIComponent(moduleId)}`, { method: "POST" });
  if (res.status === 409) return { busy: true };
  if (!res.ok) throw new Error(`check run failed: ${res.status}`);
  return res.json();
}
