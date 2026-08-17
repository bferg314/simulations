import { CONFIG } from '../config.js';

export const TYPE_AIR = 0;
export const TYPE_DIRT = 1;
export const TYPE_WATER = 2;

// --- Pheromone decay ---------------------------------------------------
// Fields are decayed lazily: each cell stores a value plus the tick it was
// written, and a read scales it by rate^(now - stamp) via a lookup table.
// That replaces a 240k-float sweep per frame with O(1) per access, and ties
// decay to sim ticks so the speed control no longer alters colony behaviour.
const PHERO_DECAY = 0.9995;
const DECAY_TABLE_SIZE = 16384;

const DECAY = (() => {
    const t = new Float32Array(DECAY_TABLE_SIZE);
    let v = 1;
    for (let i = 0; i < DECAY_TABLE_SIZE; i++) {
        t[i] = v;
        v *= PHERO_DECAY;
    }
    return t;
})();

class Field {
    constructor(len) {
        this.value = new Float32Array(len);
        this.stamp = new Uint32Array(len);
    }
}

export const NAV_UNREACHABLE = 65535;
const NAV_REBUILD = 150;          // ticks between navigation-field rebuilds
const NAV_NX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NAV_NY = [-1, -1, -1, 0, 0, 1, 1, 1];

// Scratch buffers for the water automaton, reused every cell so the inner
// loop allocates nothing.
const CAND_X = new Int16Array(5);
const CAND_Y = new Int16Array(5);

export class World {
    constructor() {
        this.width = CONFIG.worldWidth;
        this.height = CONFIG.worldHeight;
        this.len = this.width * this.height;

        this.grid = new Uint8Array(this.len);
        this.terrainHeight = new Float32Array(this.width);
        this.columnTop = new Int16Array(this.width);
        this.noise = new Int8Array(this.len);

        this.home = new Field(this.len);
        this.foodField = new Field(this.len);

        this.tick = 0;
        this.waterList = [];
        this.raining = false;
        this.rainIntensity = CONFIG.rainIntensity;
        this.repairQueue = [];
        this.plugCells = [];        // storm plug, dug back out once the rain stops

        this.entranceX = Math.floor(this.width / 2);
        this.entranceHalf = 8;      // funnel half-width; its rim is the only
                                    // place ants can cross the ground line
        this.chamberX = Math.floor(this.width / 2);
        this.chamberY = CONFIG.chamberDepth;

        this.generate();
        this.buildNav();
    }

    // --- Geometry ------------------------------------------------------

    idx(x, y) { return (y | 0) * this.width + (x | 0); }

    isValid(x, y) { return x >= 0 && x < this.width && y >= 0 && y < this.height; }

    at(x, y) { return this.isValid(x, y) ? this.grid[this.idx(x, y)] : TYPE_DIRT; }

    isAir(x, y) { return this.at(x, y) === TYPE_AIR; }

    isDirt(x, y) { return this.at(x, y) === TYPE_DIRT; }

    isWater(x, y) { return this.at(x, y) === TYPE_WATER; }

    // Anything an ant cannot walk through.
    isSolid(x, y) { return this.at(x, y) === TYPE_DIRT; }

    set(x, y, type) {
        if (!this.isValid(x, y)) return;
        const cx = x | 0;
        const cy = y | 0;
        const i = cy * this.width + cx;
        const prev = this.grid[i];
        if (type === TYPE_WATER && prev !== TYPE_WATER) this.waterList.push(i);
        this.grid[i] = type;

        // Keep the live ground line in step with digging and dumping.
        if (type === TYPE_DIRT) {
            if (cy < this.columnTop[cx]) this.columnTop[cx] = cy;
        } else if (prev === TYPE_DIRT && cy === this.columnTop[cx]) {
            let ny = cy;
            while (ny < this.height && this.grid[ny * this.width + cx] !== TYPE_DIRT) ny++;
            this.columnTop[cx] = ny;
        }
    }

    // Nominal terrain height, precomputed once so the sine formula is not
    // duplicated between generation and rendering.
    surfaceAt(x) {
        const c = Math.max(0, Math.min(this.width - 1, x | 0));
        return this.terrainHeight[c];
    }

    // The *actual* top of the solid ground in a column, which moves as ants
    // sink a pit or pile up a spoil mound. Testing against the nominal terrain
    // height instead is what left diggers stranded on the funnel rim.
    groundTop(x) {
        const c = Math.max(0, Math.min(this.width - 1, x | 0));
        return this.columnTop[c];
    }

    // First row that the untouched landscape would have filled with soil.
    // Anything at or below this is "inside the ground" — a tunnel, the royal
    // chamber, or the bowl of the entrance funnel — and ants move through it
    // freely. Deriving this from the live ground top instead breaks both ways:
    // a column tunnelled clean through reports the chamber as open sky, and a
    // pit mouth reads as unsupported air that ants can neither enter nor leave.
    skyLine(x) {
        const c = Math.max(0, Math.min(this.width - 1, x | 0));
        return Math.floor(this.terrainHeight[c]);
    }

