# Brief — Retry with Exponential Backoff

**Time:** ~2 hours · **Prereq:** none · **Read first:** `LESSON.md`

> This is an *illustrative* module (see this directory's `README.md`). In a real course the
> scaffold and checks are generated and QA'd against a sealed reference when you start the
> module; here they're a compact sketch you read, not run.

## Build task

1. **`backoffDelay(attempt, opts): number`** — the pure delay function from LESSON §2.
   `opts = { base, factor, cap, rng }`, where `rng()` returns a number in `[0, 1)`. Return a
   **full-jitter** delay: a draw from `[0, ceiling)` where
   `ceiling = min(cap, base · factor^attempt)`.
2. **`retry(fn, opts): Promise<T>`** — call `fn`; on rejection, wait `backoffDelay(attempt, opts)`
   and try again, up to `opts.maxAttempts`; rethrow the last error when the attempts run out.

## Acceptance criteria

- Checks pass: the ceiling doubles per attempt until it clamps at `cap`; `attempt 0` uses `base`;
  the returned delay never reaches its ceiling and is never negative; `retry` resolves when `fn`
  eventually succeeds and rethrows after `maxAttempts` failures.
- The delay function is **pure** and takes `rng` as an argument — no `Math.random()` inside, no
  real sleeping in the delay math.

## Explore

1. Set `rng` to a fixed `0.5` and tabulate the delay for attempts 0–6. Where does the cap first
   change the answer?
2. Swap full jitter for `delay = ceiling` (no jitter) on paper. For a thousand clients that
   failed in the same second, what does the retry timeline look like?

## Explain-it-back (module gate)

Cold, to the tutor: why does *full* jitter beat *no* jitter for a thousand clients that failed in
the same second — and what does `cap` protect that jitter alone does not?
