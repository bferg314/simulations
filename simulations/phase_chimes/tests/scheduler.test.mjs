import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LinearSource, NonlinearSource, RK4Row, lengths } from '../physics.js';
import { StrikeScheduler } from '../scheduler.js';

// Drive the scheduler the way the page does: a frame loop on a fake audio
// clock, with speed changes and pauses thrown in, and record which strikes
// end up sounding.
function run({ source, changes, duration = 80, frame = 1 / 60, jitter = 0.004 }) {
    const sounded = new Map();      // key -> audio time
    let nextId = 0;
    const live = new Map();
    const sched = new StrikeScheduler({
        play: (e, time) => { const id = nextId++; live.set(id, { e, time }); return id; },
        cancel: (id) => { assert.ok(live.has(id), 'cancelled twice'); live.delete(id); },
    });
    sched.setSource(source);
    let speed = 1, paused = false, p = 0, now = 0;
    sched.anchor(now, p, speed);
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let ci = 0;
    while (now < duration) {
        now += frame;
        if (!paused) p += frame * speed;
        // Visual pattern time wobbles a little against the audio clock
        const pv = p + (rand() - 0.5) * jitter * speed;
        if (ci < changes.length && now >= changes[ci].at) {
            const c = changes[ci++];
            sched.cancelFuture(now);
            if (c.pause) { paused = true; sched.pause(now); }
            else { paused = false; speed = c.speed ?? speed; sched.anchor(now, pv, speed); }
        }
        sched.fill(now);
    }
    for (const { e, time } of live.values()) {
        const key = `${e.n}:${e.m}`;
        assert.ok(!sounded.has(key), `doubled ${key}`);
        sounded.set(key, time);
    }
    return { sounded, sched, p };
}

const changes = [
    { at: 5.03, speed: 2 }, { at: 9.71, speed: 0.5 }, { at: 12.2, pause: true },
    { at: 14.0, speed: 0.5 }, { at: 20.5, speed: 4 }, { at: 21.01, speed: 1 },
    { at: 21.02, speed: 2 }, { at: 30, pause: true }, { at: 30.5 }, { at: 40, speed: 1 },
];

test('speed changes and pauses neither drop nor double a strike', () => {
    const source = new LinearSource({ count: 15, k: 51, T: 60, mode: 'one' });
    const { sounded, sched } = run({ source, changes });
    const expected = source.eventsBetween(0, sched.schedEnd);
    assert.equal(sounded.size, expected.length);
    for (const e of expected) assert.ok(sounded.has(`${e.n}:${e.m}`), `dropped ${e.n}:${e.m}`);
});

test('the same holds for the real-pendulum stream', () => {
    const L = lengths(15, 51, 60);
    const source = new NonlinearSource(new RK4Row({ lengths: L, theta0: 0.6 }), 'both', 0.6);
    const { sounded, sched } = run({ source, changes, duration: 50 });
    const check = new NonlinearSource(new RK4Row({ lengths: L, theta0: 0.6 }), 'both', 0.6);
    const expected = check.eventsBetween(0, sched.schedEnd);
    assert.equal(sounded.size, expected.length);
    for (const e of expected) assert.ok(sounded.has(`${e.n}:${e.m}`));
});

test('strikes sound in time order on the audio clock, close to their pattern times', () => {
    const source = new LinearSource({ count: 15, k: 51, T: 60, mode: 'one' });
    const { sounded } = run({ source, changes: [], duration: 61 });
    // Speed 1 throughout and anchored at 0: audio time equals pattern time
    for (const e of source.eventsBetween(0, 60.05)) {
        assert.ok(Math.abs(sounded.get(`${e.n}:${e.m}`) - e.p) < 1e-9);
    }
});

test('a long stall skips stale strikes instead of bursting them', () => {
    const source = new LinearSource({ count: 15, k: 51, T: 60, mode: 'one' });
    const played = [];
    const sched = new StrikeScheduler({ play: (e, t) => played.push(t), cancel: () => {} });
    sched.setSource(source);
    sched.anchor(0, 0, 1);
    sched.fill(0);
    // The tab was hidden for 10 s: re-anchor at the visual time
    sched.cancelFuture(10);
    sched.anchor(10, 0.2, 1);   // visuals froze too, so pattern time barely moved
    const before = played.length;
    sched.fill(10);
    // only the next 100 ms worth, all at or after now
    assert.ok(played.length - before < 5);
    assert.ok(played.slice(before).every((t) => t >= 10));
    sched.anchor(20, 30.3, 1);  // pattern time jumped forwards by 30 s
    const n = played.length;
    sched.fill(20);
    assert.ok(played.length - n < 5, 'no burst of stale strikes');
});
