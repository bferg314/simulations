import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlimeModel, mulberry32, DEFAULTS } from '../model.js';
import { applyPreset, tokyoMap, TOKYO_CITIES } from '../presets.js';

const W = 200, H = 120;

function twoFoodWorld(seed, params = {}) {
    const m = new SlimeModel({ width: W, height: H, seed, params });
    const a = [50, 60], b = [150, 60];
    m.addFood(a[0], a[1], 3);
    m.addFood(b[0], b[1], 3);
    // Inoculate 3,000 agents (12.5% of the lattice, inside Jones's 3-15%)
    // as a blob between them, packed at 40% as the presets do.
    const n = 3000;
    m.spawnBlob(n, 100, 60, Math.sqrt(n / (0.4 * Math.PI)));
    return { m, a, b };
}

// For each column between the two foods (skipping the food discs), the
// strongest trail within +-5 rows of row `yc`. The band allows for a vein that
// wanders a little off the straight line.
function band(m, yc, x0, x1) {
    const vals = [];
    for (let x = x0; x <= x1; x++) {
        let best = -Infinity;
        for (let dy = -5; dy <= 5; dy++) best = Math.max(best, m.trail[(yc + dy) * m.width + x]);
        vals.push(best);
    }
    return { mean: vals.reduce((s, v) => s + v, 0) / vals.length, min: Math.min(...vals) };
}

function meanTrail(m) {
    let s = 0;
    for (const v of m.trail) s += Math.max(0, v);
    return s / m.trail.length;
}

test('the RNG is deterministic for a seed', () => {
    const r1 = mulberry32(99), r2 = mulberry32(99);
    for (let i = 0; i < 100; i++) assert.equal(r1(), r2());
    const r3 = mulberry32(100);
    assert.notEqual(mulberry32(99)(), r3());
});

test('defaults match Jones (2010) Table 1', () => {
    assert.equal(DEFAULTS.sensorAngle, 22.5);
    assert.equal(DEFAULTS.rotationAngle, 45);
    assert.equal(DEFAULTS.sensorOffset, 9);
    assert.equal(DEFAULTS.stepSize, 1);
    assert.equal(DEFAULTS.deposit, 5);
    assert.equal(DEFAULTS.decay, 0.1);
});

test('same seed gives the same run', () => {
    const r1 = twoFoodWorld(5).m, r2 = twoFoodWorld(5).m;
    for (let i = 0; i < 50; i++) { r1.step(); r2.step(); }
    assert.deepEqual(r1.trail, r2.trail);
    assert.deepEqual(r1.x, r2.x);
});

test('two food sources get connected within 2,000 steps (default parameters)', () => {
    const { m, a, b } = twoFoodWorld(1);
    for (let i = 0; i < 2000; i++) m.step();
    const line = band(m, a[1], a[0] + 6, b[0] - 6);
    const bg = meanTrail(m);
    console.log(`# defaults: line band mean ${line.mean.toFixed(2)}, weakest column ${line.min.toFixed(2)}, lattice mean ${bg.toFixed(2)}`);
    assert.ok(line.mean > 3 * bg, `line ${line.mean} should be well above background ${bg}`);
    // Continuous: no column along the way falls back to background
    assert.ok(line.min > 1.5 * bg, `connection has a gap (weakest ${line.min}, background ${bg})`);
});

test('with SA = RA = 45 deg the network condenses onto the link (Jones 2010 Fig. 18 behaviour)', () => {
    const { m, a, b } = twoFoodWorld(1, { sensorAngle: 45 });
    for (let i = 0; i < 2000; i++) m.step();
    const line = band(m, a[1], a[0] + 6, b[0] - 6);
    const above = band(m, a[1] - 35, a[0] + 6, b[0] - 6);
    const below = band(m, a[1] + 35, a[0] + 6, b[0] - 6);
    console.log(`# SA 45: line ${line.mean.toFixed(2)} (weakest ${line.min.toFixed(2)}), control bands ${above.mean.toFixed(2)} / ${below.mean.toFixed(2)}`);
    assert.ok(line.min > 1.5, 'link should be continuous');
    assert.ok(line.mean > 5 * Math.max(above.mean, below.mean, 0.2), 'trail should concentrate on the link');
});

test('with exclusion, no two agents share a cell after stepping', () => {
    const m = new SlimeModel({ width: 80, height: 60, seed: 3 });
    m.spawnBlob(800, 40, 30, 25);
    for (let i = 0; i < 200; i++) m.step();
    const seen = new Set();
    let dupes = 0;
    for (let i = 0; i < m.count; i++) {
        const c = (m.y[i] | 0) * m.width + (m.x[i] | 0);
        if (seen.has(c)) dupes++;
        seen.add(c);
    }
    assert.equal(dupes, 0);
});

test('agents never enter walls and trail is zero on walls', () => {
    const m = new SlimeModel({ width: 120, height: 120, seed: 4 });
    applyPreset(m, 'dish');
    for (let i = 0; i < 300; i++) m.step();
    for (let i = 0; i < m.count; i++) {
        assert.equal(m.wall[(m.y[i] | 0) * m.width + (m.x[i] | 0)], 0);
    }
    for (let c = 0; c < m.wall.length; c++) if (m.wall[c]) assert.equal(m.trail[c], 0);
});

test('light repels: trail is negative on lit cells and agents avoid them', () => {
    const m = new SlimeModel({ width: 120, height: 80, seed: 6 });
    m.addLight(60, 40, 12);
    m.spawnBlob(2000, 60, 40, 50);
    for (let i = 0; i < 600; i++) m.step();
    for (const c of m.lightCells) assert.ok(m.trail[c] < 0);
    let inside = 0;
    for (let i = 0; i < m.count; i++) if (Math.hypot(m.x[i] - 60, m.y[i] - 40) < 10) inside++;
    // Area fraction of the lit disc is ~5%; agents should be far below that.
    assert.ok(inside / m.count < 0.01, `${inside} of ${m.count} agents inside the light`);
});

test('food and lights can be removed', () => {
    const m = new SlimeModel({ width: 50, height: 50, seed: 1 });
    m.addFood(10, 10);
    m.addLight(40, 40);
    assert.ok(m.foodCells.length > 0);
    assert.ok(m.removeNear(11, 10));
    assert.equal(m.foodCells.length, 0);
    assert.ok(m.removeNear(38, 41));
    assert.equal(m.lightCells.length, 0);
    assert.equal(m.removeNear(25, 25, 3), null);
});

test('resize keeps existing agents and adds new ones', () => {
    const m = new SlimeModel({ width: 60, height: 60, seed: 2 });
    m.spawnBlob(100, 30, 30, 10);
    const x0 = m.x[0];
    m.resize(250);
    assert.equal(m.count, 250);
    assert.equal(m.x[0], x0);
    m.resize(50);
    assert.equal(m.count, 50);
});

test('Tokyo preset: 36 cities, all on land, inoculated at Tokyo', () => {
    assert.equal(TOKYO_CITIES.length, 36);
    const map = tokyoMap(480, 270);
    for (const [name, lon, lat] of TOKYO_CITIES) {
        const [x, y] = map.project(lon, lat);
        assert.equal(map.wall[(y | 0) * 480 + (x | 0)], 0, `${name} is in the sea`);
    }
    const m = new SlimeModel({ width: 480, height: 270, seed: 1 });
    const n = applyPreset(m, 'tokyo');
    assert.equal(m.foods.length, 36);
    assert.ok(n > 1000);
});
