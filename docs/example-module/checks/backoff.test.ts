// Illustrative checks (a SKETCH — not wired to a runner in this docs directory; see README.md).
// They grade BEHAVIOR — what backoffDelay/retry do for given inputs — never how they're written.
// Randomness is injected (rng) so every assertion is exact; nothing sleeps on a real clock, so
// there are no timing-based assertions to flake.
import { describe, it, expect, vi } from "vitest";
import { backoffDelay, retry } from "../scaffold/backoff.js";

const opts = (rng: () => number) => ({ base: 100, factor: 2, cap: 2000, rng });

describe("backoffDelay", () => {
  it("scales the ceiling by rng(), and the ceiling doubles each attempt", () => {
    const near1 = () => 0.999999; // reads the ceiling back out through full jitter
    expect(backoffDelay(0, opts(near1))).toBeCloseTo(100 * 0.999999);
    expect(backoffDelay(1, opts(near1))).toBeCloseTo(200 * 0.999999);
    expect(backoffDelay(2, opts(near1))).toBeCloseTo(400 * 0.999999);
  });

  it("clamps the ceiling at cap", () => {
    // attempt 5 raw ceiling = 100·2^5 = 3200, above cap 2000
    expect(backoffDelay(5, opts(() => 0.999999))).toBeCloseTo(2000 * 0.999999);
  });

  it("returns 0 when rng() is 0, and never a negative delay", () => {
    expect(backoffDelay(3, opts(() => 0))).toBe(0);
    for (let a = 0; a < 6; a++) {
      expect(backoffDelay(a, opts(() => 0.5))).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("retry", () => {
  it("resolves once fn eventually succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("flaky");
      return "ok";
    });
    // rng() => 0 makes every backoff 0, so the test never waits on a real timer
    const out = await retry(fn, { ...opts(() => 0), maxAttempts: 5 });
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("rethrows the last error after maxAttempts failures", async () => {
    const fn = async () => {
      throw new Error("always down");
    };
    await expect(retry(fn, { ...opts(() => 0), maxAttempts: 3 })).rejects.toThrow("always down");
  });
});
