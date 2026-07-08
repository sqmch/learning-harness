# Hint 3 — near-spoiler (pseudocode)

You still type it; this is the shape.

**backoffDelay**

```
ceiling = min(cap, base * (factor ** attempt))
return rng() * ceiling            // rng() in [0,1)  →  delay in [0, ceiling)
```

**retry**

```
for attempt = 0; attempt < maxAttempts; attempt++:
    try:
        return await fn()
    catch err:
        if attempt === maxAttempts - 1: throw err
        await sleep(backoffDelay(attempt, opts))   // sleep = new Promise(r => setTimeout(r, ms))
```

If a check still fails after this, read *which* expectation failed: a ceiling that grows by the
wrong factor points at step 1; a delay that equals its ceiling points at the jitter.
