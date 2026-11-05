// Physarum agent model after Jones (2010), Artificial Life 16(2):127-153.
//
// No DOM in here, so the same code runs in the page and under `node --test`.
//
// The world is a grid of cells. Agents keep a floating-point position and
// heading. Each step (one "scheduler step" in the paper):
//   1. Motor stage: every agent tries to move SS cells forward. If the target is
//      a wall (or, with exclusion on, already holds an agent) it stays put and
//      picks a random new heading; otherwise it moves and deposits depT.
//   2. Sensory stage: every agent samples the trail at three sensors SO cells
//      ahead (front, front-left and front-right, SA either side) and turns by RA
//      toward the strongest reading. If front is strongest it keeps going; if
//      front is weakest it turns left or right at random.
//   3. The trail diffuses through a 3x3 mean filter and decays by decayT.
//   4. Food cells project chemoattractant into the trail, light cells are made
//      negative (Physarum avoids light), and wall cells absorb.

export const DEFAULTS = Object.freeze({
    sensorAngle: 22.5,   // SA, degrees (Jones 2010 Table 1: 22.5 or 45)
    rotationAngle: 45,   // RA, degrees (Table 1: 45)
    sensorOffset: 9,     // SO, cells (Table 1: 9 pixels)
    stepSize: 1,         // SS, cells per step (Table 1: 1)
    deposit: 5,          // depT, per successful move (Table 1: 5)
    decay: 0.1,          // decayT, fraction lost per step after diffusion (Table 1: 0.1)
    foodStrength: 25,    // added per food cell per step: wProj 0.1 x grey level 255 (Table 1 gives wProj 0.01-0.1; see README)
    lightStrength: 10,   // light cells are held at -lightStrength
    exclusion: true,     // one agent per cell (the paper: "if the next site is not occupied")
});

// Small, fast, seedable PRNG. Returns floats in [0, 1).
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const TRIG_BITS = 12;
const TRIG_SIZE = 1 << TRIG_BITS;
const TRIG_MASK = TRIG_SIZE - 1;
const TAU = Math.PI * 2;
const COS = new Float32Array(TRIG_SIZE);
const SIN = new Float32Array(TRIG_SIZE);
for (let i = 0; i < TRIG_SIZE; i++) {
    COS[i] = Math.cos((i / TRIG_SIZE) * TAU);
    SIN[i] = Math.sin((i / TRIG_SIZE) * TAU);
}
const RAD_TO_IDX = TRIG_SIZE / TAU;

export class SlimeModel {
    constructor({ width, height, seed = 1, params = {} }) {
        this.width = width;
        this.height = height;
        this.params = { ...DEFAULTS, ...params };
        this.rng = mulberry32(seed);

        const n = width * height;
        this.trail = new Float32Array(n);
        this.scratch = new Float32Array(n);
        this.wall = new Uint8Array(n);       // 1 = impassable, absorbs trail
        this.light = new Uint8Array(n);      // 1 = illuminated (repellent)
        this.foodMask = new Uint8Array(n);   // 1 = food cell
        this.occupied = new Uint8Array(n);   // agent count per cell, capped (exclusion mode only)

        this.foods = [];    // { x, y, r } in cells
        this.lights = [];   // { x, y, r } in cells
        this.foodCells = new Int32Array(0);
        this.lightCells = new Int32Array(0);

        this.count = 0;
        this.x = new Float32Array(0);
        this.y = new Float32Array(0);
        this.heading = new Float32Array(0);
        this.steps = 0;
    }

    // --- Agents -----------------------------------------------------------

    // Place `count` agents uniformly in a disc (or anywhere habitable when
    // radius is Infinity). Positions that land on a wall are retried.
    spawnBlob(count, cx, cy, radius) {
        const { width: W, height: H, rng } = this;
        this.count = count;
        this.x = new Float32Array(count);
        this.y = new Float32Array(count);
        this.heading = new Float32Array(count);
        this.occupied.fill(0);
        const r = Math.min(radius, Math.hypot(W, H));
        for (let i = 0; i < count; i++) {
            let px = cx, py = cy;
            for (let tries = 0; tries < 50; tries++) {
                const a = rng() * TAU;
                const d = Math.sqrt(rng()) * r;
                px = cx + Math.cos(a) * d;
                py = cy + Math.sin(a) * d;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                const c = (py | 0) * W + (px | 0);
                if (this.wall[c]) continue;
                if (this.params.exclusion && this.occupied[c]) continue;
                break;
            }
            px = Math.min(W - 1e-3, Math.max(0, px));
            py = Math.min(H - 1e-3, Math.max(0, py));
            this.x[i] = px;
            this.y[i] = py;
            this.heading[i] = rng() * TAU;
            const c = (py | 0) * W + (px | 0);
            if (this.occupied[c] < 255) this.occupied[c]++;
        }
    }

