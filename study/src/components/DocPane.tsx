import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { fetchFile, type ModuleInfo } from "../api";
import { createMarkdown, escapeHtml } from "../markdown";
import { buildEntries, visualSrc, type LabEntry } from "../lab/registry";

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
        return `<div class="doc-visual-embed" data-visual-file="${escapeHtml(spec.file)}" data-visual-height="${height}" data-visual-title="${escapeHtml(title)}"></div>`;
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
}) {
  const [doc, setDoc] = useState<string>("LESSON.md");
  const [html, setHtml] = useState<string>("");
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const articleRef = useRef<HTMLElement>(null);

  const docs = props.module?.docs ?? [];
  const visuals = props.module ? buildEntries([props.module]) : [];

  useEffect(() => {
    if (props.module) {
      setDoc(props.module.docs.includes("LESSON.md") ? "LESSON.md" : props.module.docs[0]);
    }
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
      iframe.title = ph.dataset.visualTitle ?? "interactive visual";
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
      btn.textContent = "copy";
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
          {visuals.length > 0 && (
            <span className="doc-visual-chips">
              {visuals.map((e) => (
                <button
                  key={e.key}
                  className="doc-visual-chip"
                  onClick={() => props.onOpenVisual(e, props.module!.id)}
                  title={e.blurb ?? `Open "${e.title}" full-screen in the lab`}
                >
                  ◇ {e.title.toLowerCase()}
                </button>
              ))}
            </span>
          )}
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
