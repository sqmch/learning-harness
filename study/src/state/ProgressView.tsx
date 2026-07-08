import { useMemo, useState } from "react";
import type { ModuleInfo } from "../api";
import { renderMarkdown } from "../markdown";
import {
  daysBetween,
  hintLevels,
  moduleDuration,
  parsePace,
  validIso,
  type ProgressFile,
  type RawModuleProgress,
} from "./parse";
import type { FileState } from "./useRepoFile";

const STATUS_WORD: Record<string, string> = {
  complete: "complete",
  "in-progress": "in progress",
  "not-started": "not started",
};

interface Row {
  m: ModuleInfo;
  p: RawModuleProgress;
  hints: boolean[];
  attempts: number;
  duration: { days: number; ongoing: boolean } | null;
  notes?: string;
}

function DurationCell({ duration }: { duration: Row["duration"] }) {
  if (!duration) return <span className="pm-muted">—</span>;
  const { days, ongoing } = duration;
  const n = days === 1 ? "1 day" : `${days} days`;
  return (
    <span
      className={ongoing ? "pm-ongoing" : ""}
      title={ongoing ? "elapsed since start" : "start → completion"}
    >
      {days === 0 ? (ongoing ? "today" : "same day") : n}
      {ongoing ? " ongoing" : ""}
    </span>
  );
}

function HintPips({ hints }: { hints: boolean[] }) {
  const used = hints.filter(Boolean).length;
  return (
    <span
      className="hint-pips"
      title={
        used === 0
          ? "no hints used"
          : `used ${hints
              .map((h, i) => (h ? `hint-${i + 1}` : null))
              .filter(Boolean)
              .join(", ")}`
      }
    >
      {hints.map((on, i) => (
        <span key={i} className={`hint-pip ${on ? "on" : ""}`}>
          {i + 1}
        </span>
      ))}
    </span>
  );
}

