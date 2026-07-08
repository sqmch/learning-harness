// Unit tests for the pure logic extracted from server/index.ts. index.ts starts
// a server on import, so these decisions live in server/helpers.ts where they can
// be exercised as plain data → data. Grouped by the four seams the audit named:
// the PTY classifier, the path-escape guards, the module⋈progress merge, and
// resume freshness.
import { describe, test, expect } from "vitest";
import path from "node:path";
import {
  type ProcRow,
  classifyProcesses,
  tokenStem,
  normalizeStatus,
  mergeModule,
  guardRepoFile,
  guardVisualFile,
  mungeProjectDir,
  resumeFreshness,
} from "../server/helpers";

// ── PTY classifier ─────────────────────────────────────────────────────────
// The failure direction is the whole point: an unreadable or ambiguous tree
// must land on "unknown"/"busy" (refuse / don't submit), never "idle"/"agent"
// (type into the shell). Fixtures are small process trees rooted at the pty pid.

describe("classifyProcesses", () => {
  const PTY = 100;

  test("empty snapshot → unknown (we could not read the process list — fail safe)", () => {
    expect(classifyProcesses([], PTY, "claude")).toBe("unknown");
  });

  test("pty with no descendants → idle (safe to launch)", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "pwsh.exe" },
      { pid: 200, ppid: 999, cmd: "unrelated.exe" }, // different tree, ignored
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("idle");
  });

  test("only console-host noise under the pty → still idle", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "pwsh.exe" },
      { pid: 101, ppid: PTY, cmd: "C:\\Windows\\System32\\conhost.exe 0x4" },
      { pid: 102, ppid: PTY, cmd: "\\??\\C:\\OpenConsole.exe" },
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("idle");
  });

  test("agent by exact file stem, even nested and Windowsy (claude.CMD)", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "pwsh.exe" },
      { pid: 101, ppid: PTY, cmd: "conhost.exe" }, // noise between shell and agent
      { pid: 110, ppid: PTY, cmd: "C:\\Users\\x\\AppData\\npm\\claude.CMD" },
      { pid: 120, ppid: 110, cmd: "node C:\\...\\claude\\cli.js" },
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("agent");
  });

  test("agent matched by a later token on the command line, not just argv0", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "bash" },
      { pid: 130, ppid: PTY, cmd: "node /usr/local/bin/claude --resume" },
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("agent");
  });

  test("a lookalike stem is NOT the agent (claude-notes.md ≠ claude) → busy", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "bash" },
      { pid: 140, ppid: PTY, cmd: "vim claude-notes.md" },
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("busy");
  });

  test("some other program running → busy (refuse: not idle, not the agent)", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "pwsh.exe" },
      { pid: 150, ppid: PTY, cmd: "npm run dev" },
      { pid: 151, ppid: 150, cmd: "node vite" },
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("busy");
  });

  test("empty agentCmd never matches: a real descendant is busy, not agent", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "bash" },
      { pid: 160, ppid: PTY, cmd: "claude" },
    ];
    expect(classifyProcesses(rows, PTY, "")).toBe("busy");
    expect(classifyProcesses(rows, PTY, "   ")).toBe("busy");
  });

  test("descendants are followed transitively across the whole subtree", () => {
    const rows: ProcRow[] = [
      { pid: PTY, ppid: 1, cmd: "pwsh.exe" },
      { pid: 201, ppid: PTY, cmd: "conhost.exe" },
      { pid: 202, ppid: PTY, cmd: "npm.cmd exec" },
      { pid: 203, ppid: 202, cmd: "node launcher" },
      { pid: 204, ppid: 203, cmd: "C:\\bin\\claude.exe" }, // 3 levels down
    ];
    expect(classifyProcesses(rows, PTY, "claude")).toBe("agent");
  });
});

describe("tokenStem", () => {
  test("strips directories, quotes, and a single extension; lowercases", () => {
    expect(tokenStem("C:\\Program Files\\claude.CMD")).toBe("claude");
    expect(tokenStem('"/usr/local/bin/node"')).toBe("node");
    expect(tokenStem("claude")).toBe("claude");
    expect(tokenStem("vite.config.ts")).toBe("vite.config"); // only the last extension
    expect(tokenStem("")).toBe("");
  });
});

// ── module ⋈ progress merge + status normalization ─────────────────────────

describe("normalizeStatus", () => {
  test('"completed" (disk) → "complete" (UI); everything else passes through', () => {
    expect(normalizeStatus("completed")).toBe("complete");
    expect(normalizeStatus("in-progress")).toBe("in-progress");
    expect(normalizeStatus("complete")).toBe("complete");
    expect(normalizeStatus(undefined)).toBe("not-started"); // no progress entry yet
  });
});

describe("mergeModule", () => {
  const manifest = { id: "01-embeddings", title: "Embeddings", phase: 1 };

  test("overlays progress; normalizes status; keeps manifest fields", () => {
    const merged = mergeModule(
      manifest,
      { status: "completed", hintsUsed: ["hint-1"], checkAttempts: 3 },
      ["LESSON.md", "BRIEF.md"],
      { vectors: {} },
    );
    expect(merged).toEqual({
      id: "01-embeddings",
      title: "Embeddings",
      phase: 1,
      status: "complete",
      hintsUsed: ["hint-1"],
      checkAttempts: 3,
      docs: ["LESSON.md", "BRIEF.md"],
      lab: { vectors: {} },
    });
  });

  test("missing progress → neutral defaults (not-started, no hints, 0 attempts)", () => {
    const merged = mergeModule(manifest, undefined, [], null);
    expect(merged.status).toBe("not-started");
    expect(merged.hintsUsed).toEqual([]);
    expect(merged.checkAttempts).toBe(0);
    expect(merged.lab).toBe(null);
    expect(merged.docs).toEqual([]);
  });

  test("partial progress fills only the gaps it leaves", () => {
    const merged = mergeModule(manifest, { status: "in-progress" }, ["LESSON.md"], null);
    expect(merged.status).toBe("in-progress");
    expect(merged.hintsUsed).toEqual([]); // absent → default
    expect(merged.checkAttempts).toBe(0); // absent → default
  });
});

