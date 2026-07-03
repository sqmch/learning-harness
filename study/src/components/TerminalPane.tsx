import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AGENTS, EDITORS, resolveTool, usePrefs, type Prefs, type ToolChoice } from "../prefs";

export function TerminalPane(props: {
  repoRoot: string;
  selectedModuleId: string | null;
  /** No course in the repo yet — swap module actions for onboarding ones. */
  welcome?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new Terminal({
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#101113",
        foreground: "#e4e6e9",
        cursor: "#9aa0a8",
        selectionBackground: "#2e3136",
        black: "#101113",
        brightBlack: "#61666d",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/term`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (ev) => term.write(typeof ev.data === "string" ? ev.data : "");
    ws.onclose = () => term.write("\r\n\x1b[33m[terminal disconnected — reload to reconnect]\x1b[0m\r\n");

    const sub = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      sub.dispose();
      ws.onclose = null; // ws.close() resolves async — don't write to a disposed xterm
      ws.close();
      term.dispose();
    };
  }, []);

  function type(text: string, submit = true) {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data: text + (submit ? "\r" : "") }));
      termRef.current?.focus();
    }
  }

  // forward slashes + `;` chaining work in PowerShell and POSIX shells alike
  const checksCmd = props.selectedModuleId
    ? `cd "${props.repoRoot.replace(/\\/g, "/")}/curriculum/${props.selectedModuleId}/scaffold"; npm run check`
    : null;

  const [prefs, setPrefs] = usePrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const agent = resolveTool(AGENTS, prefs.agent, prefs.agentCustom, AGENTS[0]);
  const editor = resolveTool(EDITORS, prefs.editor, prefs.editorCustom, EDITORS[0]);

  return (
    <aside className="termpane">
      <div className="term-header">
        <span className="term-title">tutor / terminal</span>
        <div className="term-actions">
          <button
            onClick={() => type(agent.command)}
            title={`Launch ${agent.label} — your tutor — in this repo (change agent via ⚙)`}
          >
            launch {agent.label}
          </button>
          {props.welcome ? (
            <button
              onClick={() => type("new course", false)}
              title="Types the onboarding opener into your agent — press Enter to start the interview that builds this repo's course"
            >
              new course
            </button>
          ) : (
            <>
              <button
                onClick={() => type("start session", false)}
                title="Types the session opener into your agent — press Enter to run your recall quiz and continue the current module"
              >
                start session
              </button>
              <button
                disabled={!checksCmd}
                onClick={() => checksCmd && type(checksCmd)}
                title="Run the selected module's checks"
              >
                run checks
              </button>
            </>
          )}
          <button
            onClick={() => type(`${editor.command} "${props.repoRoot}"`)}
            title={`Open the repo in ${editor.label} — your real editor (change editor via ⚙)`}
          >
            edit
          </button>
          <button
            className={prefsOpen ? "term-gear open" : "term-gear"}
            onClick={() => setPrefsOpen((o) => !o)}
            title="Choose your agent and editor"
            aria-label="terminal preferences"
          >
            ⚙
          </button>
        </div>
        {prefsOpen && <PrefsPopover prefs={prefs} setPrefs={setPrefs} />}
      </div>
      <div className="term-host" ref={hostRef} />
    </aside>
  );
}

function PrefsPopover(props: { prefs: Prefs; setPrefs: (p: Prefs) => void }) {
  const { prefs, setPrefs } = props;
  const row = (
    kind: "agent" | "editor",
    choices: ToolChoice[],
    value: string,
    custom: string,
    placeholder: string,
  ) => (
    <div className="term-prefs-row">
      <label htmlFor={`prefs-${kind}`}>{kind}</label>
      <select
        id={`prefs-${kind}`}
        value={value}
        onChange={(e) => setPrefs({ ...prefs, [kind]: e.target.value })}
      >
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
        <option value="custom">custom…</option>
      </select>
      {value === "custom" && (
        <input
          value={custom}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setPrefs({ ...prefs, [`${kind}Custom`]: e.target.value })}
        />
      )}
    </div>
  );
  return (
    <div className="term-prefs">
      {row("agent", AGENTS, prefs.agent, prefs.agentCustom, "command, e.g. aider")}
      {row("editor", EDITORS, prefs.editor, prefs.editorCustom, "command, e.g. subl")}
      <p className="term-prefs-note">
        Buttons just type into the terminal, so the command must be on your PATH. Claude
        reads the tutor protocol from <code>CLAUDE.md</code>; codex &amp; friends get it via{" "}
        <code>AGENTS.md</code>.
      </p>
    </div>
  );
}
