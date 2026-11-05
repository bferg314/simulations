import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    periods, lengths, angle, LinearSource, RK4Row, NonlinearSource, strikeRate,
    noteFrequencies, midiToHz, SCALES, G0, AIR_DRAG,
} from '../physics.js';

const DEFAULTS = { count: 15, k: 51, T: 60 };

test('every pendulum returns to θ₀ at t = T', () => {
    for (const { count, k, T } of [DEFAULTS, { count: 24, k: 30, T: 180 }, { count: 8, k: 10, T: 30 }]) {
        const theta0 = 0.3;
        for (const Tn of periods(count, k, T)) {
            assert.ok(Math.abs(angle(theta0, 0, Tn, T) - theta0) < 1e-9);
            assert.ok(Math.abs(angle(theta0, 0, Tn, 2 * T) - theta0) < 1e-9);
        }
    }
});

test('lengths follow L = g (T_n / 2π)² and the longest swings slowest', () => {
    const L = lengths(15, 51, 60);
    assert.ok(Math.abs(L[0] - G0 * (60 / 51 / (2 * Math.PI)) ** 2) < 1e-12);
    for (let n = 1; n < L.length; n++) assert.ok(L[n] < L[n - 1]);
    // Standard demo: about 34 cm down to 21 cm
    assert.ok(L[0] > 0.34 && L[0] < 0.35 && L[14] > 0.21 && L[14] < 0.22);
});

test('one cycle holds exactly Σ(k + n) one-end strikes', () => {
    const { count, k, T } = DEFAULTS;
    const src = new LinearSource({ count, k, T, mode: 'one' });
    const expected = Array.from({ length: count }, (_, n) => k + n).reduce((a, b) => a + b);
    // (0, T]: the release is not a strike, the realignment at T is
    const events = src.eventsBetween(1e-9, T + 1e-9);
    assert.equal(events.length, expected);
    assert.equal(expected, 870);
    // All fifteen strike together at T
    assert.equal(events.filter((e) => Math.abs(e.p - T) < 1e-9).length, count);
    assert.ok(Math.abs(strikeRate(count, k, T, 'one') - 14.5) < 1e-12);
});

test('windows partition the strikes exactly, in every mode', () => {
    const { count, k, T } = DEFAULTS;
    for (const mode of ['one', 'both', 'centre']) {
        const src = new LinearSource({ count, k, T, mode });
        const end = 2 * T + 1e-6;
        const whole = src.eventsBetween(0, end);
        const parts = [];
        let p = 0;
        let seed = 7;
        while (p < end) {
            seed = (seed * 16807) % 2147483647;
            const next = Math.min(end, p + (seed / 2147483647) * 0.2);
            parts.push(...src.eventsBetween(p, next));
            p = next;
        }
        assert.equal(parts.length, whole.length, mode);
        const keys = new Set(parts.map((e) => `${e.n}:${e.m}`));
        assert.equal(keys.size, whole.length, `${mode}: no duplicates`);
        const perCycle = { one: 870, both: 1740, centre: 1740 }[mode];
        assert.equal(whole.length, 2 * perCycle, mode);
    }
});

test('both ends alternate, centre strikes fall at quarter periods', () => {
    const src = new LinearSource({ count: 1, k: 1, T: 4, mode: 'both' });
    assert.deepEqual(src.eventsBetween(0, 4.01).map((e) => [e.p, e.end]), [[2, -1], [4, 1]]);
    const c = new LinearSource({ count: 1, k: 1, T: 4, mode: 'centre' });
    assert.deepEqual(c.eventsBetween(0, 4).map((e) => e.p), [1, 3]);
    assert.equal(new LinearSource({ count: 3, k: 5, T: 10, mode: 'off' }).eventsBetween(0, 100).length, 0);
});

test('lastStrike finds the most recent strike', () => {
    const src = new LinearSource({ count: 1, k: 2, T: 4, mode: 'one' });   // T_0 = 2
    assert.equal(src.lastStrike(0, 1.9), -Infinity);
    assert.equal(src.lastStrike(0, 2.5), 2);
    assert.equal(src.lastStrike(0, 4), 4);
});

