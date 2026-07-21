import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { fetchFile, type ModuleInfo, type CheckRunState } from "../api";
import { createMarkdown, escapeHtml } from "../markdown";
import { buildEntries, visualSrc, type LabEntry } from "../lab/registry";
import { Icon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";

// The shared study pipeline (highlight + sanitize), plus this pane's own
// ```visual fence extension — kept on a private instance so `md.use` never
// mutates the renderer the journal and tutor notes share.
const md = createMarkdown();

// A ```visual fence embeds a module-owned interactive right in the lesson:
//   ```visual
//   { "file": "event-loop.html", "height": 420, "title": "The event loop" }
//   ```
// Rendered here as a placeholder <div>; a post-sanitize effect swaps it for a
// sandboxed <iframe> built via DOM APIs — DOMPurify is never loosened to let
// markdown author iframes directly.
md.use({
  renderer: {
    code(token: { text: string; lang?: string }) {
      if ((token.lang ?? "").trim() !== "visual") return false;
      try {
        const spec = JSON.parse(token.text);
        if (typeof spec.file !== "string") return false;
        const height = Math.max(160, Math.min(900, Number(spec.height) || 420));
        const title = typeof spec.title === "string" ? spec.title : "interactive visual";
        // `data-visual-label`, not `-title`: the study bans the `title` attribute
        // outright, and a substring of one reads as a violation to every grep.
        return `<div class="doc-visual-embed" data-visual-file="${escapeHtml(spec.file)}" data-visual-height="${height}" data-visual-label="${escapeHtml(title)}"></div>`;
      } catch {
        return false; // malformed spec → render as a plain code block, never crash the doc
      }
    },
  },
});

const DOC_LABELS: Record<string, string> = {
  "LESSON.md": "Lesson",
  "BRIEF.md": "Brief",
  "quiz.md": "Quiz",
};

export function DocPane(props: {
  module: ModuleInfo | null;
  /** Open the lab overlay directly on one of this module's visuals. */
  onOpenVisual: (entry: LabEntry, moduleId: string) => void;
  /** This module's ephemeral check-run status (undefined = never run this session). */
  checkState?: CheckRunState;
  /** Trigger an on-demand `npm run check` for the given module. */
  onRunChecks: (moduleId: string) => void;
}) {
  const [doc, setDoc] = useState<string>("LESSON.md");
  const [html, setHtml] = useState<string>("");
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [showFails, setShowFails] = useState(false);
  const articleRef = useRef<HTMLElement>(null);

  const docs = props.module?.docs ?? [];
  const visuals = props.module ? buildEntries([props.module]) : [];

  // ── check-run lens: derive the button's label/tint from the ephemeral state ──
  const cs = props.checkState;
  const checkRunning = cs?.phase === "running";
  const summary = cs?.phase === "done" ? cs.summary : undefined;
  const failNames = summary?.outcome === "fail" ? (summary.failedNames ?? []) : [];
  // The label is JSX, not a string: its mark is an icon, and the button is a
  // flex row so the mark sits on the count's optical centre rather than its
  // baseline.
  const checkLabel = checkRunning ? (
    "running checks…"
  ) : summary?.outcome === "pass" ? (
    <>
      <Icon name="check" size="xs" />
      {`${summary.passed}/${summary.total}`}
    </>
  ) : summary?.outcome === "fail" ? (
    <>
      <Icon name="x" size="xs" />
      {`${summary.failed}/${summary.total}`}
    </>
  ) : summary?.outcome === "crash" ? (
    "checks crashed"
  ) : summary?.outcome === "no-checks" ? (
    "no checks found"
  ) : (
    <>
      <Icon name="run" size="xs" />
      run checks
    </>
  );
  const checkClass = checkRunning
    ? "running"
    : summary?.outcome === "pass"
      ? "pass"
      : summary?.outcome === "fail"
        ? "fail"
        : summary // crash / no-checks
          ? "warn"
          : "idle";
  // a plain one-liner for the states that aren't a clean pass/fail count
  const checkNote =
    cs?.phase === "error"
      ? cs.error
      : summary?.outcome === "crash" || summary?.outcome === "no-checks"
        ? summary.detail
        : undefined;

  useEffect(() => {
    if (props.module) {
      setDoc(props.module.docs.includes("LESSON.md") ? "LESSON.md" : props.module.docs[0]);
    }
    setShowFails(false); // don't carry one module's open failing-tests list to the next
    // re-pick the default doc only when the module *id* changes — not when the
    // module object's identity churns on a background refetch, which would reset
    // the reader's current tab. (Same id-keyed pattern the lab components use.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.module?.id]);

  useEffect(() => {
    if (!props.module) return;
    let cancelled = false;
    setState("loading");
    fetchFile(`curriculum/${props.module.id}/${doc}`)
      .then((raw) => {
        if (cancelled) return;
        const rendered = md.parse(raw, { async: false }) as string;
        setHtml(DOMPurify.sanitize(rendered));
        setState("ready");
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
    // keyed on module id + selected doc; a same-id refetch must not re-fire the
    // load (see the note on the effect above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.module?.id, doc]);

  // swap ```visual placeholders for sandboxed iframes (built here, not by the
  // markdown pipeline — see the renderer note above)
  useEffect(() => {
    const root = articleRef.current;
    const moduleId = props.module?.id;
    if (!root || !moduleId) return;
    root.querySelectorAll<HTMLElement>(".doc-visual-embed").forEach((ph) => {
      if (ph.dataset.mounted) return;
      ph.dataset.mounted = "1";
      const iframe = document.createElement("iframe");
      iframe.className = "doc-visual-frame";
      iframe.src = visualSrc(moduleId, ph.dataset.visualFile ?? "");
      iframe.title = ph.dataset.visualLabel ?? "interactive visual";
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("loading", "lazy");
      iframe.style.height = `${ph.dataset.visualHeight ?? 420}px`;
      ph.appendChild(iframe);
    });
  }, [html, props.module?.id]);

  // copy buttons on code blocks
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.textContent = "copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.addEventListener("click", async () => {
        const code = pre.querySelector("code")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = "copied";
          setTimeout(() => (btn.textContent = "copy"), 1200);
        } catch {
          btn.textContent = "failed";
        }
      });
      pre.appendChild(btn);
    });
  }, [html]);

  if (!props.module) {
    return <main className="docpane docpane-empty">Select a module.</main>;
  }

  return (
    <main className="docpane">
      <div className="doc-header">
        <div className="doc-kicker">
          {props.module.id}
          <span className={`status-chip status-${props.module.status}`}>
            {props.module.status.replace("-", " ")}
          </span>
        </div>
        <nav className="doc-tabs">
          {docs.map((d) => (
            <button
              key={d}
              className={`doc-tab ${d === doc ? "active" : ""}`}
              onClick={() => setDoc(d)}
            >
              {DOC_LABELS[d] ?? d}
            </button>
          ))}
          <span className="doc-instruments">
            {visuals.length > 0 && (
              <span className="doc-visual-chips">
                {visuals.map((e) => (
                  <Tooltip
                    key={e.key}
                    wide
                    content={e.blurb ?? `Open "${e.title}" full-screen in the lab`}
                  >
                    <button
                      className="doc-visual-chip"
                      onClick={() => props.onOpenVisual(e, props.module!.id)}
                    >
                      <Icon name="diamond" size="xs" />
                      {e.title.toLowerCase()}
                    </button>
                  </Tooltip>
                ))}
              </span>
            )}
            {/* run-checks lens: quiet instrument, right of the visual chips.
                Hidden entirely when the module has no runnable checks. It shares
                the independent runner used by the terminal-pane button. */}
            {props.module.hasChecks && (
              <span className="doc-check">
                <Tooltip
                  wide
                  content={
                    summary || cs?.phase === "error"
                      ? "Run this module's checks again"
                      : "Run this module's checks in a separate process"
                  }
                >
                  <button
                    className={`doc-check-btn is-${checkClass}`}
                    onClick={() => props.onRunChecks(props.module!.id)}
                    disabled={checkRunning}
                    aria-busy={checkRunning}
                  >
                    {checkLabel}
                  </button>
                </Tooltip>
                {failNames.length > 0 && (
                  <Tooltip content={showFails ? "Hide failing tests" : "Show failing tests"}>
                    <button
                      className="doc-check-toggle"
                      onClick={() => setShowFails((v) => !v)}
                      aria-expanded={showFails}
                    >
                      {showFails ? "hide" : "which"}
                    </button>
                  </Tooltip>
                )}
                {checkNote && (
                  <Tooltip wide content={checkNote}>
                    <span className="doc-check-note">{checkNote}</span>
                  </Tooltip>
                )}
                {showFails && failNames.length > 0 && (
                  <ul className="doc-check-fails">
                    {failNames.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </span>
            )}
          </span>
        </nav>
      </div>

      {state === "loading" && <div className="doc-state">…</div>}
      {state === "missing" && (
        <div className="doc-state">
          This document doesn't exist yet — it's generated when you start the module.
        </div>
      )}
      {state === "ready" && (
        <article ref={articleRef} className="doc" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </main>
  );
}