// ── path-escape guards ─────────────────────────────────────────────────────
// path.sep differs by platform, so we build roots with path.join/resolve and let
// the guard use whatever separator the host has. The adversarial inputs (`..`,
// absolute paths, wrong extensions) are what must be refused.

describe("guardRepoFile", () => {
  const root = path.resolve("/tmp/course-repo");

  test("an in-repo .md / .json path is allowed", () => {
    expect(guardRepoFile(root, "tutor/journal.md").ok).toBe(true);
    expect(guardRepoFile(root, "tutor/progress.json").ok).toBe(true);
  });

  test("wrong extension is refused even when safely in-repo", () => {
    expect(guardRepoFile(root, "README").ok).toBe(false); // no extension
    expect(guardRepoFile(root, "notes.txt").ok).toBe(false);
    expect(guardRepoFile(root, "config.md.txt").ok).toBe(false); // extname is .txt
  });

  test("`..` traversal that escapes the root is refused despite an ok extension", () => {
    expect(guardRepoFile(root, "../secret.md").ok).toBe(false);
    expect(guardRepoFile(root, "../../etc/evil.json").ok).toBe(false);
    expect(guardRepoFile(root, "tutor/../../outside.md").ok).toBe(false);
  });

  test("`..` that normalizes back inside the root is allowed (not an escape)", () => {
    // resolve-then-check is what makes this safe: it lands back in-repo
    expect(guardRepoFile(root, "tutor/../COURSE.md").ok).toBe(true);
  });

  test("an absolute path outside the root is refused", () => {
    const outside = path.resolve("/etc/passwd.md");
    expect(guardRepoFile(root, outside).ok).toBe(false);
  });

  test("the resolved abs path is returned for the caller to read", () => {
    const { abs } = guardRepoFile(root, "tutor/journal.md");
    expect(abs).toBe(path.join(root, "tutor", "journal.md"));
  });
});

describe("guardVisualFile", () => {
  const root = path.resolve("/tmp/course-repo");

  test("an .html file inside the module's visuals dir is allowed", () => {
    expect(guardVisualFile(root, "02-vector-store", "plane.html").ok).toBe(true);
  });

  test("a non-.html file in the right dir is refused", () => {
    expect(guardVisualFile(root, "02-vector-store", "data.json").ok).toBe(false);
    expect(guardVisualFile(root, "02-vector-store", "plane").ok).toBe(false);
  });

  test("traversal out of the visuals dir is refused (even to a sibling .html)", () => {
    expect(guardVisualFile(root, "02-vector-store", "../../evil.html").ok).toBe(false);
    expect(guardVisualFile(root, "02-vector-store", "../lab.html").ok).toBe(false);
  });

  test("the visuals dir itself (empty file) is not 'inside' it → refused", () => {
    // inDir requires startsWith(dir + sep): the dir is not strictly within itself
    expect(guardVisualFile(root, "02-vector-store", "").ok).toBe(false);
    expect(guardVisualFile(root, "02-vector-store", ".").ok).toBe(false);
  });

  test("an absolute path escaping the visuals dir is refused", () => {
    expect(guardVisualFile(root, "02-vector-store", path.resolve("/etc/evil.html")).ok).toBe(false);
  });
});

// ── resume freshness ───────────────────────────────────────────────────────

describe("mungeProjectDir", () => {
  test("every non-alphanumeric char becomes a dash (claude's project-dir rule)", () => {
    expect(mungeProjectDir("C:\\Users\\me\\dev\\fundaimentals")).toBe(
      "C--Users-me-dev-fundaimentals",
    );
    expect(mungeProjectDir("/home/me/dev/my.course")).toBe("-home-me-dev-my-course");
  });
});

describe("resumeFreshness", () => {
  const HOURS = 12;
  const now = Date.parse("2026-07-08T12:00:00Z");

  test("no transcript (newest 0) → not fresh, null age", () => {
    expect(resumeFreshness(0, now, HOURS)).toEqual({ fresh: false, ageMinutes: null });
  });

  test("a recent transcript is fresh, with a rounded minute age", () => {
    const tenMinAgo = now - 10 * 60_000;
    expect(resumeFreshness(tenMinAgo, now, HOURS)).toEqual({ fresh: true, ageMinutes: 10 });
  });

  test("exactly at the freshness boundary is still fresh (<=)", () => {
    const atBoundary = now - HOURS * 60 * 60_000; // 12h ago → 720 min
    expect(resumeFreshness(atBoundary, now, HOURS)).toEqual({ fresh: true, ageMinutes: 720 });
  });

  test("one minute past the boundary is stale", () => {
    const pastBoundary = now - (HOURS * 60 + 1) * 60_000; // 721 min ago
    expect(resumeFreshness(pastBoundary, now, HOURS)).toEqual({ fresh: false, ageMinutes: 721 });
  });
});
