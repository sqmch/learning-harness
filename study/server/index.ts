import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { spawn } from "@lydell/node-pty";
import {
  type ProcRow,
  type PtyState,
  classifyProcesses,
  mergeModule,
  guardRepoFile,
  guardVisualFile,
  mungeProjectDir,
  resumeFreshness,
} from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Which repo holds the course? Default: the repo this study lives in — the
// clone-and-go case, where the learner's course grows inside their harness
// clone. Overridable for external course repos (e.g. an instance that predates
// the engine): `--repo <path>` or the HARNESS_REPO env var.
function resolveRepoRoot(): string {
  const argIdx = process.argv.indexOf("--repo");
  const fromArg = argIdx !== -1 ? process.argv[argIdx + 1] : undefined;
  const chosen = fromArg ?? process.env.HARNESS_REPO ?? path.resolve(__dirname, "..", "..");
  const root = path.resolve(chosen);
  if (!fs.existsSync(path.join(root, "curriculum"))) {
    console.warn(
      `[study] no curriculum/ under ${root} — serving anyway (say "new course" to your ` +
        `agent to onboard, or point me at a course repo with --repo <path> / HARNESS_REPO)`,
    );
  }
  return root;
}
const REPO_ROOT = resolveRepoRoot();
// Overridable so two courses (two clones) can run side by side; vite.config.ts
// reads the same variable, so one `PORT=7332 npm run dev` moves both ends.
const PORT = Number(process.env.PORT || 7331);

const app = express();

// ---------- course: manifests merged with progress ----------
app.get("/api/course", (_req, res) => {
  try {
    const curriculumDir = path.join(REPO_ROOT, "curriculum");
    const progressPath = path.join(REPO_ROOT, "tutor", "progress.json");
    // a hand-edit typo in any JSON file must degrade gracefully, never brick the UI.
    // `any` is deliberate: this parses arbitrary hand-edited JSON that the merge
    // logic below reads structurally (progress.modules, manifest.id, …); `unknown`
    // would force assertions through all of it without buying real safety.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readJson = (p: string): any | null => {
      try {
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
      } catch (err) {
        console.warn(`[study] malformed JSON ignored: ${p} (${err})`);
        return null;
      }
    };
    const progress = readJson(progressPath) ?? { modules: {}, currentModule: null };

    // no curriculum/ at all = a fresh clone before onboarding — an empty course,
    // not an error (the UI greets and points at "new course")
    const moduleDirs = fs.existsSync(curriculumDir)
      ? fs.readdirSync(curriculumDir, { withFileTypes: true })
      : [];
    const modules = moduleDirs
      .filter((d) => d.isDirectory())
      .map((d) => {
        const manifestPath = path.join(curriculumDir, d.name, "module.json");
        const manifest = readJson(manifestPath);
        if (!manifest) return null;
        const p = progress.modules?.[manifest.id];
        const docs = ["LESSON.md", "BRIEF.md", "quiz.md"].filter((f) =>
          fs.existsSync(path.join(curriculumDir, d.name, f)),
        );
        // optional per-module math-lab config (generated from LESSON/BRIEF; see LAB.md)
        const lab = readJson(path.join(curriculumDir, d.name, "lab.json"));
        // merge + "completed"→"complete" normalization lives in helpers (unit-tested)
        return mergeModule(manifest, p, docs, lab);
      })
      .filter(Boolean)
      .sort((a, b) => a!.id.localeCompare(b!.id));

    res.json({
      repoRoot: REPO_ROOT,
      currentModule: progress.currentModule ?? null,
      learner: progress.learner ?? null,
      modules,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------- file reader (repo-rooted, md/json only) ----------
app.get("/api/file", (req, res) => {
  const rel = String(req.query.path ?? "");
  const { abs, ok } = guardRepoFile(REPO_ROOT, rel);
  if (!ok) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ path: rel, content: fs.readFileSync(abs, "utf8") });
});

// ---------- course visuals: self-contained HTML, sandboxed + offline ----------
// Serves ONLY curriculum/<module>/visuals/<file>.html. The CSP makes the
// protocol rule ("visuals must be self-contained") mechanical: no external
// scripts, styles, fonts, fetches, or images — inline everything, data: URIs
// for assets. The client additionally renders these in sandboxed iframes.
app.get("/visual/:moduleId/:file", (req, res) => {
  const { moduleId, file } = req.params as { moduleId: string; file: string };
  const { abs, ok } = guardVisualFile(REPO_ROOT, moduleId, file);
  if (!ok) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.set({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
      "img-src data: blob:; media-src data: blob:; font-src data:",
  });
  res.send(fs.readFileSync(abs, "utf8"));
});

// ---------- PTY state: what's running inside the learner's terminal ----------
// The quick-action buttons must never type into the wrong program. Before
// acting, the client asks (over the ws that owns the PTY) what state the
// shell is in: "idle" (safe to launch), "agent" (the tutor CLI is running),
// or "busy" (something else — refuse). Detection walks the shell's process
// tree. The failure mode is deliberate: a misread degrades to "busy"/
// "unknown", i.e. to refusal or an unsubmitted paste — never to typing into
// the wrong program.

function listProcesses(): Promise<ProcRow[]> {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
        ],
        { maxBuffer: 32 * 1024 * 1024, timeout: 8000, windowsHide: true },
        (err, stdout) => {
          if (err) return resolve([]);
          try {
            const raw = JSON.parse(stdout);
            const arr = Array.isArray(raw) ? raw : [raw];
            resolve(
              arr.map((p: Record<string, unknown>) => ({
                pid: Number(p.ProcessId),
                ppid: Number(p.ParentProcessId),
                cmd: String(p.CommandLine ?? p.Name ?? ""),
              })),
            );
          } catch {
            resolve([]);
          }
        },
      );
    } else {
      execFile(
        "ps",
        ["-eo", "pid=,ppid=,args="],
        { maxBuffer: 8 * 1024 * 1024, timeout: 8000 },
        (err, stdout) => {
          if (err) return resolve([]);
          resolve(
            stdout.split("\n").flatMap((line) => {
              const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
              return m ? [{ pid: +m[1], ppid: +m[2], cmd: m[3] }] : [];
            }),
          );
        },
      );
    }
  });
}

