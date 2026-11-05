# Phase Chimes

A pendulum wave that plays itself. Pendulum *n* (the longest is *n* = 0) makes
exactly *k* + *n* full swings in one cycle of *T* seconds. Released together,
the row fans out into a travelling wave, splits into two and three rows, looks
random, and lines up again at *T*. Each bob strikes a chime at the end of its
swing, so you hear the pattern as well as see it: a ripple, then phasing, then
a single chord at the realignment.

## Physics (`physics.js`)

- Period T_n = T / (k + n); length L_n = g (T_n / 2π)². At the defaults
  (15 pendulums, k = 51, T = 60 s) the lengths run from 34.4 cm to 21.2 cm.
- **Ideal mode** uses the closed form θ_n(t) = θ₀ e^(−ct) cos(2π t / T_n). It is
  exact for the linearised pendulum and never drifts, so the row lines up at
  every multiple of T.
- **Gravity** leaves the lengths alone, so it only changes how fast the whole
  pattern runs (by √(g / 9.81)). The sim keeps a "pattern time" that runs at that
  rate, so gravity can change mid-cycle without a jump.
- **Real pendulum** integrates θ'' = −(g/L) sin θ − 2cθ' − κ L θ'|θ'| with RK4
  (1/240 s steps). The last term is air drag on a 3 cm, 110 g steel ball
  (κ = ρ C_d A / 2m). Two things stop a real row realigning:
  big swings take longer, and drag takes amplitude off each bob at its own rate.
  Without drag, equal amplitudes would stretch every period by the same factor,
  and the row would still line up, only late; the tests check this. At 40° the
  row lines up about 2.6% late and only to within about 18 ms, and it misses by
  more each cycle. The HUD works the figures out at each release.

## Sound (`scheduler.js`, `audio.js`)

- Strike times are known in advance (one end: t = m·T_n; both ends: m·T_n/2;
  centre crossing: T_n/4 + m·T_n/2). They are put on the AudioContext clock about
  100 ms ahead by a lookahead scheduler, refilled from the frame loop, and never
  found by watching for turning points frame by frame.
- Speed, pause, and parameter changes cancel the queued strikes that haven't
  started and re-anchor at the current time. The scheduler keeps the pattern time
  up to which every strike has been handed over exactly once, so nothing is
  dropped or doubled. If the display and audio clocks drift more than 50 ms
  apart (a stalled tab, dropped frames), it re-anchors.
- Each chime is four sine partials at free-bar ratios (1, 2.76, 5.40, 8.93), with
  an 8 ms attack and exponential decay (lower notes ring longer). It is panned by
  the pendulum's place in the row. Re-striking a chime fades its previous ring
  over 50 ms. At most 32 voices play at once, and the oldest gives way.
- The output passes through a 9 kHz low-pass, a gentle compressor, the master
  volume, and a soft ceiling that is linear below 0.6 and never exceeds 0.89
  (−1 dBFS).
- Scales: major pentatonic, minor pentatonic, just major, slendro (five equal
  steps of 240 cents) and Dorian. The longest pendulum gets the root. The row
  spans the chosen number of octaves, and with more pendulums than notes,
  neighbours share a note.

## Controls

Pendulum count (8 to 24), k, cycle T (30 to 180 s), amplitude, damping, gravity,
real pendulum, strike mode, scale, root, octaves, volume, mute and camera.
Clicking the scene releases the row and starts the sound.

Keys: `R` re-releases, `M` mutes, `1` three-quarter view, `2` top-down (where
the wave reads best), `3` end-on, and Space pauses.

## Checks

```bash
node --test simulations/phase_chimes/tests/*.test.mjs
```

The tests check that every pendulum returns to θ₀ at t = T within 1e-9; that
one cycle holds exactly Σ(k + n) one-end strikes (870 at the defaults); that
strike windows partition exactly; that RK4 agrees with the closed form at small
angles; how the real row realigns, with and without drag; the pitch mapping; and
that speed changes and pauses neither drop nor double a strike, in both modes.

`tests/listen.html` (served with the rest of the site) renders 20 s around the
realignment offline with the sim's own voices. It reports the peak level, the
loudest RMS, and what is left above 14 kHz (a click detector), and gives each
render as a WAV file.
