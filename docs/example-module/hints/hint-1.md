# Hint 1 — a nudge

**The ceiling.** Before any randomness, each attempt has a maximum wait. Write out
`base · factor^attempt` for attempts 0, 1, 2, 3 by hand, then ask what `cap` does to the large
ones. The exponent is just the attempt number — you don't need an accumulator or a loop to build
it.

**The jitter.** "Full jitter" means the delay is a *fraction* of the ceiling, and `rng()` hands
you that fraction directly — it's already in `[0, 1)`. What single operation turns a ceiling and a
fraction into a delay?

**Determinism.** The checks pass you an `rng`. If a test sets `rng = () => 0`, what must every
delay be? If that isn't what your function returns, the randomness isn't coming from the argument.