// Tree-walk classification (idle / agent / busy / unknown) is a pure function of
// the process snapshot — see server/helpers.ts, where it is unit-tested.
async function classifyPty(ptyPid: number, agentCmd: string): Promise<PtyState> {
  return classifyProcesses(await listProcesses(), ptyPid, agentCmd);
}

// ---------- resume probe: a fresh claude conversation for this repo? ----------
// claude stores transcripts per working directory under
// ~/.claude/projects/<cwd with every non-alphanumeric char replaced by "-">,
// so this is directory-scoped: resuming can never pull in another project's
// conversation. Other agents don't get a probe (codex's resume --last is
// global, which would risk exactly that).
const RESUME_FRESH_HOURS = 12;
app.get("/api/resume", (_req, res) => {
  try {
    const dir = path.join(os.homedir(), ".claude", "projects", mungeProjectDir(REPO_ROOT));
    let newest = 0;
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".jsonl")) continue;
        const t = fs.statSync(path.join(dir, f)).mtimeMs;
        if (t > newest) newest = t;
      }
    }
    res.json(resumeFreshness(newest, Date.now(), RESUME_FRESH_HOURS));
  } catch (err) {
    res.json({ fresh: false, ageMinutes: null, error: String(err) });
  }
});

// ---------- session-close doctor: surface an unclosed session ----------
// Shells out to the engine's scripts/doctor.mjs — the same script `npm run
// doctor` runs — with --json, and hands its stable [{id,level,message}] array
// to the study, which raises a topbar banner on any `fail`. The doctor is
// READ-ONLY and so is this: the study still owns zero state. The script is
// resolved next to the study package (in an instance the engine scripts live
// in the same clone), while REPO_ROOT is passed as the doctor's *target* — so a
// study pointed at another repo via --repo/HARNESS_REPO checks that repo with
// the engine's own code. Exit 1 means "found problems", not an HTTP error, so we
// parse stdout regardless of exit code; only a genuine spawn failure (the script
// missing in an odd deployment) degrades to an empty result set — the UI then
// shows nothing rather than nagging with an error state.
const DOCTOR_SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "doctor.mjs");
let doctorSpawnWarned = false;
app.get("/api/doctor", (_req, res) => {
  const checkedAt = new Date().toISOString();
  const degrade = (why: string) => {
    if (!doctorSpawnWarned) {
      // once per process: a 60s poll must not spam the console
      console.warn(`[study] doctor unavailable (${why}) — /api/doctor degrades to no banner`);
      doctorSpawnWarned = true;
    }
    res.json({ results: [], checkedAt, ok: false });
  };
  if (!fs.existsSync(DOCTOR_SCRIPT)) {
    degrade(`no script at ${DOCTOR_SCRIPT}`);
    return;
  }
  execFile(
    process.execPath,
    [DOCTOR_SCRIPT, REPO_ROOT, "--json"],
    { timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    (err, stdout) => {
      // Parse first: a clean exit and a findings exit (code 1) both print the
      // contract JSON. A parse failure means the process never produced it
      // (ENOENT, crash, timeout) — that, and only that, degrades.
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        degrade(err ? String(err) : "doctor produced no JSON");
        return;
      }
      if (!Array.isArray(parsed)) {
        degrade("doctor JSON was not an array");
        return;
      }
      res.json({ results: parsed, checkedAt });
    },
  );
});