    // Change the population without restarting: drop agents from the end, or
    // clone random existing agents (so new ones appear inside the mould).
    resize(count) {
        if (count === this.count) return;
        const x = new Float32Array(count);
        const y = new Float32Array(count);
        const h = new Float32Array(count);
        const keep = Math.min(count, this.count);
        x.set(this.x.subarray(0, keep));
        y.set(this.y.subarray(0, keep));
        h.set(this.heading.subarray(0, keep));
        for (let i = keep; i < count; i++) {
            if (this.count > 0) {
                const j = (this.rng() * this.count) | 0;
                x[i] = this.x[j];
                y[i] = this.y[j];
            } else {
                x[i] = this.width / 2;
                y[i] = this.height / 2;
            }
            h[i] = this.rng() * TAU;
        }
        this.x = x; this.y = y; this.heading = h; this.count = count;
        this.rebuildOccupancy();
    }

    rebuildOccupancy() {
        const { width: W, occupied } = this;
        occupied.fill(0);
        for (let i = 0; i < this.count; i++) {
            const c = (this.y[i] | 0) * W + (this.x[i] | 0);
            if (occupied[c] < 255) occupied[c]++;
        }
    }

    // --- Stimuli ----------------------------------------------------------

    addFood(x, y, r = 3) { this.foods.push({ x, y, r }); this.rebuildStimuli(); }
    addLight(x, y, r = 14) { this.lights.push({ x, y, r }); this.rebuildStimuli(); }

    // Remove the food or light nearest (x, y) within `reach` cells. Returns
    // what was removed, or null.
    removeNear(x, y, reach = 8) {
        let best = null, bestD = Infinity, list = null;
        for (const [arr, extra] of [[this.foods, 0], [this.lights, 1]]) {
            for (const s of arr) {
                const d = Math.hypot(s.x - x, s.y - y) - (extra ? s.r * 0.6 : 0);
                if (d < bestD) { bestD = d; best = s; list = arr; }
            }
        }
        if (!best || bestD > reach) return null;
        list.splice(list.indexOf(best), 1);
        this.rebuildStimuli();
        return best;
    }

    clearStimuli() { this.foods = []; this.lights = []; this.rebuildStimuli(); }

    // Rasterise foods and lights into masks plus flat index lists, so the
    // per-step work touches only the cells that matter.
    rebuildStimuli() {
        const { width: W, height: H } = this;
        const rasterise = (items, mask) => {
            mask.fill(0);
            const cells = [];
            for (const s of items) {
                const r = s.r;
                const x0 = Math.max(0, Math.floor(s.x - r)), x1 = Math.min(W - 1, Math.ceil(s.x + r));
                const y0 = Math.max(0, Math.floor(s.y - r)), y1 = Math.min(H - 1, Math.ceil(s.y + r));
                for (let yy = y0; yy <= y1; yy++) {
                    for (let xx = x0; xx <= x1; xx++) {
                        const dx = xx + 0.5 - s.x, dy = yy + 0.5 - s.y;
                        if (dx * dx + dy * dy > r * r) continue;
                        const c = yy * W + xx;
                        if (this.wall[c] || mask[c]) continue;
                        mask[c] = 1;
                        cells.push(c);
                    }
                }
            }
            return Int32Array.from(cells);
        };
        this.foodCells = rasterise(this.foods, this.foodMask);
        this.lightCells = rasterise(this.lights, this.light);
        // Area lights (e.g. the sea in a preset) set directly on this.light
        // survive: they are re-added from areaLight.
        if (this.areaLight) {
            const extra = [];
            for (let c = 0; c < this.areaLight.length; c++) {
                if (this.areaLight[c] && !this.light[c] && !this.wall[c]) { this.light[c] = 1; extra.push(c); }
            }
            if (extra.length) {
                const merged = new Int32Array(this.lightCells.length + extra.length);
                merged.set(this.lightCells);
                merged.set(extra, this.lightCells.length);
                this.lightCells = merged;
            }
        }
    }

    // --- Step -------------------------------------------------------------

