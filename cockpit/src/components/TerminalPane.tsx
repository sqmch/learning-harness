import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

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

  return (
    <aside className="termpane">
      <div className="term-header">
        <span className="term-title">tutor / terminal</span>
        <div className="term-actions">
          <button onClick={() => type("claude")} title="Launch Claude Code in the repo">
            launch claude
          </button>
          {props.welcome ? (
            <button
              onClick={() => type("new course", false)}
              title="Types the onboarding opener — press Enter inside Claude"
            >
              new course
            </button>
          ) : (
            <>
              <button
                onClick={() => type("start session", false)}
                title="Types the session opener — press Enter inside Claude"
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
            onClick={() => type(`code "${props.repoRoot}"`)}
            title="Open the repo in VS Code — your real editor"
          >
            edit
          </button>
        </div>
      </div>
      <div className="term-host" ref={hostRef} />
    </aside>
  );
}
