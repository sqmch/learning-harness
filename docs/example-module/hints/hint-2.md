# Hint 2 — the approach

**backoffDelay(attempt, { base, factor, cap, rng })**

1. Compute the raw ceiling as `base` times `factor` raised to the `attempt` power. Reach for the
   exponent operator (or `Math.pow`); don't loop and multiply.
2. Clamp it: the effective ceiling is the smaller of that raw value and `cap`. `Math.min` is the
   whole clamp.
3. Apply full jitter by scaling the ceiling by `rng()`. Because `rng()` lives in `[0, 1)`, the
   product lands in `[0, ceiling)` for free — no addition, no half-ranges to manage.

**retry(fn, { maxAttempts, ...opts })**

- Loop the attempt index from `0`. Each pass, `await fn()` inside a `try` and return its value on
  success.
- On a caught rejection: if this was the last allowed attempt, rethrow; otherwise wait for
  `backoffDelay(attempt, opts)` before the next pass. A `Promise` that resolves from a timer is
  the idiomatic wait.

**Why inject `rng`?** Same reason a store's checks inject a fake embedder — pushing the
nondeterminism out to a parameter is what lets the checks assert an exact number instead of a
range.
