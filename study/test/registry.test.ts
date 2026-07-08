// Unit tests for src/lab/registry.ts — the extensibility seam that turns a
// course's per-module lab.json into the set of openable visualizations. Already
// a pure module; these lock in the derivation (stock claims, custom visuals,
// dedup across modules, focusLab default, per-module config routing).
import { describe, test, expect } from "vitest";
import type { ModuleInfo, ModuleLabConfig } from "../src/api";
import {
  buildEntries,
  entriesForModule,
  moduleHasVisuals,
  defaultEntryKey,
  configFor,
  visualSrc,
} from "../src/lab/registry";

// Minimal ModuleInfo factory — only id + lab drive the registry; the rest are
// filled with neutral values so the fixtures stay readable.
function mod(id: string, lab?: ModuleLabConfig | null): ModuleInfo {
  return {
    id,
    title: id,
    phase: 0,
    prerequisites: [],
    runtime: "node",
    estimatedHours: 1,
    status: "not-started",
    hintsUsed: [],
    checkAttempts: 0,
    docs: [],
    lab: lab ?? null,
  };
}

describe("buildEntries", () => {
  test("a module claims a stock lab by carrying its config key", () => {
    const entries = buildEntries([mod("01-embeddings", { vectors: { axisX: "x" } })]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "vectors",
      kind: "stock",
      title: "Vectors & Similarity",
      modules: ["01-embeddings"],
    });
    expect(entries[0].stock?.id).toBe("vectors");
  });

  test("the retrieval stock labs (topk, precision-recall) resolve by their config keys", () => {
    const entries = buildEntries([
      mod("03-rag-pipeline", { topk: { k: 4 } }),
      mod("04-rag-quality", { "precision-recall": { cutoff: 3 } }),
    ]);
    expect(entries.map((e) => e.key)).toEqual(["topk", "precision-recall"]);
    expect(entries[0]).toMatchObject({
      key: "topk",
      kind: "stock",
      title: "Top-k Retrieval",
      modules: ["03-rag-pipeline"],
    });
    expect(entries[1]).toMatchObject({
      key: "precision-recall",
      kind: "stock",
      title: "Precision & Recall",
      modules: ["04-rag-quality"],
    });
    // the hyphenated key survives as both the stock id and the entry key
    expect(entries[1].stock?.id).toBe("precision-recall");
  });

  test("one stock lab claimed by several modules → a single entry accumulating modules", () => {
    const entries = buildEntries([
      mod("01-embeddings", { vectors: {} }),
      mod("02-vector-store", { vectors: {}, chunking: {} }),
    ]);
    const vectors = entries.filter((e) => e.key === "vectors");
    expect(vectors).toHaveLength(1); // deduped, not one-per-module
    expect(vectors[0].modules).toEqual(["01-embeddings", "02-vector-store"]);
    // 02 also claims chunking → two distinct stock entries total
    expect(entries.map((e) => e.key)).toEqual(["vectors", "chunking"]);
  });

  test("custom HTML visuals become their own entries, keyed <module>/<file>", () => {
    const entries = buildEntries([
      mod("03-rag-pipeline", {
        visuals: [{ file: "pipeline.html", title: "The pipeline", blurb: "flow" }],
      }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "03-rag-pipeline/pipeline.html",
      kind: "html",
      title: "The pipeline",
      blurb: "flow",
      modules: ["03-rag-pipeline"],
      src: "/visual/03-rag-pipeline/pipeline.html",
    });
  });

  test("a leading 'visuals/' in the file is stripped from key and src", () => {
    const entries = buildEntries([
      mod("03-rag-pipeline", { visuals: [{ file: "visuals/pipeline.html", title: "P" }] }),
    ]);
    expect(entries[0].key).toBe("03-rag-pipeline/pipeline.html");
    expect(entries[0].src).toBe("/visual/03-rag-pipeline/pipeline.html");
  });

  test("stock claims precede custom visuals within a module, in STOCK_LABS order", () => {
    const entries = buildEntries([
      mod("02-vector-store", {
        chunking: {},
        vectors: {},
        visuals: [{ file: "extra.html", title: "Extra" }],
      }),
    ]);
    // vectors before chunking (registry order), both before the html visual
    expect(entries.map((e) => e.key)).toEqual([
      "vectors",
      "chunking",
      "02-vector-store/extra.html",
    ]);
  });

  test("a malformed visual entry (missing file or title) must not brick the overlay", () => {
    const entries = buildEntries([
      mod("03", {
        visuals: [
          { file: "ok.html", title: "OK" },
          { title: "no file" } as never,
          { file: "no-title.html" } as never,
          null as never,
        ],
      }),
    ]);
    expect(entries.map((e) => e.key)).toEqual(["03/ok.html"]); // only the well-formed one
  });

  test("modules without a lab.json contribute nothing", () => {
    expect(buildEntries([mod("00-orientation", null), mod("04-rag-quality")])).toEqual([]);
  });

  test("an empty lab object claims no stock lab and adds no visuals", () => {
    expect(buildEntries([mod("00", {})])).toEqual([]);
  });
});

