// Unit tests for the pure spaced-repetition units in scripts/quiz.mjs:
// the interval rule, the UTC calendar-day math, and the byte-stable serializer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextInterval, addDays, daysBetween, validIso, serializeBank } from "../quiz.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("nextInterval: the rule, derived from the real bank's numbers", () => {
  // correct → max(2, round(prev × 2.5)); round-half-up, so a fresh item earns 3
  assert.equal(nextInterval(1, "correct"), 3); // round(2.5) = 3, not 2
  assert.equal(nextInterval(3, "correct"), 8); // round(7.5) = 8
  assert.equal(nextInterval(2, "correct"), 5); // round(5.0) = 5
  assert.equal(nextInterval(undefined, "correct"), 3); // prev ?? 1 → round(2.5) = 3
  // partial → 2; wrong / tutored → 1 (tutored = asked but taught, re-test tomorrow)
  assert.equal(nextInterval(6, "partial"), 2);
  assert.equal(nextInterval(8, "wrong"), 1);
  assert.equal(nextInterval(8, "tutored"), 1);
  // the max(2, ·) floor binds only when round(prev × 2.5) would be < 2
  assert.equal(nextInterval(0, "correct"), 2);
});

test("addDays: plain step and month / year rollover, in both directions", () => {
  assert.equal(addDays("2026-07-08", 3), "2026-07-11");
  assert.equal(addDays("2026-01-31", 1), "2026-02-01"); // month rollover
  assert.equal(addDays("2026-12-31", 1), "2027-01-01"); // year rollover
  assert.equal(addDays("2026-03-01", -1), "2026-02-28"); // 2026 is not a leap year
  assert.equal(addDays("2024-03-01", -1), "2024-02-29"); // 2024 is
});

test("daysBetween: spans, including month / year boundaries and negatives", () => {
  assert.equal(daysBetween("2026-06-16", "2026-07-08"), 22);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-07-08", "2026-07-08"), 0);
  assert.equal(daysBetween("2026-07-08", "2026-07-01"), -7); // today < due → not yet due
});

test("validIso: format shape AND real-calendar validity", () => {
  assert.equal(validIso("2026-07-08"), true);
  assert.equal(validIso("2026-13-01"), false); // month 13
  assert.equal(validIso("2026-02-30"), false); // Feb 30 rolls over → not a real date
  assert.equal(validIso("2026-2-8"), false); // not zero-padded
  assert.equal(validIso("2026/07/08"), false); // wrong separators
  assert.equal(validIso("not-a-date"), false);
  assert.equal(validIso(20260708), false); // not a string
  assert.equal(validIso(undefined), false);
});

test("serializeBank: round-trips a real-shaped fixture byte-for-byte", () => {
  const raw = fs.readFileSync(path.join(here, "fixtures", "quiz-bank.sample.json"), "utf8");
  // A Windows checkout may store the fixture with CRLF; the serializer emits LF.
  const lf = raw.replace(/\r\n/g, "\n");
  const out = serializeBank(JSON.parse(lf));
  // Key order, one-line history entries, empty-history `[]`, and the trailing
  // newline must all survive — that is what keeps one grade's git diff small.
  assert.equal(out, lf);
});
