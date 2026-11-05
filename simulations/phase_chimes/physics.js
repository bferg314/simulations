// Phase Chimes: the maths, with no DOM so it runs under `node --test`.
//
// Pendulum n (n = 0 is the longest) makes exactly k + n full swings in one
// cycle of T seconds, so its period is T_n = T / (k + n) and its length is
// L_n = g (T_n / 2π)². Released together, they fan out into travelling waves
// and line up again at t = T.
//
// Times here are "pattern time" p: seconds since release at the reference
// gravity G0. Changing gravity leaves the lengths alone and only changes how
// fast pattern time runs (rate √(g / G0)), so the whole pattern speeds up or
// slows down without a jump. The "real pendulum" mode integrates the full
// nonlinear equation instead, in real seconds at the actual gravity.

export const G0 = 9.81;

export function swingCounts(count, k) {
    return Array.from({ length: count }, (_, n) => k + n);
}

// Full periods in pattern seconds
export function periods(count, k, T) {
    return swingCounts(count, k).map((swings) => T / swings);
}

// Lengths in metres that give those periods at gravity g
export function lengths(count, k, T, g = G0) {
    return periods(count, k, T).map((Tn) => g * (Tn / (2 * Math.PI)) ** 2);
}

// How fast pattern time runs at gravity g (lengths fixed at their G0 values)
export function patternRate(g) {
    return Math.sqrt(g / G0);
}

// Closed form: exact for the linearised pendulum, and never drifts
export function angle(theta0, damping, Tn, p) {
    return theta0 * Math.exp(-damping * p) * Math.cos((2 * Math.PI * p) / Tn);
}

// --- Strike times -------------------------------------------------------
//
// Strike modes:
//   'one'    the bob hits a chime at the +θ end: p = m·T_n, m ≥ 1
//   'both'   chimes at both ends:              p = m·T_n/2, m ≥ 1 (odd m is the −θ end)
//   'centre' a chime at the bottom:            p = (m + ½)·T_n/2, m ≥ 0
//   'off'    silent
// The release itself (p = 0, bob at rest at +θ) is not a strike.

export const STRIKE_MODES = ['one', 'both', 'centre', 'off'];

function strikeGrid(mode, Tn) {
    switch (mode) {
        case 'one': return { step: Tn, phase: 0, first: 1 };
        case 'both': return { step: Tn / 2, phase: 0, first: 1 };
        case 'centre': return { step: Tn / 2, phase: 0.5, first: 0 };
        default: return null;
    }
}

// Strikes per pattern second, summed over the row
export function strikeRate(count, k, T, mode) {
    const per = { one: 1, both: 2, centre: 2, off: 0 }[mode] ?? 0;
    return per * swingCounts(count, k).reduce((a, b) => a + b, 0) / T;
}

// Every strike with p in [p0, p1), sorted by time. Each strike is identified
// by (n, m), and its time is always computed by the same expression, so
// consecutive half-open windows partition the strikes exactly.
export class LinearSource {
    constructor({ count, k, T, mode, theta0 = 0.2, damping = 0 }) {
        this.periods = periods(count, k, T);
        this.mode = mode;
        this.theta0 = theta0;
        this.damping = damping;
        this.grids = this.periods.map((Tn) => strikeGrid(mode, Tn));
    }

    eventsBetween(p0, p1) {
        const out = [];
        if (!(p1 > p0)) return out;
        this.grids.forEach((grid, n) => {
            if (!grid) return;
            const at = (m) => (m + grid.phase) * grid.step;
            let m = Math.max(grid.first, Math.ceil(p0 / grid.step - grid.phase) - 1);
            while (at(m) < p0) m++;
            for (let p = at(m); p < p1; p = at(++m)) {
                out.push({
                    p, n, m,
                    end: this.mode === 'centre' ? 0 : (this.mode === 'both' && m % 2 === 1 ? -1 : 1),
                    amp: Math.exp(-this.damping * p),
                });
            }
        });
        return out.sort((a, b) => a.p - b.p || a.n - b.n);
    }

    // Pattern time of the most recent strike of pendulum n at or before p
    lastStrike(n, p) {
        const grid = this.grids[n];
        if (!grid) return -Infinity;
        const m = Math.floor(p / grid.step - grid.phase);
        return m < grid.first ? -Infinity : (m + grid.phase) * grid.step;
    }
}

// --- The real pendulum --------------------------------------------------
//
// θ'' = −(g/L) sin θ − 2c θ' − κ L θ'|θ'|, integrated with RK4 on a fixed
// step h. The last term is air drag on the bob, which grows with the square
// of its speed (κ = ρ C_d A / 2m). For small angles and no drag this matches
// the closed form, whose envelope is e^(−ct).
//
// Why a real row never quite realigns: big swings take longer (the period
// grows with amplitude), and drag takes amplitude off each pendulum at its own
// rate, because the bobs move at different speeds. With equal amplitudes and
// no drag every period would stretch by the same factor and the row would
// still line up, only late; the tests check both.
//
// Strikes are found where ω changes sign (the ends) or θ does (the centre),
// with the time interpolated within the step.

