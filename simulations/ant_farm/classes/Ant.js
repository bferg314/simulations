import { CONFIG, between } from '../config.js';
import { TYPE_AIR, TYPE_WATER, NAV_UNREACHABLE } from './World.js';

// Cargo is mutually exclusive. In the old build an ant could hold dirt *and*
// food at once, and the dirt branch was checked first, so a returning forager
// that brushed a wall abandoned its delivery and hiked to the surface.
export const CARGO_NONE = 0;
export const CARGO_DIRT = 1;
export const CARGO_FOOD = 2;
export const CARGO_CORPSE = 3;

const NX = [-1, 0, 1, -1, 1, -1, 0, 1];
const NY = [-1, -1, -1, 0, 0, 1, 1, 1];
const WEIGHTS = new Float64Array(8);

// Gradient-following sharpness. The epsilon keeps a little exploration alive
// so ants do not lock onto the first trail they touch.
const FIELD_EXP = 3;
const FIELD_EPS = 0.25;

export class Ant {
    constructor(x, y) {
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.dirX = Math.random() > 0.5 ? 1 : -1;
        this.dirY = 0;
        this.cargo = CARGO_NONE;
        this.age = 0;
        this.maxAge = between(CONFIG.workerLifespan);
        this.alive = true;
        this.submerged = 0;
        this.trail = 1;          // pheromone strength, decays with distance
        this.stuck = 0;
    }

    get isCarrying() { return this.cargo !== CARGO_NONE; }

    // Reset trail strength at an anchor event (leaving the nest, or picking up
    // food). Strength then falls off with every step, which is what makes the
    // deposited field a gradient pointing back at the anchor.
    anchor() { this.trail = 1; }

    passable(world, x, y) {
        const t = world.at(x, y);
        return t === TYPE_AIR || t === TYPE_WATER;
    }

    // In contact with soil somewhere in the 8-neighbourhood: standing on a
    // floor, on a slope, or gripping a wall.
    supported(world, x, y) {
        for (let n = 0; n < 8; n++) {
            if (world.isDirt(x + NX[n], y + NY[n])) return true;
        }
        return false;
    }

    // Ants grip; they do not fall. Inside the nest a tunnel or chamber wall is
    // always within reach, so movement is unrestricted. Out in the open they
    // must stay in contact with the ground, which is what keeps them from
    // drifting off into the sky.
    //
    // An earlier version modelled per-cell gravity instead, and every attempt
    // to climb was immediately undone by the fall, leaving whole castes
    // oscillating between two cells forever.
    walkable(world, x, y) {
        if (!this.passable(world, x, y)) return false;
        if (!world.aboveGround(x, y)) return true;
        return this.supported(world, x, y);
    }

    // Safety net for an ant that ends up in open air with nothing to hold —
    // dropped there at spawn, or left hanging when the ground was dug out from
    // under it. It only fires above ground, so it can never undo a climb
    // inside the nest.
    settle(world) {
        if (!world.aboveGround(this.x, this.y)) return false;
        if (this.supported(world, this.x, this.y)) return false;
        if (!this.passable(world, this.x, this.y + 1)) return false;
        this.y++;
        return true;
    }

    // Shared per-tick bookkeeping: ageing, drowning, trail falloff.
    // Returns false when the ant dies this tick.
    preUpdate(world) {
        this.age++;
        this.trail *= CONFIG.pheroFalloff;

        if (this.age > this.maxAge) {
            this.die();
            return false;
        }

        if (world.isWater(this.x, this.y)) {
            this.submerged++;
            if (this.submerged > CONFIG.drownTicks) {
                this.die();
                return false;
            }
        } else {
            this.submerged = 0;
        }

        return true;
    }

    die() { this.alive = false; }

    // Move into a cell the ant can actually hold on to. Never digs.
    step(world, tx, ty) {
        if (!world.isValid(tx, ty) || !this.walkable(world, tx, ty)) return false;
        this.x = tx;
        this.y = ty;
        return true;
    }

    // Explicit excavation. Only diggers call this (plus a rare unstick
    // allowance), so tunnels are built deliberately instead of by accident.
    dig(world, tx, ty) {
        if (this.isCarrying) return false;
        if (!world.isValid(tx, ty) || !world.isDirt(tx, ty)) return false;
        world.set(tx, ty, TYPE_AIR);
        this.cargo = CARGO_DIRT;
        this.x = tx;
        this.y = ty;
        return true;
    }

