import { useMemo, useState } from "react";
import {
  dueItems,
  scheduledItems,
  type DueRow,
  type QuizBank,
  type QuizHistoryEntry,
} from "./parse";
import { Icon, RecallMark, type RecallResult } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";
import type { FileState } from "./useRepoFile";

// Monochrome recall marks — shape, never colour, carries the grade. The five
// shapes are the ones the ● ◐ ○ ◎ · glyph set drew, now drawn as SVG instead of
// typeset (ui/icons.tsx): fonts disagree about which half of ◐ is filled, and
// several substitute a whole different face for it. The bank stores a free
// string, so the map is also the guard — anything outside the recorded
// vocabulary falls back to the neutral dot, as the glyph lookup did.
const RESULT_MARK: Record<string, RecallResult> = {
  correct: "correct",
  partial: "partial",
  wrong: "wrong",
  tutored: "tutored",
  rescheduled: "rescheduled",
};
const RESULT_WORD: Record<string, string> = {
  correct: "correct",
  partial: "partial",
  wrong: "wrong",
  tutored: "tutored (taught, re-tests)",
  rescheduled: "rescheduled (bookkeeping)",
};

// Recency, not debt: "due 24d ago" reads as when the item last came around, not
// as a task the learner is failing to clear (only a tutor session can ask it).
function dueLabel(over: number): string {
  if (over === 0) return "due today";
  if (over > 0) return `due ${over}d ago`;
  return `due in ${-over}d`;
}

function History({ history }: { history?: QuizHistoryEntry[] }) {
  if (!history || history.length === 0) {
    return (
      <Tooltip content="not asked yet">
        <span className="q-hist q-hist-empty">—</span>
      </Tooltip>
    );
  }
  return (
    <span className="q-hist">
      {history.map((h, i) => {
        const r = h.result ?? "";
        return (
          // A graded entry the tutor annotated runs to prose; date · grade on
          // its own is a label, and widening it would leave the tip mostly air.
          <Tooltip
            key={i}
            content={`${h.date ?? "?"} · ${(RESULT_WORD[r] ?? r) || "?"}${h.note ? ` — ${h.note}` : ""}`}
            wide={Boolean(h.note)}
          >
            <span className={`q-glyph q-${r || "unknown"}`}>
              <RecallMark result={RESULT_MARK[r] ?? "rescheduled"} />
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

function ItemRow({ row, upcoming }: { row: DueRow; upcoming?: boolean }) {
  const { item, over } = row;
  return (
    <li className={`q-item ${upcoming ? "upcoming" : ""}`}>
      {/* one bounded row: instrument line left (id · module · overdue), spacing
          + history right — right-aligned WITHIN the measure, never the viewport edge */}
      <div className="q-line1">
        <span className="q-line1-left">
          <span className="q-id">{item.id}</span>
          {item.module && <span className="q-mod">{item.module}</span>}
          {/* state.css has tinted `.q-when.overdue` since it was written, but
              nothing ever set the class — so a backlog the tutor is meant to
              call out ("7 items due; asking the 3 most overdue") read in the
              same ink as an item due today. The boundary is dueLabel's: past
              its date, not merely arrived at it. */}
          <span className={over > 0 ? "q-when overdue" : "q-when"}>{dueLabel(over)}</span>
          {upcoming && item.due && <span className="q-due">{item.due}</span>}
        </span>
        <span className="q-line1-right">
          <Tooltip content="current spacing interval, in days">
            <span className="q-interval">
              {typeof item.interval === "number" ? `${item.interval}d` : "—"}
            </span>
          </Tooltip>
          <History history={item.history} />
        </span>
      </div>
      {/* the question the tutor wrote — reading face */}
      {item.question && <div className="q-question">{item.question}</div>}
    </li>
  );
}

export function QuizView(props: { bank: QuizBank | null; state: FileState; today: string }) {
  const { bank, state, today } = props;
  const due = useMemo(() => dueItems(bank, today), [bank, today]);
  const scheduled = useMemo(() => scheduledItems(bank, today), [bank, today]);
  const [showScheduled, setShowScheduled] = useState(false);

  if (state === "loading" || state === "idle") {
    return <div className="state-empty">…</div>;
  }
  if (state === "missing" || !bank) {
    return (
      <div className="state-empty">
        <div className="state-empty-mark">
          <Icon name="diamond" size="lg" />
        </div>
        <p>
          No quiz bank yet. The tutor banks recall questions as you finish modules; they surface
          here, spaced by how well you answered.
        </p>
      </div>
    );
  }

  const total = bank.items.length;

  return (
    <div className="state-scroll">
      <div className="q-head">
        <h2 className="state-h2">
          {due.length > 0 ? `${due.length} due as of ${today}` : `Nothing due as of ${today}`}
        </h2>
        <p className="state-lede">
          {due.length > 0
            ? "Most overdue first — the order the tutor asks. "
            : "You're current on recall. "}
          {total} item{total === 1 ? "" : "s"} in the bank
          {scheduled.length > 0 ? `, ${scheduled.length} scheduled ahead.` : "."}
        </p>
        <div className="q-legend">
          <span className="q-legend-item">
            <span className="q-glyph q-correct" aria-hidden>
              <RecallMark result="correct" />
            </span>{" "}
            correct
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-partial" aria-hidden>
              <RecallMark result="partial" />
            </span>{" "}
            partial
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-wrong" aria-hidden>
              <RecallMark result="wrong" />
            </span>{" "}
            wrong
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-tutored" aria-hidden>
              <RecallMark result="tutored" />
            </span>{" "}
            tutored
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-rescheduled" aria-hidden>
              <RecallMark result="rescheduled" />
            </span>{" "}
            rescheduled
          </span>
        </div>
      </div>

      {due.length > 0 && (
        <ul className="q-list">
          {due.map((r) => (
            <ItemRow key={r.item.id} row={r} />
          ))}
        </ul>
      )}

      {scheduled.length > 0 && (
        <div className="q-scheduled">
          <button
            className="state-collapse"
            onClick={() => setShowScheduled((o) => !o)}
            aria-expanded={showScheduled}
          >
            <Icon name={showScheduled ? "collapse" : "expand"} size="xs" />
            scheduled ahead · {scheduled.length}
          </button>
          {showScheduled && (
            <ul className="q-list">
              {scheduled.map((r) => (
                <ItemRow key={r.item.id} row={r} upcoming />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
