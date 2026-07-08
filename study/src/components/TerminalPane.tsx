import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  AGENTS,
  EDITORS,
  launchWithPrompt,
  resolveTool,
  usePrefs,
  type Prefs,
  type ToolChoice,
} from "../prefs";
import { useTheme, type Theme } from "../theme";

/**
 * Quick actions are STATE-AWARE: before touching the terminal they ask the
 * server what's running inside the PTY (idle / agent / busy / unknown) and
 * do the only safe thing for that state. The design rule: a wrong guess must
 * degrade to a refusal or an unsubmitted paste — never to keystrokes landing
 * in the wrong program.
 */
type PtyState = "idle" | "agent" | "busy" | "unknown";

/** Imperative handle so the topbar's doctor banner can fire the *same*
 *  state-aware session opener the terminal's own button uses — one PTY-safe
 *  code path, never a second one that could type into the wrong program. */
export interface TerminalHandle {
  startSession: () => void;
}

export const TerminalPane = forwardRef<
  TerminalHandle,
  {
    repoRoot: string;
    selectedModuleId: string | null;
    /** No course in the repo yet — swap module actions for onboarding ones. */
    welcome?: boolean;
  }
>(function TerminalPane(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<number, (state: PtyState) => void>());
  const reqIdRef = useRef(0);

  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [resumeFresh, setResumeFresh] = useState(false);

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
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    // binary frames = terminal bytes; text frames = control-protocol JSON
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "agent-state") pendingRef.current.get(msg.id)?.(msg.state);
        } catch {
          /* ignore malformed control frames */
        }
      } else {
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      }
    };
    ws.onclose = () =>
      term.write("\r\n\x1b[33m[terminal disconnected — reload to reconnect]\x1b[0m\r\n");

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

  const [prefs, setPrefs] = usePrefs();
  const [theme, setTheme] = useTheme();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const agent = resolveTool(AGENTS, prefs.agent, prefs.agentCustom, AGENTS[0]);
  const editor = resolveTool(EDITORS, prefs.editor, prefs.editorCustom, EDITORS[0]);

  // resume probe: does a fresh, directory-scoped conversation exist? (claude
  // only — its transcripts are stored per working directory, so --continue is
  // safe; other agents' "resume last" is global and could cross projects)
  const probeResume = useCallback(() => {
    if (agent.id !== "claude") {
      setResumeFresh(false);
      return;
    }
    fetch("/api/resume")
      .then((r) => r.json())
      .then((d) => setResumeFresh(Boolean(d.fresh)))
      .catch(() => setResumeFresh(false));
  }, [agent.id]);
  useEffect(() => {
    probeResume();
    window.addEventListener("focus", probeResume);
    return () => window.removeEventListener("focus", probeResume);
  }, [probeResume]);

  function type(text: string, submit = true) {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data: text + (submit ? "\r" : "") }));
      termRef.current?.focus();
    }
  }

  function queryState(agentCmd: string): Promise<PtyState> {
    return new Promise((resolve) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return resolve("unknown");
      const id = ++reqIdRef.current;
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        resolve("unknown");
      }, 6000);
      pendingRef.current.set(id, (state) => {
        clearTimeout(timer);
        pendingRef.current.delete(id);
        resolve(state);
      });
      ws.send(JSON.stringify({ type: "agent-state", id, agentCmd }));
    });
  }

  const noticeTimer = useRef<number | undefined>(undefined);
  function notify(text: string) {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 8000);
  }

  /** Serialize actions: one state query + action at a time. */
  function guarded(fn: () => Promise<void>) {
    return async () => {
      if (acting) return;
      setActing(true);
      try {
        await fn();
      } finally {
        setActing(false);
      }
    };
  }

  const doLaunch = guarded(async () => {
    const state = await queryState(agent.command);
    if (state === "agent") return notify(`${agent.label} is already running — just talk to it`);
    if (state === "busy") return notify("terminal is busy — finish or Ctrl+C what's running first");
    if (state === "unknown") {
      type(agent.command, false);
      return notify("couldn't inspect the terminal — typed the command; press Enter yourself");
    }
    type(agent.command, true);
  });

  const resuming = resumeFresh && agent.id === "claude";
  const sessionPhrase = props.welcome ? "new course" : "start session";
  const sessionLabel = resuming
    ? props.welcome
      ? "resume onboarding"
      : "resume session"
    : sessionPhrase;

  const doSession = guarded(async () => {
    const state = await queryState(agent.command);
    if (state === "agent") return void type(resuming ? "resume session" : sessionPhrase, true);
    if (state === "busy") return notify("terminal is busy — finish or Ctrl+C what's running first");
    if (state === "unknown") {
      type(sessionPhrase, false);
      return notify(
        "couldn't inspect the terminal — typed the opener; press Enter inside your agent",
      );
    }
    // idle: launch atomically, message already submitted
    if (resuming) type(`${agent.command} -c "resume session"`, true);
    else type(launchWithPrompt(agent, sessionPhrase), true);
  });

  // The doctor banner reconciles by firing this exact opener. Keep a ref to the
  // latest `doSession` (it's re-created each render by `guarded`) so the handle
  // stays stable while always running the current closure.
  const doSessionRef = useRef(doSession);
  doSessionRef.current = doSession;
  useImperativeHandle(ref, () => ({ startSession: () => void doSessionRef.current() }), []);

  const shellAction = (cmd: string, what: string) =>
    guarded(async () => {
      const state = await queryState(agent.command);
      if (state === "idle") return void type(cmd, true);
      if (state === "unknown") {
        type(cmd, false);
        return notify("couldn't inspect the terminal — press Enter to run it");
      }
      notify(
        state === "agent"
          ? `${agent.label} is running — exit it first, or ask it to ${what}`
          : "terminal is busy — finish or Ctrl+C what's running first",
      );
    });

  // forward slashes + `;` chaining work in PowerShell and POSIX shells alike
  const checksCmd = props.selectedModuleId
    ? `cd "${props.repoRoot.replace(/\\/g, "/")}/curriculum/${props.selectedModuleId}/scaffold"; npm run check`
    : null;

  return (
    <aside className="termpane">
      <div className="term-header">
        <span className="term-title">tutor / terminal</span>
        <div className="term-actions">
          <button
            disabled={acting}
            onClick={doLaunch}
            title={`Launch ${agent.label} — your tutor — in this repo (change agent via ⚙)`}
          >
            launch {agent.label}
          </button>
          {props.welcome ? (
            <button
              disabled={acting}
              onClick={doSession}
              title={
                resuming
                  ? "A recent conversation exists — resumes it where it left off"
                  : "Starts your agent with the onboarding opener already sent — the interview that builds this repo's course"
              }
            >
              {sessionLabel}
            </button>
          ) : (
            <>
              <button
                disabled={acting}
                onClick={doSession}
                title={
                  resuming
                    ? "A recent conversation exists — resumes it where it left off"
                    : "Starts your agent with the session opener already sent (or types it in, if the tutor is running)"
                }
              >
                {sessionLabel}
              </button>
              <button
                disabled={!checksCmd || acting}
                onClick={checksCmd ? shellAction(checksCmd, "run the checks") : undefined}
                title="Run the selected module's checks"
              >
                run checks
              </button>
            </>
          )}
          <button
            disabled={acting}
            onClick={shellAction(`${editor.command} "${props.repoRoot}"`, "open the editor")}
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
        {notice && (
          <div className="term-notice" onClick={() => setNotice(null)}>
            {notice}
          </div>
        )}
        {prefsOpen && (
          <PrefsPopover prefs={prefs} setPrefs={setPrefs} theme={theme} setTheme={setTheme} />
        )}
      </div>
      <div className="term-host" ref={hostRef} />
    </aside>
  );
});

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "system" },
  { id: "light", label: "light" },
  { id: "dark", label: "dark" },
];

function PrefsPopover(props: {
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const { prefs, setPrefs, theme, setTheme } = props;
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
      <div className="term-prefs-theme">
        <span id="prefs-theme-label">theme</span>
        <div className="theme-seg" role="group" aria-labelledby="prefs-theme-label">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={theme === t.id ? "on" : ""}
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="term-prefs-note">
        Buttons just type into the terminal, so the command must be on your PATH. Claude reads the
        tutor protocol from <code>CLAUDE.md</code>; codex &amp; friends get it via{" "}
        <code>AGENTS.md</code>.
      </p>
    </div>
  );
}