    // Walk downhill on a navigation field. Returns false when the ant is not
    // on the field at all (sealed in), so the caller can fall back.
    followNav(world, field) {
        const here = field[world.idx(this.x, this.y)];
        if (here === NAV_UNREACHABLE) return false;
        if (here === 0) return true;          // already there

        let bestI = -1;
        let bestD = here;
        let bx = this.x;
        let by = this.y;
        for (let n = 0; n < 8; n++) {
            const tx = this.x + NX[n];
            const ty = this.y + NY[n];
            if (!world.isValid(tx, ty) || !this.walkable(world, tx, ty)) continue;
            const d = field[world.idx(tx, ty)];
            if (d < bestD) { bestD = d; bestI = n; bx = tx; by = ty; }
        }
        if (bestI < 0) return false;
        this.dirX = NX[bestI];
        this.dirY = NY[bestI];
        this.x = bx;
        this.y = by;
        return true;
    }

    // One greedy step toward a target, falling back to the axis that is open.
    stepToward(world, tx, ty) {
        const dx = Math.sign(tx - this.x);
        const dy = Math.sign(ty - this.y);
        if (dx === 0 && dy === 0) return true;
        if (this.step(world, this.x + dx, this.y + dy)) return true;
        if (dx !== 0 && this.step(world, this.x + dx, this.y)) return true;
        if (dy !== 0 && this.step(world, this.x, this.y + dy)) return true;
        // Sidestep around an obstacle.
        const side = Math.random() < 0.5 ? 1 : -1;
        if (this.step(world, this.x + side, this.y)) return true;
        return false;
    }

    wander(world) {
        if (Math.random() < 0.25) this.dirX = Math.random() > 0.5 ? 1 : -1;
        if (Math.random() < 0.25) this.dirY = Math.random() > 0.5 ? 1 : -1;
        if (!this.step(world, this.x + this.dirX, this.y + this.dirY)) {
            if (!this.step(world, this.x + this.dirX, this.y)) {
                this.step(world, this.x, this.y + this.dirY);
            }
        }
    }

    // Stochastic ascent of a pheromone field. The old version took a plain
    // argmax over neighbours, which made ants oscillate between the two cells
    // of a local maximum forever.
    followField(world, field) {
        let total = 0;
        for (let n = 0; n < 8; n++) {
            const tx = this.x + NX[n];
            const ty = this.y + NY[n];
            if (!world.isValid(tx, ty) || !this.walkable(world, tx, ty)) {
                WEIGHTS[n] = 0;
                continue;
            }
            const v = world.read(field, tx, ty);
            let w = Math.pow(v + FIELD_EPS, FIELD_EXP);

            // Momentum: prefer carrying on, strongly avoid doubling back.
            if (NX[n] === this.dirX && NY[n] === this.dirY) w *= 2.2;
            else if (NX[n] === -this.dirX && NY[n] === -this.dirY) w *= 0.15;

            if (world.isWater(tx, ty)) w *= 0.1;

            WEIGHTS[n] = w;
            total += w;
        }

        if (total <= 0) {
            this.wander(world);
            return false;
        }

        let roll = Math.random() * total;
        for (let n = 0; n < 8; n++) {
            roll -= WEIGHTS[n];
            if (roll <= 0) {
                this.dirX = NX[n];
                this.dirY = NY[n];
                this.x += NX[n];
                this.y += NY[n];
                return true;
            }
        }
        return false;
    }

    // Strongest field value among the neighbours. Callers use this to decide
    // whether a trail is worth following at all, or whether to fall back to
    // navigating by geometry.
    fieldPeak(world, field) {
        let best = 0;
        for (let n = 0; n < 8; n++) {
            const v = world.read(field, this.x + NX[n], this.y + NY[n]);
            if (v > best) best = v;
        }
        return best;
    }

    // Standing in open air directly on top of the ground, wherever the ground
    // happens to be after digging and dumping have reshaped it.
    onSurface(world) {
        return world.isAir(this.x, this.y) && this.y === world.groundTop(this.x) - 1;
    }

    // Straight up if possible, then diagonals, then sideways to work along a
    // wall or slope.
    climb(world) {
        const dir = Math.random() > 0.5 ? 1 : -1;
        for (const [dx, dy] of [[0, -1], [dir, -1], [-dir, -1], [dir, 0], [-dir, 0]]) {
            if (this.step(world, this.x + dx, this.y + dy)) return true;
        }
        return false;
    }

    // Strongest field value among the neighbours. Callers use this to decide
    // whether a trail is worth following at all, or whether to fall back to
    // navigating by geometry.
    fieldPeak(world, field) {
        let best = 0;
        for (let n = 0; n < 8; n++) {
            const v = world.read(field, this.x + NX[n], this.y + NY[n]);
            if (v > best) best = v;
        }
        return best;
    }

    // Standing in open air directly on top of the ground, wherever the ground
    // happens to be after digging and dumping have reshaped it.
    onSurface(world) {
        return world.isAir(this.x, this.y) && this.y === world.groundTop(this.x) - 1;
    }

}
