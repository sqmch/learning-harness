import { useEffect, useState } from "react";
import { fetchFile } from "../api";

export type FileState = "idle" | "loading" | "ready" | "missing";

/**
 * Read a repo file through /api/file while `active`. The study owns zero state:
 * this is a pure read lens. Refetches when reactivated (so reopening the overlay
 * shows fresh state) and on window focus (matching the course/doctor cadence);
 * a missing file degrades to "missing", never an error — the view shows an empty
 * state instead. Inactive means no fetch and no listener, so the always-mounted
 * overlay costs nothing while closed.
 */
export function useRepoFile(
  path: string,
  active: boolean,
): { raw: string | null; state: FileState } {
  const [raw, setRaw] = useState<string | null>(null);
  const [state, setState] = useState<FileState>("idle");

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () => {
      setState((s) => (s === "ready" ? s : "loading"));
      fetchFile(path)
        .then((c) => {
          if (alive) {
            setRaw(c);
            setState("ready");
          }
        })
        .catch(() => {
          if (alive) setState("missing");
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [path, active]);

  return { raw, state };
}
