/**
 * localStorage keys the study reads for its own UI state (pane widths, last
 * selected module). All namespaced `study.*`. Earlier builds used a `ck.*`
 * prefix from the "cockpit" era; `migrateLegacyKeys()` adopts those once so a
 * returning learner keeps their layout, then leaves the new key as the source
 * of truth. The study owns zero durable state over the *course* — this is
 * browser-local UI preference only, the sanctioned exception.
 */
const MIGRATIONS: Record<string, string> = {
  "ck.railW": "study.railW",
  "ck.termW": "study.termW",
  "ck.selected": "study.selected",
};

/** One-time read of each legacy key: honoured once if the new key is unset, then
 *  the old key is cleared so it can never shadow a later change to the new one. */
export function migrateLegacyKeys(): void {
  try {
    for (const [oldKey, newKey] of Object.entries(MIGRATIONS)) {
      const old = localStorage.getItem(oldKey);
      if (old === null) continue;
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, old);
      localStorage.removeItem(oldKey);
    }
  } catch {
    /* storage disabled — nothing to migrate, defaults apply */
  }
}

export function readNum(key: string, fallback: number): number {
  try {
    return Number(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export function writeStr(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
