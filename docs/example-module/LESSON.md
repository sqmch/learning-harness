# Lesson — Retry with Exponential Backoff

## 1. The problem, plainly

A network call fails, so you retry. It fails again — partly *because* the service is
overloaded, and your immediate retry is one of the things overloading it. Now picture a thousand
clients hitting the same failing service in the same second: they all fail together, they all
retry together, and the retries become a self-sustaining stampede. That's the **thundering
herd**, and a naive `while (!ok) retry()` loop causes it.

Two ideas fix it, and together they are the whole module:

- **Back off exponentially** — wait longer after each successive failure, so a struggling
  service gets breathing room instead of a fixed-rate barrage.
- **Add jitter** — randomize each client's wait, so a herd that failed together doesn't retry in
  lockstep.

## 2. The delay function

The retry *loop* is boring (try, catch, wait, repeat, give up after N). The one load-bearing
piece — the part worth testing in isolation — is the pure function that answers: *given the
attempt number, how long do I wait?*

```
backoffDelay(attempt) = random(0, min(cap, base · factor^attempt))
```

`base` is the first ceiling, `factor` (usually 2) sets the growth, and `cap` bounds the wait so
it can't grow without limit. The `random(0, …)` is **full jitter**: the delay is a uniform draw
from zero up to the current ceiling, not the ceiling itself.

### Worked example

`base = 100ms, factor = 2, cap = 2000ms`. The *ceiling* per attempt, before jitter:

```
attempt 0:  min(2000, 100·2^0) =  100
attempt 1:  min(2000, 100·2^1) =  200
attempt 2:  min(2000, 100·2^2) =  400
attempt 3:  min(2000, 100·2^3) =  800
attempt 4:  min(2000, 100·2^4) = 1600
attempt 5:  min(2000, 100·2^5 = 3200) → 2000   ← capped
```

The actual delay is a random point in `[0, ceiling)`. So attempt 2 waits somewhere in
`[0, 400)ms`, not exactly 400. Two clients that both failed on attempt 2 draw different waits and
stop colliding.

## 3. Why full jitter, not the obvious alternatives

- **No jitter** (`delay = ceiling`) backs off but keeps the herd synchronized — every client
  waits *exactly* 400ms and hits again in lockstep.
- **Equal jitter** (`ceiling/2 + random(0, ceiling/2)`) spreads them a little but still clusters
  in the top half of the window.
- **Full jitter** spreads retries across the whole window. AWS's oft-cited backoff study found it
  minimizes both contention and the time to get every client through — the least coordination for
  the most spread.

The cost is that full jitter can occasionally pick a *very* short wait. That's the accepted
trade, and it's why `cap` still matters: jitter bounds the wait from below, `cap` bounds it from
above.

## 4. Why a pure, injectable function

Notice `backoffDelay` takes the randomness as an argument (`rng`) instead of calling
`Math.random()` inside. That isn't ceremony — it's what makes the behavior *checkable*. Pass
`rng = () => 0` and every delay is `0`; pass `rng = () => 0.999…` and every delay is just under
its ceiling. The checks can then pin the ceiling growth and the cap to exact numbers, with no
real clock and no flaky sleeps. (Same move as a vector store's checks injecting a fake embedder:
push the nondeterminism out to the boundary so the core stays a pure function you can assert on.)

## 5. Vocabulary you now own

*exponential backoff, retry ceiling, jitter (full / equal / none), thundering herd, cap,
dependency injection for determinism.*