test('RK4 matches the closed form at small amplitude', () => {
    const L = lengths(15, 51, 60);
    const P = periods(15, 51, 60);
    const theta0 = 0.01;
    const row = new RK4Row({ lengths: L, theta0, damping: 0.01 });
    row.advanceTo(10);
    for (let n = 0; n < L.length; n++) {
        const exact = angle(theta0, 0.01, P[n], row.t);
        // sin θ ≈ θ − θ³/6 shifts the phase slightly; 1% of θ₀ over 10 s
        assert.ok(Math.abs(row.theta[n] - exact) < 0.01 * theta0, `n=${n}`);
    }
});

test('RK4 strike times match m·T_n at small amplitude, and drift at large', () => {
    const L = lengths(15, 51, 60);
    const P = periods(15, 51, 60);
    const small = new NonlinearSource(new RK4Row({ lengths: L, theta0: 1e-3 }), 'one', 1e-3);
    const ev = small.eventsBetween(0, 60.5);
    assert.equal(ev.length, 870);
    for (const e of ev) assert.ok(Math.abs(e.p - e.m * P[e.n]) < 2e-3, `n=${e.n} m=${e.m}`);

    // At 40° every period stretches by the same factor, so without drag the
    // row still realigns, only late
    const lateAt = (drag) => {
        const src = new NonlinearSource(new RK4Row({ lengths: L, theta0: 0.7, drag }), 'one', 0.7);
        return src.eventsBetween(0, 70).filter((e) => e.m === 51 + e.n).map((e) => e.p);
    };
    const clean = lateAt(0);
    assert.equal(clean.length, 15);
    assert.ok(clean.every((p) => p > 61), 'every pendulum is late');
    assert.ok(Math.max(...clean) - Math.min(...clean) < 2e-3, 'still lined up');
    // Air drag takes amplitude off each pendulum at its own rate: now they
    // miss each other
    const real = lateAt(AIR_DRAG);
    assert.ok(Math.max(...real) - Math.min(...real) > 0.02, 'spread out');
});

test('RK4 strike stream gives the same events however it is windowed', () => {
    const L = lengths(10, 20, 30);
    const a = new NonlinearSource(new RK4Row({ lengths: L, theta0: 0.5 }), 'both', 0.5);
    const b = new NonlinearSource(new RK4Row({ lengths: L, theta0: 0.5 }), 'both', 0.5);
    const whole = a.eventsBetween(0, 20);
    const parts = [];
    for (let p = 0; p < 20; p += 0.137) parts.push(...b.eventsBetween(p, Math.min(20, p + 0.137)));
    assert.deepEqual(parts.map((e) => [e.n, e.m, e.kind]), whole.map((e) => [e.n, e.m, e.kind]));
});

test('pitch: longest pendulum lowest, scales cover the span from the root', () => {
    const f = noteFrequencies(15, { scale: 'major pentatonic', rootHz: midiToHz(60), span: 3 });
    assert.ok(Math.abs(f[0] - 261.6256) < 1e-3);
    for (let n = 1; n < f.length; n++) assert.ok(f[n] > f[n - 1]);
    // 15 pendulums over 3 octaves of a 5-note scale: one note each, A6 on top
    assert.ok(Math.abs(f[14] - midiToHz(93)) < 1e-6);
    for (const scale of Object.keys(SCALES)) {
        const g = noteFrequencies(24, { scale, rootHz: 220, span: 2 });
        assert.equal(g.length, 24);
        for (let n = 1; n < g.length; n++) assert.ok(g[n] >= g[n - 1], scale);
        assert.ok(g[23] <= 880 + 1e-9 && g[0] === 220, scale);
    }
    // Slendro steps are 240 cents
    const s = noteFrequencies(5, { scale: 'slendro', rootHz: 100, span: 1 });
    assert.ok(Math.abs(1200 * Math.log2(s[1] / s[0]) - 240) < 1e-9);
});
