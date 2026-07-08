import { useMemo, useState } from "react";
import {
  dueItems,
  scheduledItems,
  type DueRow,
  type QuizBank,
  type QuizHistoryEntry,
} from "./parse";
import type { FileState } from "./useRepoFile";

// Monochrome recall glyphs — shape, never colour, carries the grade. Covers
// every result the bank records; an unknown result falls back to the neutral dot.
const RESULT_GLYPH: Record<string, string> = {
  correct: "●",
  partial: "◐",
  wrong: "○",
  tutored: "◎",
  rescheduled: "·",
};
const RESULT_WORD: Record<string, string> = {
  correct: "correct",
  partial: "partial",
  wrong: "wrong",
  tutored: "tutored (taught, re-tests)",
  rescheduled: "rescheduled (bookkeeping)",
};

function overdueLabel(over: number): string {
  if (over === 0) return "due today";
  if (over > 0) return `${over}d overdue`;
  return `in ${-over}d`;
}

function History({ history }: { history?: QuizHistoryEntry[] }) {
  if (!history || history.length === 0) {
    return (
      <span className="q-hist q-hist-empty" title="not asked yet">
        —
      </span>
    );
  }
  return (
    <span className="q-hist">
      {history.map((h, i) => {
        const r = h.result ?? "";
        return (
          <span
            key={i}
            className={`q-glyph q-${r || "unknown"}`}
            title={`${h.date ?? "?"} · ${(RESULT_WORD[r] ?? r) || "?"}${h.note ? ` — ${h.note}` : ""}`}
          >
            {RESULT_GLYPH[r] ?? "·"}
          </span>
        );
      })}
    </span>
  );
}

function ItemRow({ row, upcoming }: { row: DueRow; upcoming?: boolean }) {
  const { item, over } = row;
  return (
    <li className={`q-item ${upcoming ? "upcoming" : ""}`}>
      <div className="q-item-top">
        <span className="q-id">{item.id}</span>
        {item.module && <span className="q-mod">{item.module}</span>}
        <span className="q-when">{overdueLabel(over)}</span>
        {upcoming && item.due && <span className="q-due">{item.due}</span>}
        <span className="q-interval" title="current spacing interval, in days">
          {typeof item.interval === "number" ? `${item.interval}d` : "—"}
        </span>
        <History history={item.history} />
      </div>
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
        <div className="state-empty-mark">◇</div>
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
        <div className="q-legend" aria-hidden>
          <span className="q-legend-item">
            <span className="q-glyph q-correct">●</span> correct
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-partial">◐</span> partial
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-wrong">○</span> wrong
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-tutored">◎</span> tutored
          </span>
          <span className="q-legend-item">
            <span className="q-glyph q-rescheduled">·</span> rescheduled
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
            <span className="state-collapse-caret">{showScheduled ? "▾" : "▸"}</span>
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
