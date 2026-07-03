import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { spawn } from "@lydell/node-pty";

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
    // a hand-edit typo in any JSON file must degrade gracefully, never brick the UI
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
        const p = progress.modules?.[manifest.id] ?? {};
        const docs = ["LESSON.md", "BRIEF.md", "quiz.md"].filter((f) =>
          fs.existsSync(path.join(curriculumDir, d.name, f)),
        );
        // optional per-module math-lab config (generated from LESSON/BRIEF; see LAB.md)
        const lab = readJson(path.join(curriculumDir, d.name, "lab.json"));
        // progress.json writes "completed"; the UI keys on "complete" — normalize here
        const rawStatus = p.status ?? "not-started";
        const status = rawStatus === "completed" ? "complete" : rawStatus;
        return {
          ...manifest,
          status,
          hintsUsed: p.hintsUsed ?? [],
          checkAttempts: p.checkAttempts ?? 0,
          docs,
          lab,
        };
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
  const abs = path.resolve(REPO_ROOT, rel);
  const inRepo = abs === REPO_ROOT || abs.startsWith(REPO_ROOT + path.sep);
  const allowed = [".md", ".json"].includes(path.extname(abs).toLowerCase());
  if (!inRepo || !allowed) {
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
  const visualsDir = path.join(REPO_ROOT, "curriculum", moduleId, "visuals");
  const abs = path.resolve(visualsDir, file);
  const inDir = abs.startsWith(path.resolve(visualsDir) + path.sep);
  if (!inDir || path.extname(abs).toLowerCase() !== ".html") {
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

  pty.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  pty.onExit(() => ws.close());

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input") pty.write(msg.data);
      else if (msg.type === "resize") pty.resize(msg.cols, msg.rows);
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
