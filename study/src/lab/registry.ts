import type { ComponentType } from "react";
import type { ModuleInfo, ModuleLabConfig } from "../api";
import { VectorSimilarityLab } from "./labs/VectorSimilarityLab";
import { ChunkingOverlapLab } from "./labs/ChunkingOverlapLab";

/** Props every stock lab component receives from the overlay. */
export interface LabProps {
  config?: ModuleLabConfig | null;
  moduleId?: string | null;
}

// ── the extensibility seam ───────────────────────────────────────────────
//
// The engine ships STOCK LABS: polished, reusable interactives. It never
// decides which course they belong to — a module claims a stock lab by
// carrying that lab's config key in its `lab.json` (e.g. a `"vectors"` key
// claims the vectors lab). Courses can also ship their own visuals as
// self-contained HTML (`curriculum/NN/visuals/*.html`, listed under
// `lab.json.visuals`) — both kinds appear in the overlay side by side.
//
// To add a stock lab: drop a component in ./labs/, add an entry below keyed
// by the lab.json config key that claims it. See LAB.md.

export interface StockLab {
  /** = the lab.json config key that claims this lab. */
  id: string;
  title: string;
  blurb: string;
  component: ComponentType<LabProps>;
}

export const STOCK_LABS: StockLab[] = [
  {
    id: "vectors",
    title: "Vectors & Similarity",
    blurb: "Drag two arrows. Feel dot product, length, cosine, and distance move.",
    component: VectorSimilarityLab,
  },
  {
    id: "chunking",
    title: "Chunking & Overlap",
    blurb: "Why long text gets split, and what overlapping windows buy you.",
    component: ChunkingOverlapLab,
  },
];

/** One openable visualization, derived from the course. */
export interface LabEntry {
  /** Stable key: the stock id, or `<moduleId>/<file>` for an HTML visual. */
  key: string;
  kind: "stock" | "html";
  title: string;
  blurb?: string;
  /** Module ids this entry belongs to (stock labs may be claimed by several). */
  modules: string[];
  /** kind === "stock" */
  stock?: StockLab;
  /** kind === "html": iframe URL, served with a self-containment CSP. */
  src?: string;
}

const stripPrefix = (file: string) => file.replace(/^visuals\//, "");

export const visualSrc = (moduleId: string, file: string) =>
  `/visual/${encodeURIComponent(moduleId)}/${encodeURIComponent(stripPrefix(file))}`;

/** Every visualization the course has claimed or shipped, in module order. */
export function buildEntries(modules: ModuleInfo[]): LabEntry[] {
  const entries: LabEntry[] = [];
  const stockSeen = new Map<string, LabEntry>();
  for (const m of modules) {
    const lab = m.lab;
    if (!lab) continue;
    for (const stock of STOCK_LABS) {
      if (!(stock.id in lab)) continue;
      const existing = stockSeen.get(stock.id);
      if (existing) {
        existing.modules.push(m.id);
      } else {
        const entry: LabEntry = {
          key: stock.id,
          kind: "stock",
          title: stock.title,
          blurb: stock.blurb,
          modules: [m.id],
          stock,
        };
        stockSeen.set(stock.id, entry);
        entries.push(entry);
      }
    }
    for (const v of lab.visuals ?? []) {
      if (!v?.file || !v.title) continue; // a malformed entry must not brick the overlay
      entries.push({
        key: `${m.id}/${stripPrefix(v.file)}`,
        kind: "html",
        title: v.title,
        blurb: v.blurb,
        modules: [m.id],
        src: visualSrc(m.id, v.file),
      });
    }
  }
  return entries;
}

/** The entries belonging to one module (drives lesson chips + rail badges). */
export function entriesForModule(entries: LabEntry[], moduleId: string): LabEntry[] {
  return entries.filter((e) => e.modules.includes(moduleId));
}

export function moduleHasVisuals(m: ModuleInfo): boolean {
  return buildEntries([m]).length > 0;
}

/** Which entry to open first: honor the module's focusLab, else its first entry. */
export function defaultEntryKey(
  entries: LabEntry[],
  moduleId: string | null,
  config: ModuleLabConfig | null,
): string | null {
  if (moduleId) {
    const mine = entriesForModule(entries, moduleId);
    const focused = config?.focusLab && mine.find((e) => e.key === config.focusLab);
    if (focused) return focused.key;
    if (mine[0]) return mine[0].key;
  }
  return entries[0]?.key ?? null;
}

/** The lab.json to feed a stock lab: the context module's, if it claims the lab. */
export function configFor(
  entry: LabEntry,
  modules: ModuleInfo[],
  contextModuleId: string | null,
): { config: ModuleLabConfig | null; moduleId: string | null } {
  if (contextModuleId && entry.modules.includes(contextModuleId)) {
    const m = modules.find((mm) => mm.id === contextModuleId);
    if (m?.lab) return { config: m.lab, moduleId: m.id };
  }
  return { config: null, moduleId: null };
}
