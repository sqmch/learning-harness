import { useEffect, useState } from "react";

/**
 * Light/dark is a UI preference, so it lives in localStorage like the pane widths
 * and tool choices — the study still owns zero durable state over the course.
 * Three settings: "system" follows prefers-color-scheme (no attribute, the CSS
 * media query decides), "light"/"dark" stamp `data-theme` on <html> and win over
 * the OS. styles.css keys its two palettes off that attribute, so setting (or
 * clearing) it is all we do here.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "study.theme";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Stamp (or clear) the root attribute. Mirrors the pre-paint script in index.html. */
export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private-mode / disabled storage: the attribute still applied above */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}