// ---------- static (production build, if present) ----------
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|term).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// ---------- terminal: PTY over WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/term" });

wss.on("connection", (ws) => {
  const shell =
    process.platform === "win32"
      ? fs.existsSync("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
        ? "pwsh.exe"
        : "powershell.exe"
      : process.env.SHELL || "bash";

  const pty = spawn(shell, [], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: REPO_ROOT,
    env: process.env as Record<string, string>,
  });

  // PTY output travels as BINARY frames; control messages (agent-state) as
  // text frames — so terminal bytes can never be mistaken for protocol JSON
  pty.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(Buffer.from(data, "utf8"));
  });
  pty.onExit(() => ws.close());

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input") pty.write(msg.data);
      else if (msg.type === "resize") pty.resize(msg.cols, msg.rows);
      else if (msg.type === "agent-state") {
        classifyPty(pty.pid, String(msg.agentCmd ?? "")).then((state) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "agent-state", id: msg.id, state }));
          }
        });
      }
    } catch {
      /* ignore malformed frames */
    }
  });
  ws.on("close", () => pty.kill());
  // an unhandled 'error' (e.g. ECONNRESET from an abruptly killed tab) would
  // crash the whole server, taking every terminal down with it
  ws.on("error", (err) => {
    console.warn(`[study] terminal ws error: ${err}`);
    pty.kill();
  });
});
wss.on("error", (err) => console.error(`[study] wss error: ${err}`));

// fail LOUDLY on a busy port — dying quietly here leaves vite serving a UI
// with no API behind it, which reads as "is it running?" in the browser
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n[study] ERROR: port ${PORT} is already in use — another study (or a stale ` +
        `node process from an earlier run) is holding it.\n[study] Close the other one, ` +
        `run this one on its own port (PORT=${PORT + 1} npm run dev), or on Windows: ` +
        `Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ` +
        `%% { Stop-Process -Id $_.OwningProcess -Force }\n`,
    );
  } else {
    console.error(`[study] server error: ${err}`);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[study] serving repo ${REPO_ROOT}`);
  console.log(`[study] api+term on http://127.0.0.1:${PORT}`);
});