describe("entriesForModule", () => {
  test("filters to entries a module belongs to (shared stock labs included)", () => {
    const entries = buildEntries([
      mod("01", { vectors: {} }),
      mod("02", { vectors: {}, chunking: {} }),
    ]);
    expect(entriesForModule(entries, "01").map((e) => e.key)).toEqual(["vectors"]);
    expect(entriesForModule(entries, "02").map((e) => e.key)).toEqual(["vectors", "chunking"]);
  });
});

describe("moduleHasVisuals", () => {
  test("true when the module claims a stock lab or ships a visual, else false", () => {
    expect(moduleHasVisuals(mod("01", { vectors: {} }))).toBe(true);
    expect(moduleHasVisuals(mod("03", { visuals: [{ file: "a.html", title: "A" }] }))).toBe(true);
    expect(moduleHasVisuals(mod("00", null))).toBe(false);
    expect(moduleHasVisuals(mod("00", {}))).toBe(false);
  });
});

describe("defaultEntryKey", () => {
  const modules = [
    mod("01", { vectors: {} }),
    mod("02", { vectors: {}, chunking: {}, focusLab: "chunking" }),
  ];
  const entries = buildEntries(modules);

  test("honors the module's focusLab when it names one of the module's entries", () => {
    const cfg = modules[1].lab as ModuleLabConfig;
    expect(defaultEntryKey(entries, "02", cfg)).toBe("chunking");
  });

  test("falls back to the module's first entry when focusLab is absent", () => {
    expect(defaultEntryKey(entries, "02", { focusLab: undefined })).toBe("vectors");
  });

  test("focusLab naming an entry NOT in this module is ignored → first entry", () => {
    // "01" only has vectors; a stray focusLab: "chunking" must not win
    expect(defaultEntryKey(entries, "01", { focusLab: "chunking" })).toBe("vectors");
  });

  test("no module context → the very first entry overall", () => {
    expect(defaultEntryKey(entries, null, null)).toBe("vectors");
  });

  test("null everything / empty entries → null", () => {
    expect(defaultEntryKey([], null, null)).toBe(null);
    expect(defaultEntryKey([], "01", null)).toBe(null);
  });
});

describe("configFor", () => {
  const modules = [mod("01", { vectors: { axisX: "login" } }), mod("02", { vectors: {} })];
  const entries = buildEntries(modules);
  const vectors = entries.find((e) => e.key === "vectors")!;

  test("feeds the context module's own lab.json when it claims the entry", () => {
    expect(configFor(vectors, modules, "01")).toEqual({
      config: { vectors: { axisX: "login" } },
      moduleId: "01",
    });
  });

  test("no context module → no config (a generic, module-less open)", () => {
    expect(configFor(vectors, modules, null)).toEqual({ config: null, moduleId: null });
  });

  test("context module that does not claim this entry → no config", () => {
    const htmlEntry = buildEntries([mod("03", { visuals: [{ file: "a.html", title: "A" }] })])[0];
    expect(configFor(htmlEntry, modules, "01")).toEqual({ config: null, moduleId: null });
  });
});

describe("visualSrc", () => {
  test("builds the /visual URL, url-encoding and stripping a leading visuals/", () => {
    expect(visualSrc("02-vector-store", "plane.html")).toBe("/visual/02-vector-store/plane.html");
    expect(visualSrc("02", "visuals/plane.html")).toBe("/visual/02/plane.html");
    expect(visualSrc("mod a", "a b.html")).toBe("/visual/mod%20a/a%20b.html");
  });
});
