import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCourse, type Course } from "./api";
import { Rail } from "./components/Rail";
import { DocPane } from "./components/DocPane";
import { TerminalPane } from "./components/TerminalPane";
import { WelcomePane } from "./components/WelcomePane";
import { LabOverlay } from "./lab/LabOverlay";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function App() {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [labOpen, setLabOpen] = useState(false);

  const [railW, setRailW] = useState(() => Number(localStorage.getItem("ck.railW")) || 290);
  const [termW, setTermW] = useState(() => Number(localStorage.getItem("ck.termW")) || 480);
  const drag = useRef<null | { which: "rail" | "term"; startX: number; startW: number }>(null);

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdRaw(id);
    localStorage.setItem("ck.selected", id);
  }, []);

  const load = useCallback(async () => {
    try {
      const c = await fetchCourse();
      setCourse(c);
      setSelectedIdRaw((prev) => {
        if (prev) return prev;
        const remembered = localStorage.getItem("ck.selected");
        if (remembered && c.modules.some((m) => m.id === remembered)) return remembered;
        return c.currentModule ?? c.modules[0]?.id ?? null;
      });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // while the repo has no course, poll — the page flips into the course view
  // the moment onboarding (in the embedded terminal) writes the first module,
  // without the learner ever leaving the cockpit
  const isEmpty = course != null && course.modules.length === 0;
  useEffect(() => {
    if (!isEmpty) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [isEmpty, load]);

  // ── pane resizing ──
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      if (d.which === "rail") setRailW(clamp(d.startW + dx, 220, 460));
      else setTermW(clamp(d.startW - dx, 320, 940));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("dragging");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  useEffect(() => localStorage.setItem("ck.railW", String(railW)), [railW]);
  useEffect(() => localStorage.setItem("ck.termW", String(termW)), [termW]);

  const startDrag = (which: "rail" | "term") => (e: React.MouseEvent) => {
    drag.current = { which, startX: e.clientX, startW: which === "rail" ? railW : termW };
    document.body.classList.add("dragging");
    e.preventDefault();
  };

  const selected = useMemo(
    () => course?.modules.find((m) => m.id === selectedId) ?? null,
    [course, selectedId],
  );

  const currentModule = course?.currentModule ?? null;
  const moduleConfig = useMemo(
    () => course?.modules.find((m) => m.id === currentModule)?.lab ?? null,
    [course, currentModule],
  );

  const done = course?.modules.filter((m) => m.status === "complete").length ?? 0;
  const total = course?.modules.length ?? 0;

  if (error) {
    return (
      <div className="boot-error">
        <h1>cockpit</h1>
        <p>Couldn't reach the course server.</p>
        <pre>{error}</pre>
        <p className="hint-line">
          Is it running? <code>cd cockpit &amp;&amp; npm run dev</code> — and check its terminal
          output: if port 7331 was busy, it says so and exits.
        </p>
      </div>
    );
  }


  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          fund<span className="brass">AI</span>mentals
          <span className="wordmark-sub">/ cockpit</span>
        </div>
        <div className="topbar-right">
          <button
            className="lab-launch"
            onClick={() => setLabOpen(true)}
            title="Open the math lab — visual intuition for vectors, cosine, and more"
          >
            <span className="lab-launch-mark">◇</span> math lab
          </button>
          {total > 0 && (
            <div className="meter" title={`${done} of ${total} modules complete`}>
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
                />
              </div>
              <span className="meter-label">
                {done}/{total} modules
              </span>
            </div>
          )}
        </div>
      </header>

      <div
        className="workspace"
        style={{
          gridTemplateColumns: isEmpty
            ? `minmax(0, 1fr) 5px ${termW}px`
            : `${railW}px 5px minmax(0, 1fr) 5px ${termW}px`,
        }}
      >
        {isEmpty ? (
          <WelcomePane repoRoot={course!.repoRoot} />
        ) : (
          <>
            <Rail
              modules={course?.modules ?? []}
              currentModule={course?.currentModule ?? null}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <div className="gutter" onMouseDown={startDrag("rail")} />
            <DocPane module={selected} />
          </>
        )}
        <div className="gutter" onMouseDown={startDrag("term")} />
        <TerminalPane
          repoRoot={course?.repoRoot ?? ""}
          selectedModuleId={selectedId}
          welcome={isEmpty}
        />
      </div>

      {/* overlay stays mounted (hidden when closed) so the lab keeps its state
          across open/close, and the workspace/terminal are never disrupted */}
      <LabOverlay
        open={labOpen}
        onClose={() => setLabOpen(false)}
        currentModule={currentModule}
        moduleConfig={moduleConfig}
      />
    </div>
  );
}
