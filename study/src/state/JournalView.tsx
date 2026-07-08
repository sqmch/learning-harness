import { useMemo } from "react";
import { renderMarkdown } from "../markdown";
import { parseJournal } from "./parse";
import type { FileState } from "./useRepoFile";

/**
 * The tutor journal, newest entry first. The file is append-only (newest at the
 * bottom); we split on its `## date — title` headings, reverse, and render each
 * body through the study's shared markdown pipeline so it reads with the same
 * typography as a lesson.
 */
export function JournalView(props: { raw: string | null; state: FileState }) {
  const { raw, state } = props;
  const entries = useMemo(() => {
    if (!raw) return [];
    return parseJournal(raw).map((e) => ({ ...e, html: renderMarkdown(e.body) }));
  }, [raw]);

  if (state === "loading" || state === "idle") {
    return <div className="state-empty">…</div>;
  }
  if (state === "missing" || !raw) {
    return (
      <div className="state-empty">
        <div className="state-empty-mark">≡</div>
        <p>
          No journal yet. The tutor writes a session entry at every close — what was covered, where
          you struggled or shone, and open threads. It's the repo's memory across sessions.
        </p>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="state-empty">
        <div className="state-empty-mark">≡</div>
        <p>The journal exists but has no dated entries yet.</p>
      </div>
    );
  }

  return (
    <div className="state-scroll">
      <div className="journal">
        <div className="journal-head">
          <h2 className="state-h2">Session journal</h2>
          <p className="state-lede">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}, newest first.
          </p>
        </div>
        {entries.map((e, i) => (
          <article className="journal-entry" key={`${e.date}-${i}`}>
            <header className="journal-entry-head">
              {e.date && <span className="journal-date">{e.date}</span>}
              <h3 className="journal-title">{e.title}</h3>
            </header>
            <div className="doc journal-body" dangerouslySetInnerHTML={{ __html: e.html }} />
          </article>
        ))}
      </div>
    </div>
  );
}
