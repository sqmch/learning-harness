import { useEffect, useMemo, useRef, useState } from "react";
import type { ModuleInfo } from "../api";
import { useDialogFocus } from "../useDialog";
import { buildEntries, configFor, defaultEntryKey, type LabEntry } from "./registry";
import "./lab.css";

export function LabOverlay(props: {
  open: boolean;
  onClose: () => void;
  modules: ModuleInfo[];
  currentModule: string | null;
  /**
   * Set when the overlay was opened from a specific place (a lesson's ◇ chip):
   * which entry to show, and which module's lab.json to feed it.
   */
  target: { entryKey: string; moduleId: string } | null;
}) {
  // Destructured so the esc-key effect can depend on these specific props rather
  // than the whole `props` object (react-hooks/exhaustive-deps prefers this).
  const { open, onClose } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, rootRef);
  const entries = useMemo(() => buildEntries(props.modules), [props.modules]);

  // the learner's own pick wins; else the chip that opened us; else follow the
  // course (current module's focusLab / first entry). Derived, not initializer
  // state, so it tracks the course loading and the learner advancing.
  const [pickedId, setPickedId] = useState<string | null>(null);
  useEffect(() => setPickedId(null), [props.target]); // a fresh chip-open overrides an old pick
  const currentConfig = props.modules.find((m) => m.id === props.currentModule)?.lab ?? null;
  const activeKey =
    pickedId ??
    props.target?.entryKey ??
    defaultEntryKey(entries, props.currentModule, currentConfig);
  const active = entries.find((e) => e.key === activeKey) ?? entries[0] ?? null;

  // which module's lab.json feeds the active lab: the chip's module, else the
  // learner's current module — never some unrelated module's config
  const contextModuleId =
    props.target && active && props.target.entryKey === active.key
      ? props.target.moduleId
      : props.currentModule;
  const { config, moduleId } = active
    ? configFor(active, props.modules, contextModuleId)
    : { config: null, moduleId: null };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isCurrent = (e: LabEntry) =>
    props.currentModule != null && e.modules.includes(props.currentModule);

  // the focus note only applies to the entry it was written for: the module's
  // focusLab when set, else any entry of the module whose config is active
  const showFocus = config?.focus && active && (!config.focusLab || config.focusLab === active.key);

  return (
    <div
      className={`lab-overlay ${open ? "" : "hidden"}`}
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="The lab — this course's interactive visualizations"
      aria-hidden={!open}
      tabIndex={-1}
    >
      <header className="lab-topbar">
        <div className="lab-wordmark">
          <span className="lab-mark">◇</span> lab
          <span className="lab-sub">/ visual intuition, wired to the course</span>
        </div>
        <button className="lab-close" onClick={onClose}>
          close <kbd>esc</kbd>
        </button>
      </header>

      <div className="lab-body">
        <nav className="lab-rail">
          <div className="lab-rail-heading">Visualizations</div>
          {entries.map((entry) => (
            <button
              key={entry.key}
              className={["lab-rail-item", active && entry.key === active.key ? "active" : ""].join(
                " ",
              )}
              onClick={() => setPickedId(entry.key)}
            >
              <div className="lab-rail-title">
                {entry.title}
                {isCurrent(entry) && <span className="lab-chip current">current topic</span>}
              </div>
              {entry.blurb && <div className="lab-rail-blurb">{entry.blurb}</div>}
              <div className="lab-rail-modules">{entry.modules.join(" · ")}</div>
            </button>
          ))}
          <div className="lab-rail-foot">
            Visuals belong to modules: the tutor claims a stock lab or ships its own interactive
            HTML per module via <code>lab.json</code> — see <code>study/LAB.md</code>.
          </div>
        </nav>

        <main className="lab-main">
          {showFocus && (
            <div className="lab-focus">
              <span className="lab-focus-tag">focus</span>
              {config!.focus}
            </div>
          )}
          {active?.kind === "stock" && active.stock ? (
            <active.stock.component config={config} moduleId={moduleId} />
          ) : active?.kind === "html" && active.src ? (
            // sandbox: scripts yes, same-origin no — the visual runs isolated,
            // and the serving endpoint's CSP blocks all network access
            <iframe
              className="lab-iframe"
              key={active.key /* force a fresh document per visual */}
              src={active.src}
              title={active.title}
              sandbox="allow-scripts"
            />
          ) : (
            <div className="lab-placeholder">
              <div className="lab-placeholder-mark">◇</div>
              <h2>Nothing to visualize yet</h2>
              <p>
                Visuals arrive with modules: the tutor adds them where a concept is better seen than
                read.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
