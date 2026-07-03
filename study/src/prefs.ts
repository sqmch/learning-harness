import { useEffect, useState } from "react";

/**
 * Which agent CLI tutors this course, and which editor "edit" opens.
 * Pure UI preference: the buttons only type commands into the PTY, so the
 * chosen command must exist on the user's PATH. Persisted per browser —
 * the repo itself stays agent-agnostic (CLAUDE.md + AGENTS.md carry the
 * protocol for whichever tool the learner runs).
 */
export interface ToolChoice {
  id: string;
  label: string;
  command: string;
}

export const AGENTS: ToolChoice[] = [
  { id: "claude", label: "claude", command: "claude" },
  { id: "codex", label: "codex", command: "codex" },
  { id: "gemini", label: "gemini", command: "gemini" },
];

export const EDITORS: ToolChoice[] = [
  { id: "code", label: "VS Code", command: "code" },
  { id: "zed", label: "Zed", command: "zed" },
  { id: "cursor", label: "Cursor", command: "cursor" },
];

export interface Prefs {
  agent: string; // ToolChoice id or "custom"
  agentCustom: string;
  editor: string; // ToolChoice id or "custom"
  editorCustom: string;
}

const KEY = "study.prefs";
const DEFAULTS: Prefs = { agent: "claude", agentCustom: "", editor: "code", editorCustom: "" };

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(prefs)), [prefs]);
  return [prefs, setPrefs] as const;
}

/** "custom" with an empty command falls back, so the buttons never type nothing. */
export function resolveTool(
  choices: ToolChoice[],
  id: string,
  custom: string,
  fallback: ToolChoice,
): ToolChoice {
  if (id === "custom") {
    const command = custom.trim();
    return command ? { id: "custom", label: command.split(/\s+/)[0], command } : fallback;
  }
  return choices.find((c) => c.id === id) ?? fallback;
}
