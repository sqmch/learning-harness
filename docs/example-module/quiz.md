# Example module — quiz items

1. Write the full-jitter delay formula for a given `attempt`, and say what `base`, `factor`, and
   `cap` each control.
2. With `base = 100ms`, `factor = 2`, `cap = 2000ms`, give the *ceiling* for attempts 0 through 5.
   At which attempt does the cap first bite?
3. What failure does *jitter* prevent that exponential backoff alone does not? Name it.
4. Contrast full jitter, equal jitter, and no jitter in one sentence each.
5. `cap` bounds the top of the wait; what bounds the bottom, and why is full jitter's occasional
   very-short wait an acceptable trade?
6. Why does `backoffDelay` take `rng` as an argument instead of calling `Math.random()`? Tie it to
   how the checks can assert an exact value.