    // Inclusive: the topmost air cell of a column is where surface ants walk,
    // and it has to read as outdoors or they never reach the spoil mound.
    aboveGround(x, y) { return y <= this.skyLine(x); }

    recomputeColumnTops() {
        for (let x = 0; x < this.width; x++) {
            let y = 0;
            while (y < this.height && this.grid[y * this.width + x] !== TYPE_DIRT) y++;
            this.columnTop[x] = y;
        }
    }

    generate() {
        for (let x = 0; x < this.width; x++) {
            const h = CONFIG.groundLevel + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.07) * 4;
            this.terrainHeight[x] = h;
            for (let y = 0; y < this.height; y++) {
                const i = y * this.width + x;
                this.grid[i] = y < h ? TYPE_AIR : TYPE_DIRT;
                // Static per-cell texture offset. Baked once; recomputing this
                // per frame is what made the soil boil like TV static.
                this.noise[i] = (Math.random() * 15 - 7) | 0;
            }
        }
        this.carveEntrance(this.entranceX);
        this.recomputeColumnTops();
    }

    // A cone-shaped mouth at the surface. A smooth taper matters: each column
    // is one step deeper than its neighbour, so the walls form a continuous
    // ramp that ants can walk down and back up. The original stepped shaft left
    // a sheer 5-cell drop across its whole width with nothing to grip.
    carveEntrance(centerX) {
        const half = this.entranceHalf;
        const maxDepth = 18;
        for (let dx = -half; dx <= half; dx++) {
            const x = (centerX | 0) + dx;
            if (x < 0 || x >= this.width) continue;
            const depth = Math.round(maxDepth * (1 - Math.abs(dx) / half));
            const clearTo = this.terrainHeight[x] + depth;
            for (let y = 0; y < clearTo; y++) this.grid[this.idx(x, y)] = TYPE_AIR;
        }
    }

    // --- Pheromones ----------------------------------------------------

    readIdx(field, i) {
        const age = this.tick - field.stamp[i];
        if (age >= DECAY_TABLE_SIZE) return 0;
        return field.value[i] * DECAY[age];
    }

    read(field, x, y) {
        if (!this.isValid(x, y)) return 0;
        return this.readIdx(field, this.idx(x, y));
    }

    // max(), never +=. Summing saturates the field into a featureless blob;
    // taking the maximum preserves a monotonic gradient back to the source.
    deposit(field, x, y, strength) {
        if (!this.isValid(x, y) || strength < CONFIG.pheroMinDeposit) return;
        const i = this.idx(x, y);
        if (strength <= this.readIdx(field, i)) return;
        field.value[i] = strength;
        field.stamp[i] = this.tick;
    }

    // --- Water ---------------------------------------------------------

    startRain(intensity = CONFIG.rainIntensity) {
        this.raining = true;
        this.rainIntensity = intensity;
    }

    stopRain() { this.raining = false; }

    // Once the weather clears the colony breaks its own door open again. This
    // is guaranteed rather than left to the diggers' repair queue: relying on
    // them to find it meant the nest sometimes stayed sealed for good and
    // starved behind a wall it had built itself.
    reopenPlug() {
        if (this.raining || this.plugCells.length === 0) return;
        for (let n = 0; n < 2 && this.plugCells.length; n++) {
            const c = this.plugCells.pop();
            if (this.at(c.x, c.y) === TYPE_DIRT) this.set(c.x, c.y, TYPE_AIR);
        }
    }

    spawnRain() {
        if (!this.raining) return;
        const drops = Math.max(1, Math.round(this.rainIntensity * 3));
        for (let n = 0; n < drops; n++) {
            const x = (Math.random() * this.width) | 0;
            const y = Math.max(0, this.groundTop(x) - 12);
            if (this.at(x, y) === TYPE_AIR) this.set(x, y, TYPE_WATER);
        }
    }

    flowTo(from, tx, ty) {
        if (!this.isValid(tx, ty)) return -1;
        const t = this.idx(tx, ty);
        if (this.grid[t] !== TYPE_AIR) return -1;
        this.grid[t] = TYPE_WATER;
        this.grid[from] = TYPE_AIR;
        return t;
    }

    updateWater() {
        if (this.waterList.length === 0) return;

        // Bottom rows first, so a falling column resolves in one pass.
        this.waterList.sort((a, b) => b - a);
        const next = [];
        const W = this.width;

        for (let n = 0; n < this.waterList.length; n++) {
            const i = this.waterList[n];
            if (this.grid[i] !== TYPE_WATER) continue; // stale entry

            const y = (i / W) | 0;
            const x = i - y * W;

            // Drains out of the bottom of the world, and evaporates slowly.
            if (y >= this.height - 1 || Math.random() < 0.0025) {
                this.grid[i] = TYPE_AIR;
                continue;
            }

            const leftFirst = Math.random() < 0.5;
            CAND_X[0] = x; CAND_Y[0] = y + 1;
            CAND_X[1] = leftFirst ? x - 1 : x + 1; CAND_Y[1] = y + 1;
            CAND_X[2] = leftFirst ? x + 1 : x - 1; CAND_Y[2] = y + 1;
            CAND_X[3] = leftFirst ? x - 1 : x + 1; CAND_Y[3] = y;
            CAND_X[4] = leftFirst ? x + 1 : x - 1; CAND_Y[4] = y;

            let dest = -1;
            for (let c = 0; c < 5; c++) {
                const t = this.flowTo(i, CAND_X[c], CAND_Y[c]);
                if (t >= 0) { dest = t; break; }
            }

            // Water with nowhere left to run soaks away into the surrounding
            // soil. Without this the galleries never drain: every downpour
            // turned the royal chamber into a permanent sump and drowned the
            // queen, which ended the colony outright.
            if (dest < 0) {
                if (Math.random() < 0.012) {
                    this.grid[i] = TYPE_AIR;
                    continue;
                }
                dest = i;
            }
            next.push(dest);
        }

        this.waterList = next;

        if (Math.random() < CONFIG.collapseChance) this.tryCollapse();
    }

    // Wet tunnels are unstable. Sample a water cell, walk up to the tunnel
    // ceiling, and if the void is tall enough drop the ceiling into it. The
    // filled cell is queued so a digger comes and re-excavates it, which is
    // what gives diggers a standing job rather than a one-off build phase.
    tryCollapse() {
        if (this.waterList.length === 0) return;
        for (let attempt = 0; attempt < 2; attempt++) {
            const i = this.waterList[(Math.random() * this.waterList.length) | 0];
            const y0 = (i / this.width) | 0;
            const x = i - y0 * this.width;

            let y = y0;
            let gap = 0;
            while (y > 0 && this.grid[this.idx(x, y - 1)] !== TYPE_DIRT) {
                y--;
                gap++;
                if (gap > 24) break;
            }
            if (gap < 3 || y <= 0) continue;

            // Ceiling cell at (x, y-1) lets go and lands on the water surface.
            this.set(x, y - 1, TYPE_AIR);
            this.set(x, y, TYPE_DIRT);
            this.repairQueue.push({ x, y });
            if (this.repairQueue.length > 200) this.repairQueue.shift();
        }
    }

    // Total excavated volume below the surface — the "how big is the nest" stat.
    tunnelVolume() {
        let count = 0;
        for (let x = 0; x < this.width; x++) {
            const top = this.terrainHeight[x] | 0;
            for (let y = top; y < this.height; y++) {
                if (this.grid[y * this.width + x] === TYPE_AIR) count++;
            }
        }
        return count;
    }

    // --- Navigation ----------------------------------------------------
    // Two breadth-first distance fields over the open cells: one to the outside
    // air, one to the royal chamber. Ants walk downhill on whichever they need.
    //
    // Greedy step-toward navigation was tried throughout and does not survive a
    // branching nest: a laden ant in a gallery has solid rock above it, every
    // move that reduces its straight-line distance fails, and it shuffles on
    // the spot until it happens to stumble into the shaft. That single flaw
    // accounted for most of the colony's lost work.
    buildNav() {
        const len = this.len;
        const W = this.width;
        if (!this.distOut) {
            this.distOut = new Uint16Array(len);
            this.distNest = new Uint16Array(len);
            this.navQueue = new Int32Array(len);
        }

        const bfs = (field, seed) => {
            field.fill(NAV_UNREACHABLE);
            const q = this.navQueue;
            let head = 0;
            let tail = 0;
            for (const i of seed) {
                if (field[i] !== 0) { field[i] = 0; q[tail++] = i; }
            }
            while (head < tail) {
                const i = q[head++];
                const d = field[i] + 1;
                const y = (i / W) | 0;
                const x = i - y * W;
                for (let n = 0; n < 8; n++) {
                    const tx = x + NAV_NX[n];
                    const ty = y + NAV_NY[n];
                    if (tx < 0 || tx >= W || ty < 0 || ty >= this.height) continue;
                    const j = ty * W + tx;
                    if (this.grid[j] === TYPE_DIRT || field[j] <= d) continue;
                    field[j] = d;
                    q[tail++] = j;
                }
            }
        };

        // Out: every open cell at or above the ground line is already outside.
        const outSeeds = [];
        for (let x = 0; x < W; x++) {
            const top = this.skyLine(x);
            for (let y = Math.max(0, top - 3); y <= top; y++) {
                const i = y * W + x;
                if (this.grid[i] !== TYPE_DIRT) outSeeds.push(i);
            }
        }
        bfs(this.distOut, outSeeds);

        const nestSeeds = [];
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = this.chamberX + dx;
                const y = this.chamberY + dy;
                if (!this.isValid(x, y)) continue;
                const i = y * W + x;
                if (this.grid[i] !== TYPE_DIRT) nestSeeds.push(i);
            }
        }
        bfs(this.distNest, nestSeeds);
    }

    update() {
        this.tick++;
        // Cheap enough to refresh often; the nest only changes a cell at a time.
        if (this.tick % NAV_REBUILD === 1) this.buildNav();
        this.spawnRain();
        this.reopenPlug();
        this.updateWater();
    }
}
