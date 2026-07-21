import { useEffect, useMemo, useRef } from "react";
import type { ModuleInfo } from "../api";
import { dueItems, parseJournal, parseProgress, parseQuizBank } from "./parse";
import { useDialogFocus } from "../useDialog";
import { useRepoFile } from "./useRepoFile";
import { QuizView } from "./QuizView";
import { JournalView } from "./JournalView";
import { ProgressView } from "./ProgressView";
import { Icon } from "../ui/icons";
import "./state.css";

export type StateTab = "quiz" | "journal" | "progress";

const TABS: { id: StateTab; label: string }[] = [
  { id: "quiz", label: "Quiz" },
  { id: "journal", label: "Journal" },
  { id: "progress", label: "Progress" },
];

/**
 * Full-screen read-only lens over the tutor's persistent state — the quiz bank,
 * the journal, and progress analytics — none of which the workspace surfaces.
 * Modelled on LabOverlay: it renders on top of the still-mounted workspace and
 * closes on esc, so the PTY and course selection are never disturbed. Owns zero
 * durable state; every panel is derived from the repo's own files on open.
 */
export function StateOverlay(props: {
  open: boolean;
  onClose: () => void;
  tab: StateTab;
  onTab: (t: StateTab) => void;
  modules: ModuleInfo[];
  today: string;
}) {
  const { open, onClose, tab, onTab } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, rootRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // fetched once per open (and refreshed on focus) — inactive while closed
  const quiz = useRepoFile("tutor/quiz-bank.json", open);
  const journal = useRepoFile("tutor/journal.md", open);
  const progress = useRepoFile("tutor/progress.json", open);

  const bank = useMemo(() => (quiz.raw ? parseQuizBank(quiz.raw) : null), [quiz.raw]);
  const prog = useMemo(() => (progress.raw ? parseProgress(progress.raw) : null), [progress.raw]);
  const due = useMemo(() => dueItems(bank, props.today), [bank, props.today]);
  const entryCount = useMemo(
    () => (journal.raw ? parseJournal(journal.raw).length : 0),
    [journal.raw],
  );

  const done = props.modules.filter((m) => m.status === "complete").length;

  const railHint: Record<StateTab, string> = {
    quiz: due.length > 0 ? `${due.length} due` : bank ? "up to date" : "—",
    journal: entryCount > 0 ? `${entryCount} ${entryCount === 1 ? "entry" : "entries"}` : "—",
    progress: props.modules.length > 0 ? `${done}/${props.modules.length} done` : "—",
  };

  return (
    <div
      className={`state-overlay ${open ? "" : "hidden"}`}
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Your record — quiz, journal, and progress"
      aria-hidden={!open}
      tabIndex={-1}
    >
      <header className="state-topbar">
        <div className="state-wordmark">
          <Icon name="record" size="sm" className="state-mark icon-inline" /> record
          <span className="state-sub">/ quiz · journal · progress</span>
        </div>
        <button className="state-close" onClick={onClose}>
          close <kbd>esc</kbd>
        </button>
      </header>

      <div className="state-body">
        <nav className="state-rail">
          <div className="state-rail-heading">Tutor state</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={["state-rail-item", t.id === tab ? "active" : ""].join(" ")}
              onClick={() => onTab(t.id)}
            >
              <span className="state-rail-title">{t.label}</span>
              <span className="state-rail-hint">{railHint[t.id]}</span>
            </button>
          ))}
          <div className="state-rail-foot">
            A read-only lens over <code>tutor/</code> — the quiz bank, the journal, and{" "}
            <code>progress.json</code>. The files stay the source of truth; nothing here writes.
          </div>
        </nav>

        <main className="state-main">
          {tab === "quiz" && <QuizView bank={bank} state={quiz.state} today={props.today} />}
          {tab === "journal" && <JournalView raw={journal.raw} state={journal.state} />}
          {tab === "progress" && (
            <ProgressView
              modules={props.modules}
              prog={prog}
              state={progress.state}
              today={props.today}
            />
          )}
        </main>
      </div>
    </div>
  );
}
