// Unit tests for src/state/parse.ts — the pure data→data helpers behind the
// record overlay (quiz queue, journal reader, progress analytics). Due-ness
// mirrors scripts/quiz.mjs; the journal parser has to survive real-world heading
// shapes (a two-day range heading, a dropped preamble, level-3 subheadings).
import { describe, test, expect } from "vitest";
import {
  validIso,
  daysBetween,
  parseQuizBank,
  dueItems,
  scheduledItems,
  parseJournal,
  parseProgress,
  moduleDuration,
  parsePace,
  hintLevels,
  type QuizBank,
} from "../src/state/parse";

// ── date primitives ────────────────────────────────────────────────────────

describe("validIso / daysBetween", () => {
  test("validIso: shape and real-calendar validity", () => {
    expect(validIso("2026-07-08")).toBe(true);
    expect(validIso("2026-13-01")).toBe(false); // month 13
    expect(validIso("2026-02-30")).toBe(false); // Feb 30 rolls over
    expect(validIso("2026-7-8")).toBe(false); // not zero-padded
    expect(validIso("2026/07/08")).toBe(false);
    expect(validIso(20260708)).toBe(false); // not a string
    expect(validIso(undefined)).toBe(false);
  });

  test("daysBetween: signed whole-day spans, across month/year boundaries", () => {
    expect(daysBetween("2026-07-01", "2026-07-08")).toBe(7);
    expect(daysBetween("2026-07-08", "2026-07-08")).toBe(0);
    expect(daysBetween("2026-07-08", "2026-07-01")).toBe(-7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });
});

// ── quiz bank ──────────────────────────────────────────────────────────────

describe("parseQuizBank", () => {
  test("accepts a bank with an items array; rejects malformed / wrong-shaped", () => {
    expect(parseQuizBank('{"items":[]}')).toEqual({ items: [] });
    expect(parseQuizBank("not json")).toBe(null);
    expect(parseQuizBank('{"items":"nope"}')).toBe(null); // items not an array
    expect(parseQuizBank("null")).toBe(null);
  });
});

describe("dueItems / scheduledItems", () => {
  const today = "2026-07-08";
  const bank: QuizBank = {
    items: [
      { id: "a", due: "2026-07-01" }, // 7 overdue
      { id: "b", due: "2026-07-08" }, // due exactly today (over 0 → due)
      { id: "c", due: "2026-07-05" }, // 3 overdue
      { id: "d", due: "2026-07-20" }, // future
      { id: "g", due: "2026-07-01" }, // ties a on date → id breaks the tie
      { id: "h", due: "2026-07-15" }, // future, sooner than d
      { id: "e", due: "not-a-date" }, // invalid → dropped from both
      { id: "f" }, // no due → dropped from both
    ],
  };

  test("dueItems: over>=0 only, most-overdue-first, id as tiebreak", () => {
    const rows = dueItems(bank, today);
    expect(rows.map((r) => r.item.id)).toEqual(["a", "g", "c", "b"]);
    expect(rows.map((r) => r.over)).toEqual([7, 7, 3, 0]); // distance from today
  });

  test("dueItems: due exactly today counts as due (over === 0)", () => {
    const rows = dueItems({ items: [{ id: "x", due: today }] }, today);
    expect(rows).toHaveLength(1);
    expect(rows[0].over).toBe(0);
  });

  test("scheduledItems: over<0 only, soonest-first", () => {
    const rows = scheduledItems(bank, today);
    expect(rows.map((r) => r.item.id)).toEqual(["h", "d"]); // 07-15 before 07-20
    expect(rows.map((r) => r.over)).toEqual([-7, -12]);
  });

  test("null / shapeless bank → empty for both queues", () => {
    expect(dueItems(null, today)).toEqual([]);
    expect(scheduledItems(null, today)).toEqual([]);
    expect(dueItems({ items: undefined } as unknown as QuizBank, today)).toEqual([]);
  });
});

// ── journal ────────────────────────────────────────────────────────────────

describe("parseJournal", () => {
  const journal = [
    "# Journal", // preamble — dropped
    "",
    "Some intro prose before the first entry.",
    "",
    "## 2026-06-10 — Session 1 (module 00)",
    "Covered vectors.",
    "### A subsection that must NOT open a new entry",
    "More text.",
    "",
    "---",
    "",
    "## 2026-06-15/16 — Session 5 (two-day range)",
    "Worked across two days.",
    "",
    "## 2026-07-03 — Maintenance",
    "Reconciled state.",
  ].join("\n");

  test("splits on level-2 headings, newest-first, dropping the preamble", () => {
    const entries = parseJournal(journal);
    expect(entries.map((e) => e.date)).toEqual(["2026-07-03", "2026-06-15/16", "2026-06-10"]);
    expect(entries.map((e) => e.title)).toEqual([
      "Maintenance",
      "Session 5 (two-day range)",
      "Session 1 (module 00)",
    ]);
  });

  test("a '## 2026-06-15/16' range heading keeps the whole range as its date", () => {
    const entries = parseJournal(journal);
    expect(entries.find((e) => e.title.startsWith("Session 5"))?.date).toBe("2026-06-15/16");
  });

  test("level-3 headings stay in the body; trailing --- and blanks are trimmed", () => {
    const entries = parseJournal(journal);
    const s1 = entries.find((e) => e.title.startsWith("Session 1"))!;
    expect(s1.body).toBe(
      "Covered vectors.\n### A subsection that must NOT open a new entry\nMore text.",
    );
  });

  test("splitHeading (via parseJournal): en-dash and spaced-hyphen separators", () => {
    const entries = parseJournal(
      ["## 2026-07-01 – En Dash Title", "x", "## 2026-07-02 - Hyphen Title", "y"].join("\n"),
    );
    expect(entries.map((e) => ({ date: e.date, title: e.title }))).toEqual([
      { date: "2026-07-02", title: "Hyphen Title" },
      { date: "2026-07-01", title: "En Dash Title" },
    ]);
  });

  test("splitHeading (via parseJournal): a dateless heading → empty date, whole title", () => {
    const entries = parseJournal("## Just a note with no separator\nbody");
    expect(entries[0].date).toBe("");
    expect(entries[0].title).toBe("Just a note with no separator");
  });

  test("no level-2 headings (or empty) → no entries", () => {
    expect(parseJournal("")).toEqual([]);
    expect(parseJournal("just prose\n### only an h3\nmore")).toEqual([]);
  });
});

// ── progress ───────────────────────────────────────────────────────────────

describe("parseProgress", () => {
  test("parses an object; degrades malformed JSON to null", () => {
    expect(parseProgress('{"currentModule":"01"}')).toEqual({ currentModule: "01" });
    expect(parseProgress("{ bad")).toBe(null);
  });
});

describe("moduleDuration", () => {
  const today = "2026-07-08";

  test("never started → null", () => {
    expect(moduleDuration({}, today)).toBe(null);
    expect(moduleDuration({ startedAt: "not-a-date" }, today)).toBe(null);
  });

  test("started, not completed → ongoing, measured to today", () => {
    expect(moduleDuration({ startedAt: "2026-07-01" }, today)).toEqual({ days: 7, ongoing: true });
  });

  test("started and completed → closed span, start→completion", () => {
    expect(moduleDuration({ startedAt: "2026-06-10", completedAt: "2026-06-16" }, today)).toEqual({
      days: 6,
      ongoing: false,
    });
  });

  test("an invalid completedAt is treated as still-ongoing (measured to today)", () => {
    expect(moduleDuration({ startedAt: "2026-07-01", completedAt: "" }, today)).toEqual({
      days: 7,
      ongoing: true,
    });
  });

  test("completion before start clamps to 0 days, never negative", () => {
    expect(moduleDuration({ startedAt: "2026-07-08", completedAt: "2026-07-01" }, today)).toEqual({
      days: 0,
      ongoing: false,
    });
  });
});

describe("parsePace", () => {
  test("ranges, single values, prose, and decimals", () => {
    expect(parsePace("3-5")).toEqual({ lo: 3, hi: 5 });
    expect(parsePace("3–5")).toEqual({ lo: 3, hi: 5 }); // en dash
    expect(parsePace("4")).toEqual({ lo: 4, hi: 4 }); // single value → lo === hi
    expect(parsePace("10 to 12 hours")).toEqual({ lo: 10, hi: 12 });
    expect(parsePace("2.5-3.5")).toEqual({ lo: 2.5, hi: 3.5 });
  });

  test("no digits or missing → null", () => {
    expect(parsePace(undefined)).toBe(null);
    expect(parsePace("")).toBe(null);
    expect(parsePace("a few")).toBe(null);
  });
});

describe("hintLevels", () => {
  test("maps a hintsUsed list to a fixed 3-slot row of hint-1/2/3", () => {
    expect(hintLevels(undefined)).toEqual([false, false, false]);
    expect(hintLevels([])).toEqual([false, false, false]);
    expect(hintLevels(["hint-1"])).toEqual([true, false, false]);
    expect(hintLevels(["hint-1", "hint-3"])).toEqual([true, false, true]);
    expect(hintLevels(["hint-2"])).toEqual([false, true, false]);
  });

  test("duplicates and unknown entries don't disturb the three slots", () => {
    expect(hintLevels(["hint-1", "hint-1", "hint-9", "noise"])).toEqual([true, false, false]);
  });
});
