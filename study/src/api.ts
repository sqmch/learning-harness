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