// A 3 cm steel ball (110 g) in air: 1.2 × 0.47 × π(0.015)² / (2 × 0.11)
export const AIR_DRAG = 1.2 * 0.47 * Math.PI * 0.015 ** 2 / (2 * 0.11);

export class RK4Row {
    constructor({ lengths: L, g = G0, theta0 = 0.2, damping = 0, drag = 0, h = 1 / 240 }) {
        this.L = [...L];
        this.w2 = L.map((len) => g / len);
        this.damping = damping;
        this.drag = drag;
        this.h = h;
        this.t = 0;
        this.theta = new Float64Array(L.length).fill(theta0);
        this.omega = new Float64Array(L.length);
        this.steps = 0;
    }

    clone() {
        const c = Object.create(RK4Row.prototype);
        Object.assign(c, this, { L: [...this.L], w2: [...this.w2], theta: this.theta.slice(), omega: this.omega.slice() });
        return c;
    }

    accel(i, th, om) {
        return -this.w2[i] * Math.sin(th) - 2 * this.damping * om - this.drag * this.L[i] * om * Math.abs(om);
    }

    // Step until the next step would pass t. onEvent(n, time, kind, theta)
    // with kind '+', '-' (ends) or '0' (centre).
    advanceTo(t, onEvent) {
        const h = this.h;
        while (this.t + h <= t + 1e-12) {
            for (let i = 0; i < this.theta.length; i++) {
                const th = this.theta[i], om = this.omega[i];
                const k1t = om, k1o = this.accel(i, th, om);
                const k2t = om + 0.5 * h * k1o, k2o = this.accel(i, th + 0.5 * h * k1t, k2t);
                const k3t = om + 0.5 * h * k2o, k3o = this.accel(i, th + 0.5 * h * k2t, k3t);
                const k4t = om + h * k3o, k4o = this.accel(i, th + h * k3t, k4t);
                const nth = th + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
                const nom = om + (h / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
                if (onEvent) {
                    if (om > 0 && nom <= 0) onEvent(i, this.t + h * om / (om - nom), '+', nth);
                    else if (om < 0 && nom >= 0) onEvent(i, this.t + h * om / (om - nom), '-', nth);
                    if ((th > 0 && nth <= 0) || (th < 0 && nth >= 0)) {
                        onEvent(i, this.t + h * th / (th - nth), '0', nom);
                    }
                }
                this.theta[i] = nth;
                this.omega[i] = nom;
            }
            this.steps++;
            this.t = this.steps * h;
        }
    }
}

// Strike stream from an RK4 row running ahead of the display. Events are
// buffered so that a reschedule can ask again for a window it already saw.
export class NonlinearSource {
    constructor(row, mode, theta0) {
        this.row = row;
        this.mode = mode;
        this.theta0 = theta0;
        this.buffer = [];
        this.counters = new Map();   // per-pendulum strike index, for identity
    }

    eventsBetween(p0, p1) {
        if (this.mode !== 'off') {
            this.row.advanceTo(p1 + this.row.h, (n, p, kind, val) => {
                const wanted = this.mode === 'one' ? kind === '+'
                    : this.mode === 'both' ? kind !== '0' : kind === '0';
                if (!wanted) return;
                const m = (this.counters.get(n) ?? 0) + 1;
                this.counters.set(n, m);
                const amp = kind === '0' ? 1 : Math.min(1, Math.abs(val) / this.theta0);
                this.buffer.push({ p, n, m, kind, end: kind === '-' ? -1 : kind === '+' ? 1 : 0, amp });
            });
            this.buffer.sort((a, b) => a.p - b.p || a.n - b.n);
        }
        const cut = this.buffer.findIndex((e) => e.p >= p0 - 2);
        if (cut > 0) this.buffer.splice(0, cut);
        return this.buffer.filter((e) => e.p >= p0 && e.p < p1);
    }
}

// --- Pitch ----------------------------------------------------------------

// Scale steps in cents within one octave
export const SCALES = {
    'major pentatonic': [0, 200, 400, 700, 900],
    'minor pentatonic': [0, 300, 500, 700, 1000],
    'just major': [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8].map((r) => 1200 * Math.log2(r)),
    'slendro': [0, 240, 480, 720, 960],
    'dorian': [0, 200, 300, 500, 700, 900, 1000],
};

export function midiToHz(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
}

// One frequency per pendulum, longest (n = 0) lowest. The row covers `span`
// octaves of the scale from the root; with more pendulums than notes in the
// span, neighbours share a note.
export function noteFrequencies(count, { scale = 'major pentatonic', rootHz = midiToHz(60), span = 3 } = {}) {
    const steps = SCALES[scale] ?? SCALES['major pentatonic'];
    const N = steps.length;
    const D = span * N;
    return Array.from({ length: count }, (_, n) => {
        const d = Math.min(D, Math.floor((n * (D + 1)) / count));
        const octave = Math.floor(d / N);
        return rootHz * 2 ** (octave + steps[d % N] / 1200);
    });
}

// Struck free bar: partial ratios of the first four bending modes
export const BAR_PARTIALS = [1, 2.756, 5.404, 8.933];

export function formatClock(seconds) {
    const s = Math.max(0, Math.floor(seconds + 1e-6));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
