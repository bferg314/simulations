// Run with: node --test simulations/snowflake/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnowModel } from '../model.js';
import { PRESETS } from '../presets.js';

// Offset-row cell (x, y) -> axial (q, r) relative to the seed, and back.
// The seed sits on an even row, so row parity is the parity of dy.
function toAxial(m, x, y) {
    const dx = x - m.cx, dy = y - m.cy;
    return [dx - (dy - (dy & 1)) / 2, dy];
}
function fromAxial(m, q, r) {
    return [q + (r - (r & 1)) / 2 + m.cx, r + m.cy];
}
// Rotate by 60 degrees about the seed: cube (q, r, s) -> (-r, -s, -q)
function rotate60(q, r) {
    const s = -q - r;
    return [-r, -s];
}

function grow(params, steps, radius = 100) {
    const m = new SnowModel({ radius, ...params });
    for (let i = 0; i < steps && !m.done; i++) m.step();
    return m;
}

for (const name of ['fern', 'stellarDendrite', 'sectoredPlate']) {
    test(`${name}: six-fold symmetry after 500 steps`, () => {
        const { alpha, beta, gamma } = PRESETS[name];
        const m = grow({ alpha, beta, gamma }, 500);
        assert.ok(m.iceCount > 1, 'something grew');
        let maxDiff = 0, mismatches = 0, checked = 0;
        for (let y = 0; y < m.height; y++) {
            for (let x = 0; x < m.width; x++) {
                const i = m.index(x, y);
                let [q, r] = toAxial(m, x, y);
                for (let k = 1; k < 6; k++) {
                    [q, r] = rotate60(q, r);
                    const [rx, ry] = fromAxial(m, q, r);
                    if (rx < 0 || ry < 0 || rx >= m.width || ry >= m.height) continue;
                    const j = m.index(rx, ry);
                    checked++;
                    if (m.frozen[i] !== m.frozen[j]) mismatches++;
                    maxDiff = Math.max(maxDiff, Math.abs(m.s[i] - m.s[j]));
                }
            }
        }
        assert.ok(checked > 0);
        assert.equal(mismatches, 0, 'frozen set is identical under every 60 degree rotation');
        // Different summation order at rotated cells gives rounding-level differences only
        assert.ok(maxDiff < 1e-9, `field matches under rotation (max diff ${maxDiff})`);
    });
}

test('plate and fern presets give measurably different fill ratios', () => {
    const plate = grow(PRESETS.plate, 20000);
    const fern = grow(PRESETS.fern, 20000);
    assert.ok(plate.done && fern.done, 'both grew to the boundary');
    const fp = plate.fillRatio(), ff = fern.fillRatio();
    assert.ok(fp > 0.9, `plate fills its hexagon (${fp.toFixed(3)})`);
    assert.ok(ff < 0.3, `fern is sparse (${ff.toFixed(3)})`);
});

test('ice never melts', () => {
    const m = new SnowModel({ radius: 60, ...PRESETS.stellarDendrite });
    let prevIce = m.iceCount;
    for (let i = 0; i < 300; i++) {
        m.step();
        assert.ok(m.iceCount >= prevIce);
        prevIce = m.iceCount;
    }
});

test('setBeta rescales free vapour and keeps the boundary at the new level', () => {
    const m = new SnowModel({ radius: 40, alpha: 1, beta: 0.4, gamma: 0.001 });
    for (let i = 0; i < 50; i++) m.step();
    m.setBeta(0.8);
    m.step();
    // A corner cell is outside the disc, so it is fixed at beta
    assert.equal(m.s[m.index(0, 0)], 0.8);
    assert.equal(m.next[m.index(0, 0)], 0.8);
});