    step() {
        const { width: W, height: H, trail, wall, occupied, rng } = this;
        const p = this.params;
        const n = this.count;
        const xs = this.x, ys = this.y, hs = this.heading;
        const SS = p.stepSize, dep = p.deposit;
        const SO = p.sensorOffset;
        const SA = p.sensorAngle * Math.PI / 180;
        const RA = p.rotationAngle * Math.PI / 180;
        const saIdx = Math.round(SA * RAD_TO_IDX);
        const excl = p.exclusion;

        // Agents are visited from a random start with a stride coprime to n,
        // a cheap stand-in for the paper's random update order. It only
        // matters when exclusion is on, where order decides who gets a cell.
        let stride = 1, start = 0;
        if (n > 1) {
            start = (rng() * n) | 0;
            stride = STRIDES[(rng() * STRIDES.length) | 0];
            while (gcd(stride, n) !== 1) stride++;
            stride %= n;
            if (stride === 0) stride = 1;
        }

        // Motor stage
        let k = start;
        for (let m = 0; m < n; m++) {
            const h = hs[k];
            const ti = ((h * RAD_TO_IDX) | 0) & TRIG_MASK;
            const nx = xs[k] + COS[ti] * SS;
            const ny = ys[k] + SIN[ti] * SS;
            let ok = nx >= 0 && ny >= 0 && nx < W && ny < H;
            let nc = 0;
            if (ok) {
                nc = (ny | 0) * W + (nx | 0);
                if (wall[nc]) ok = false;
            }
            const oc = (ys[k] | 0) * W + (xs[k] | 0);
            if (ok && excl && nc !== oc && occupied[nc]) ok = false;
            if (ok) {
                if (excl) {
                    if (occupied[oc] > 0) occupied[oc]--;
                    if (occupied[nc] < 255) occupied[nc]++;
                }
                xs[k] = nx;
                ys[k] = ny;
                trail[nc] += dep;
            } else {
                hs[k] = rng() * TAU;
            }
            k += stride; if (k >= n) k -= n;
        }

        // Sensory stage (sensor reads inlined: this loop is the hot path)
        const OUT = -1e9;
        for (let i = 0; i < n; i++) {
            const x = xs[i], y = ys[i];
            let h = hs[i];
            const hi = ((h * RAD_TO_IDX) | 0) & TRIG_MASK;
            const li = (hi - saIdx) & TRIG_MASK;
            const ri = (hi + saIdx) & TRIG_MASK;
            let sx = x + COS[hi] * SO, sy = y + SIN[hi] * SO;
            const F = (sx < 0 || sy < 0 || sx >= W || sy >= H) ? OUT : trail[(sy | 0) * W + (sx | 0)];
            sx = x + COS[li] * SO; sy = y + SIN[li] * SO;
            const FL = (sx < 0 || sy < 0 || sx >= W || sy >= H) ? OUT : trail[(sy | 0) * W + (sx | 0)];
            sx = x + COS[ri] * SO; sy = y + SIN[ri] * SO;
            const FR = (sx < 0 || sy < 0 || sx >= W || sy >= H) ? OUT : trail[(sy | 0) * W + (sx | 0)];
            if (F > FL && F > FR) {
                // keep heading
            } else if (F < FL && F < FR) {
                h += rng() < 0.5 ? -RA : RA;
            } else if (FL < FR) {
                h += RA;
            } else if (FR < FL) {
                h -= RA;
            }
            if (h < 0) h += TAU; else if (h >= TAU) h -= TAU;
            hs[i] = h;
        }

        this.diffuse();
        this.steps++;
    }

    // 3x3 mean filter (separable box blur, edges clamped), then decay, then
    // stimuli and walls.
    diffuse() {
        const { width: W, height: H, trail, scratch } = this;
        const keep = (1 - this.params.decay) / 9;

        // Horizontal sums into scratch
        for (let y = 0; y < H; y++) {
            const row = y * W;
            let a = trail[row], b = trail[row], c = trail[row + (W > 1 ? 1 : 0)];
            for (let x = 0; x < W; x++) {
                scratch[row + x] = a + b + c;
                a = b; b = c;
                c = trail[row + (x + 2 < W ? x + 2 : W - 1)];
            }
        }
        // Vertical sums back into trail, row by row so memory is read in order
        for (let y = 0; y < H; y++) {
            const up = (y > 0 ? y - 1 : 0) * W;
            const mid = y * W;
            const dn = (y + 1 < H ? y + 1 : H - 1) * W;
            for (let x = 0; x < W; x++) {
                trail[mid + x] = (scratch[up + x] + scratch[mid + x] + scratch[dn + x]) * keep;
            }
        }

        const food = this.params.foodStrength;
        for (let i = 0, fc = this.foodCells; i < fc.length; i++) trail[fc[i]] += food;
        const neg = -this.params.lightStrength;
        for (let i = 0, lc = this.lightCells; i < lc.length; i++) trail[lc[i]] = neg;
        if (this.wallCells) for (let i = 0, wc = this.wallCells; i < wc.length; i++) trail[wc[i]] = 0;
    }

    // Call after editing `wall` directly.
    setWalls(mask) {
        this.wall.set(mask);
        const cells = [];
        for (let c = 0; c < mask.length; c++) if (mask[c]) cells.push(c);
        this.wallCells = Int32Array.from(cells);
        this.rebuildStimuli();
    }

    setAreaLight(mask) {
        this.areaLight = mask;
        this.rebuildStimuli();
    }

    // Mean trail along the segment a -> b, sampled every cell, ignoring the
    // `skip` cells nearest each end (so food sources themselves don't count).
    lineDensity(ax, ay, bx, by, skip = 0) {
        const len = Math.hypot(bx - ax, by - ay);
        let sum = 0, n = 0;
        for (let t = skip; t <= len - skip; t++) {
            const x = ax + (bx - ax) * (t / len);
            const y = ay + (by - ay) * (t / len);
            sum += this.trail[(y | 0) * this.width + (x | 0)];
            n++;
        }
        return n ? sum / n : 0;
    }
}

const STRIDES = [7919, 104729, 15485863, 2750159, 611953, 1299709];
function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
