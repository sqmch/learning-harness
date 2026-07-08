import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCourse, fetchDoctor, fetchFile, type Course, type DoctorReport } from "./api";
import { Rail } from "./components/Rail";
import { DocPane } from "./components/DocPane";
import { TerminalPane, type TerminalHandle } from "./components/TerminalPane";
import { WelcomePane } from "./components/WelcomePane";
import { LabOverlay } from "./lab/LabOverlay";
import { buildEntries, type LabEntry } from "./lab/registry";
import { StateOverlay, type StateTab } from "./state/StateOverlay";
import { dueItems, parseQuizBank, todayISO, type QuizBank } from "./state/parse";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DOCTOR_GLYPH: Record<string, string> = { ok: "✓", warn: "⚠", fail: "✗" };

export default function App() {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [labOpen, setLabOpen] = useState(false);
  const [labTarget, setLabTarget] = useState<{ entryKey: string; moduleId: string } | null>(null);

  // record overlay: the tutor's persistent state (quiz bank, journal, progress).
  // The topbar chip and this overlay share one derivation of "due today".
  const [stateOpen, setStateOpen] = useState(false);
  const [stateTab, setStateTab] = useState<StateTab>("progress");
  const [quizBank, setQuizBank] = useState<QuizBank | null>(null);
  const today = todayISO();

  const [railW, setRailW] = useState(() => Number(localStorage.getItem("ck.railW")) || 290);
  const [termW, setTermW] = useState(() => Number(localStorage.getItem("ck.termW")) || 480);
  const drag = useRef<null | { which: "rail" | "term"; startX: number; startW: number }>(null);

  // session-close doctor: a topbar banner when a session was left unclosed.
  const termRef = useRef<TerminalHandle>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorDismissed, setDoctorDismissed] = useState(false);
  const [doctorDetails, setDoctorDetails] = useState(false);

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
  // without the learner ever leaving the study
  const isEmpty = course != null && course.modules.length === 0;
  useEffect(() => {
    if (!isEmpty) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [isEmpty, load]);

  // doctor: refresh like the course does — on focus + a slow poll (not a hot
  // loop). A fetch failure degrades to null: the banner is a safety net, never
  // a nag, so a missing endpoint just means no banner.
  const loadDoctor = useCallback(async () => {
    try {
      setDoctor(await fetchDoctor());
    } catch {
      setDoctor(null);
    }
  }, []);
  useEffect(() => {
    loadDoctor();
    const onFocus = () => loadDoctor();
    window.addEventListener("focus", onFocus);
    const t = setInterval(loadDoctor, 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [loadDoctor]);

  // quiz bank: powers the "N due" topbar chip. Same focus + slow-poll cadence as
  // the doctor; a missing/unreadable bank degrades to null → the chip hides.
  const loadQuiz = useCallback(async () => {
    try {
      setQuizBank(parseQuizBank(await fetchFile("tutor/quiz-bank.json")));
    } catch {
      setQuizBank(null);
    }
  }, []);
  useEffect(() => {
    loadQuiz();
    const onFocus = () => loadQuiz();
    window.addEventListener("focus", onFocus);
    const t = setInterval(loadQuiz, 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [loadQuiz]);

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
  // everything the course can visualize — nothing hardcoded in the engine;
  // an empty list hides the lab entirely (a fresh clone has no lab button)
  const labEntries = useMemo(() => buildEntries(course?.modules ?? []), [course]);
  const openLab = useCallback((entry: LabEntry, moduleId: string) => {
    setLabTarget({ entryKey: entry.key, moduleId });
    setLabOpen(true);
  }, []);

  const done = course?.modules.filter((m) => m.status === "complete").length ?? 0;
  const total = course?.modules.length ?? 0;

  // quiz items due today (same rule as scripts/quiz.mjs) — drives the chip
  const dueCount = useMemo(() => dueItems(quizBank, today).length, [quizBank, today]);
  const openState = useCallback((tab: StateTab) => {
    setStateTab(tab);
    setStateOpen(true);
  }, []);

  // Banner only for `fail` — warns stay quiet (this line is for a broken close,
  // not noise). Summary: the single fail, or the count + the first one.
  const doctorFails = useMemo(
    () => doctor?.results.filter((r) => r.level === "fail") ?? [],
    [doctor],
  );
  const doctorSummary =
    doctorFails.length === 1
      ? doctorFails[0].message
      : doctorFails.length > 1
        ? `${doctorFails.length} checks failing — ${doctorFails[0].message}`
        : "";
  const showDoctor = doctorFails.length > 0 && !doctorDismissed;

  // the instance's folder name IS the course's name (clones are named after
  // their course) — brand the shell with it instead of any hardcoded course
  const repoName = useMemo(
    () => course?.repoRoot.split(/[\\/]/).filter(Boolean).pop() ?? null,
    [course],
  );
  useEffect(() => {
    if (repoName) document.title = `${repoName} — study`;
  }, [repoName]);

  if (error) {
    return (
      <div className="boot-error">
        <h1>study</h1>
        <p>Couldn't reach the course server.</p>
        <pre>{error}</pre>
        <p className="hint-line">
          Is it running? <code>npm run dev</code> from the repo root — and check its terminal
          output: if the API port was busy, it says so and exits.
        </p>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          {repoName ?? "study"}
          {repoName && <span className="wordmark-sub">/ study</span>}
        </div>
        <div className="topbar-right">
          {dueCount > 0 && (
            <button
              className="quiz-chip"
              onClick={() => openState("quiz")}
              title={`${dueCount} quiz item${dueCount === 1 ? "" : "s"} due for recall — open your record`}
            >
              <span className="quiz-chip-n">{dueCount}</span> due
            </button>
          )}
          {total > 0 && (
            <button
              className="state-launch"
              onClick={() => setStateOpen(true)}
              title="Open your record — the quiz bank, journal, and progress the tutor keeps in this repo"
            >
              <span className="state-launch-mark">≡</span> record
            </button>
          )}
          {labEntries.length > 0 && (
            <button
              className="lab-launch"
              onClick={() => {
                setLabTarget(null);
                setLabOpen(true);
              }}
              title="Open the lab — this course's interactive visualizations"
            >
              <span className="lab-launch-mark">◇</span> lab
            </button>
          )}
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

      {showDoctor && (
        <div className="doctor-banner">
          <div className="doctor-banner-bar">
            <span className="doctor-banner-glyph">⚠</span>
            <span className="doctor-banner-msg" title={doctorSummary}>
              {doctorSummary}
            </span>
            <button
              className="doctor-banner-action"
              onClick={() => termRef.current?.startSession()}
              title="Open a session that reconciles this — the same opener as the terminal's session button"
            >
              start session
            </button>
            {doctor && doctor.results.length > 0 && (
              <button
                className="doctor-banner-toggle"
                onClick={() => setDoctorDetails((o) => !o)}
                aria-expanded={doctorDetails}
              >
                {doctorDetails ? "hide" : "details"}
              </button>
            )}
            <button
              className="doctor-banner-dismiss"
              onClick={() => setDoctorDismissed(true)}
              aria-label="dismiss until reload"
              title="Dismiss until reload"
            >
              ×
            </button>
          </div>
          {doctorDetails && doctor && (
            <ul className="doctor-banner-list">
              {doctor.results.map((r) => (
                <li key={r.id} className={`doctor-line doctor-line-${r.level}`}>
                  <span className="doctor-line-glyph">{DOCTOR_GLYPH[r.level] ?? "•"}</span>
                  <span className="doctor-line-id">{r.id}</span>
                  <span className="doctor-line-msg">{r.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            <DocPane module={selected} onOpenVisual={openLab} />
          </>
        )}
        <div className="gutter" onMouseDown={startDrag("term")} />
        <TerminalPane
          ref={termRef}
          repoRoot={course?.repoRoot ?? ""}
          selectedModuleId={selectedId}
          welcome={isEmpty}
        />
      </div>

      {/* overlays stay mounted (hidden when closed) so they keep their state
          across open/close, and the workspace/terminal are never disrupted */}
      <LabOverlay
        open={labOpen}
        onClose={() => setLabOpen(false)}
        modules={course?.modules ?? []}
        currentModule={currentModule}
        target={labTarget}
      />
      <StateOverlay
        open={stateOpen}
        onClose={() => setStateOpen(false)}
        tab={stateTab}
        onTab={setStateTab}
        modules={course?.modules ?? []}
        today={today}
      />
    </div>
  );
}
