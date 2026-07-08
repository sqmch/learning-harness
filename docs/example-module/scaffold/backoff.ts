// Illustrative scaffold (a SKETCH — see docs/example-module/README.md, and docs/FORMAT.md
// for the real format). In a real module this compiles and runs, but fails the checks until
// you fill the TODO(you) gaps. It is deliberately not wired to run from this docs directory.

export interface BackoffOpts {
  base: number; // first ceiling, in ms
  factor: number; // growth per attempt (usually 2)
  cap: number; // upper bound on the wait, in ms
  rng: () => number; // returns a number in [0, 1); injected so the checks are deterministic
}

/** Full-jitter delay for a given attempt: a draw from [0, min(cap, base·factor^attempt)). */
export function backoffDelay(attempt: number, opts: BackoffOpts): number {
  // TODO(you): compute the raw ceiling (base · factor^attempt), clamp it to `cap`, then scale
  // by opts.rng() to apply full jitter. See LESSON §2. Returning 0 makes the checks fail on
  // assertions, which is what a virgin scaffold should do.
  return 0;
}

export interface RetryOpts extends BackoffOpts {
  maxAttempts: number;
}

/** Call fn; back off and retry on rejection; rethrow the last error after maxAttempts tries. */
export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  // TODO(you): loop attempt 0..maxAttempts-1; return fn() on success; on rejection either
  // rethrow (last attempt) or await a sleep of backoffDelay(attempt, opts) and continue.
  throw new Error("not implemented");
}