function PhaseBars(props: { modules: ModuleInfo[] }) {
  const phases = useMemo(() => {
    const by = new Map<number, ModuleInfo[]>();
    for (const m of props.modules) {
      if (!by.has(m.phase)) by.set(m.phase, []);
      by.get(m.phase)!.push(m);
    }
    return [...by.entries()].sort(([a], [b]) => a - b);
  }, [props.modules]);

  return (
    <div className="pm-phases">
      {phases.map(([phase, mods]) => {
        const done = mods.filter((m) => m.status === "complete").length;
        const pct = mods.length ? (done / mods.length) * 100 : 0;
        const name = mods.find((m) => m.phaseName)?.phaseName ?? `Phase ${phase}`;
        return (
          <div className="pm-phase" key={phase}>
            <div className="pm-phase-top">
              <span className="pm-phase-name">
                <span className="pm-phase-num">{String(phase).padStart(2, "0")}</span>
                {name}
              </span>
              <span className="pm-phase-count">
                {done}/{mods.length}
              </span>
            </div>
            <div className="pm-bar">
              <div className="pm-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProgressView(props: {
  modules: ModuleInfo[];
  prog: ProgressFile | null;
  state: FileState;
  today: string;
}) {
  const { modules, prog, state, today } = props;
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = useMemo<Row[]>(
    () =>
      modules.map((m) => {
        const p = prog?.modules?.[m.id] ?? {};
        const hints = hintLevels(p.hintsUsed ?? m.hintsUsed);
        return {
          m,
          p,
          hints,
          attempts: p.checkAttempts ?? m.checkAttempts ?? 0,
          duration: moduleDuration(p, today),
          notes: p.notes,
        };
      }),
    [modules, prog, today],
  );

  if (state === "loading" || state === "idle") {
    return <div className="state-empty">…</div>;
  }
  if (modules.length === 0) {
    return (
      <div className="state-empty">
        <div className="state-empty-mark">≡</div>
        <p>No modules yet — progress appears once the course has its first module.</p>
      </div>
    );
  }

  const done = modules.filter((m) => m.status === "complete").length;
  const hintsConsumed = rows.reduce((s, r) => s + r.hints.filter(Boolean).length, 0);
  const attemptsTotal = rows.reduce((s, r) => s + r.attempts, 0);

  // pace: estimated-hours of completed material per calendar week since start,
  // read against the learner's stated target. A rough throughput signal, not a
  // clock — labelled as such so it never overclaims.
  const pace = parsePace(prog?.learner?.paceHoursPerWeek);
  const started = prog?.learner?.started;
  const weeks = validIso(started) ? daysBetween(started, today) / 7 : null;
  const doneHours = modules
    .filter((m) => m.status === "complete")
    .reduce((s, m) => s + (Number(m.estimatedHours) || 0), 0);
  const throughput = weeks && weeks > 0 ? doneHours / weeks : null;
  const paceTarget = pace ? (pace.lo === pace.hi ? `${pace.lo}` : `${pace.lo}–${pace.hi}`) : null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="state-scroll">
      <div className="pm">
        <div className="pm-stats">
          <div className="pm-stat">
            <span className="pm-stat-n">
              {done}
              <span className="pm-stat-of">/{modules.length}</span>
            </span>
            <span className="pm-stat-label">modules complete</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat-n">{hintsConsumed}</span>
            <span className="pm-stat-label">hints consumed</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat-n">{attemptsTotal}</span>
            <span className="pm-stat-label">check attempts</span>
          </div>
          {paceTarget && (
            <div
              className="pm-stat pm-stat-pace"
              title="Estimated hours of completed modules ÷ calendar weeks since start, against the learner's stated pace. A throughput estimate, not measured time."
            >
              <span className="pm-stat-n">
                {throughput != null ? `~${throughput.toFixed(1)}` : "—"}
                <span className="pm-stat-of"> / {paceTarget}</span>
              </span>
              <span className="pm-stat-label">pace · h/wk of material vs target</span>
            </div>
          )}
        </div>

        <PhaseBars modules={modules} />

        <div className="pm-list">
          <div className="pm-row pm-row-head">
            <span className="pm-col-mod">Module</span>
            <span className="pm-col-status">Status</span>
            <span className="pm-col-dur">Duration</span>
            <span className="pm-col-hints">Hints</span>
            <span className="pm-col-checks">Checks</span>
            <span className="pm-col-notes" />
          </div>
          {rows.map((r) => {
            const isOpen = open.has(r.m.id);
            return (
              <div className="pm-item" key={r.m.id}>
                <div className={`pm-row status-${r.m.status}`}>
                  <span className="pm-col-mod">
                    <span className="pm-mod-id">{r.m.id}</span>
                    <span className="pm-mod-title">
                      {r.m.title}
                      {r.m.bossCheck && (
                        <span className="pm-boss" title="phase boss-check">
                          ◆
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="pm-col-status">
                    <span className={`status-chip status-${r.m.status}`}>
                      {STATUS_WORD[r.m.status] ?? r.m.status}
                    </span>
                  </span>
                  <span className="pm-col-dur">
                    <DurationCell duration={r.duration} />
                  </span>
                  <span className="pm-col-hints">
                    <HintPips hints={r.hints} />
                  </span>
                  <span className="pm-col-checks">
                    {r.attempts > 0 ? r.attempts : <span className="pm-muted">0</span>}
                  </span>
                  <span className="pm-col-notes">
                    {r.notes ? (
                      <button
                        className="pm-notes-toggle"
                        onClick={() => toggle(r.m.id)}
                        aria-expanded={isOpen}
                        title="tutor notes — calibration, struggles, open threads"
                      >
                        {isOpen ? "hide notes" : "notes"}
                      </button>
                    ) : null}
                  </span>
                </div>
                {r.notes && isOpen && (
                  <div
                    className="pm-note doc"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(r.notes) }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
