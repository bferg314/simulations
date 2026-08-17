import { CONFIG } from '../config.js';
import { Ant, CARGO_NONE, CARGO_DIRT, CARGO_FOOD, CARGO_CORPSE } from './Ant.js';
import { TYPE_DIRT } from './World.js';
import { Larva } from './Brood.js';

export const FORAGER = 'forager';
export const NURSE = 'nurse';
export const DIGGER = 'digger';
export const ROLES = [FORAGER, NURSE, DIGGER];

// Spoil-mound profile. Dirt is dumped into a cone centred on the entrance with
// the throat left clear — the old build dumped at exactly ±30 from the
// entrance and built an unnatural crater rim.
const MOUND_THROAT = 13;    // clear apron between the funnel rim and the heap
const MOUND_RADIUS = 60;    // how far the heap may eventually spread
const MOUND_MAX_HEIGHT = 16;
const MIDDEN_RADIUS = 34;   // refuse tip, out past the working face of the heap

// A trail has to be genuinely fresh before an ant abandons its own search to
// follow it. Set too low, foragers chase the faint stale residue that always
// lingers around the nest and orbit the entrance instead of going out to look.
const TRAIL_SIGNAL = 0.2;
// Rain heavy enough to send workers underground.
const SHELTER_INTENSITY = 0.6;
// Cells the storm plug needs before the doorway counts as sealed.
const PLUG_MAX = 70;
// A digger coming back underground drops to nest level through the existing
// shaft before it starts a new gallery. Otherwise each one cuts a private
// descent straight down from wherever it re-entered the ground and the nest
// comes out as a fan of parallel drips. Capping how far a digger may be from
// its target before cutting was tried instead and deadlocks: once the ground
// near the nest is open, no new face is ever within reach and digging stops.
const DESCEND_MARGIN = 12;

export class Worker extends Ant {
    constructor(x, y, role = FORAGER) {
        super(x, y);
        this.role = role;
        this.target = null;        // {x, y} dig site
        this.targetItem = null;    // larva being fed, or corpse being hauled
        this.spoilTarget = null;   // column of the mound this ant is filling
        this.lastX = this.x;
        this.lastY = this.y;
    }

    update(world, colony) {
        if (!this.preUpdate(world)) return;

        colony.foodStore = Math.max(0, colony.foodStore - CONFIG.workerUpkeep);

        // Drop out of mid-air before doing anything else.
        if (this.settle(world)) {
            this.lastX = this.x;
            this.lastY = this.y;
            this.stuck = 0;
            return;
        }

        this.layTrail(world);

        // Only a real downpour drives the colony indoors. If every shower sent
        // all the foragers home the food supply stopped dead for the duration
        // and the colony starved rather than weathering it.
        if (world.raining && world.rainIntensity >= SHELTER_INTENSITY
            && this.role !== DIGGER && this.cargo === CARGO_NONE
            && world.aboveGround(this.x, this.y)) {
            this.shelter(world);
            this.trackStuck(world);
            return;
        }

        if (this.cargo === CARGO_DIRT) {
            this.haulSpoil(world);
        } else if (this.cargo === CARGO_CORPSE) {
            this.haulCorpse(world, colony);
        } else if (this.cargo === CARGO_FOOD) {
            if (this.role === NURSE && this.targetItem) this.deliverMeal(world);
            else this.returnHome(world, colony);
        } else if (this.role === FORAGER) {
            this.doForage(world, colony);
        } else if (this.role === NURSE) {
            this.doNurse(world, colony);
        } else {
            this.doDig(world, colony);
        }

        this.trackStuck(world);
    }

    // Outbound ants mark the way home; ants carrying food mark the way to it.
    layTrail(world) {
        if (this.trail < CONFIG.pheroMinDeposit) return;
        if (this.cargo === CARGO_FOOD && this.role === FORAGER) {
            world.deposit(world.foodField, this.x, this.y, this.trail);
        } else if (this.cargo === CARGO_NONE) {
            world.deposit(world.home, this.x, this.y, this.trail);
        }
    }

    // An ant pinned for too long may cut a fresh cell whatever its job.
    // Without this a cave-in can entomb a worker permanently.
    trackStuck(world) {
        if (this.x === this.lastX && this.y === this.lastY) this.stuck++;
        else this.stuck = 0;
        this.lastX = this.x;
        this.lastY = this.y;

        if (this.stuck > 45 && !this.isCarrying) {
            for (const [dx, dy] of [[0, -1], [this.dirX, 0], [0, 1], [-this.dirX, 0]]) {
                if (this.dig(world, this.x + dx, this.y + dy)) {
                    this.stuck = 0;
                    return;
                }
            }
        }
    }

    inChamber(world) {
        return Math.abs(this.x - world.chamberX) < 9 && Math.abs(this.y - world.chamberY) < 9;
    }

    shelter(world) {
        if (this.fieldPeak(world, world.home) > TRAIL_SIGNAL) this.followField(world, world.home);
        else this.headHome(world);
    }

    // --- Forager -------------------------------------------------------

    doForage(world, colony) {
        // Passing through the nest re-arms the home trail. Without this an
        // ant's strength decays to nothing on its first trip and the home
        // field never gets written again.
        if (this.inChamber(world)) this.anchor();

        const item = colony.takeFoodNear(this.x, this.y, 3);
        if (item) {
            this.cargo = CARGO_FOOD;
            this.anchor();          // the food trail starts at full strength here
            return;
        }

        const body = colony.claimCorpseNear(this.x, this.y, 4, this);
        if (body) {
            this.cargo = CARGO_CORPSE;
            this.targetItem = body;
            return;
        }

        // A live food trail leads out of the nest and on to the source, so
        // following it covers both recruitment and the exit.
        if (this.fieldPeak(world, world.foodField) > TRAIL_SIGNAL) {
            this.followField(world, world.foodField);
            return;
        }

        // No trail: head out of the nest, then sweep the surface. Plain
        // climbing is not enough — it has no lateral persistence, so an ant
        // in the chamber mills about instead of finding the shaft.
        if (!world.aboveGround(this.x, this.y)) {
            this.headOut(world);
            return;
        }
        this.sweepSurface(world);
    }

    sweepSurface(world) {
        // Long committed runs. Reversing often turns the sweep into a slow
        // diffusion that never covers the width of the world.
        if (Math.random() < 0.008) this.dirX = -this.dirX;
        // Two-cell steps as well as one, because the spoil mound rises faster
        // than a cell per column in places. Crucially, a searching ant refuses
        // to step below the ground line: otherwise it walks over the entrance,
        // drops into the funnel, climbs back out and does it again, which kept
        // four fifths of the foragers underground.
        const tx = this.x + this.dirX;
        for (const dy of [0, -1, 1, -2, 2]) {
            const ty = this.y + dy;
            if (!world.aboveGround(tx, ty)) continue;
            if (this.step(world, tx, ty)) return;
        }
        this.dirX = -this.dirX;
    }

    returnHome(world, colony) {
        if (this.inChamber(world)) {
            colony.foodStore += CONFIG.foodValue;
            colony.delivered++;
            this.cargo = CARGO_NONE;
            this.anchor();          // the home trail restarts from the nest
            return;
        }
        // Homing is dead reckoning, not trail-following — which is how real
        // ants do it. The home field is near-flat wherever traffic is heavy
        // (every outbound ant leaves the nest at full strength), so ascending
        // it is a slow random walk. Trails earn their keep recruiting
        // nestmates to food; getting back is navigation.
        if (world.aboveGround(this.x, this.y)) {
            this.headHome(world);
            return;
        }
        if (!this.stepToward(world, world.chamberX, world.chamberY)) this.wander(world);
    }

    // The lip of the funnel on whichever side the ant is already on. The mouth
    // itself is a hole: its cells sit right at the ground line with nothing
    // adjacent to grip, so the rim is the only crossing point.
    rimX(world) {
        const side = this.x >= world.entranceX ? 1 : -1;
        return world.entranceX + side * (world.entranceHalf + 1);
    }

    // Out of the nest, following the distance-to-daylight field.
    headOut(world) {
        if (this.followNav(world, world.distOut)) return;
        const rx = this.rimX(world);
        const ry = Math.max(0, world.skyLine(rx) - 1);
        if (this.stepToward(world, rx, ry)) return;
        if (!this.climb(world)) this.wander(world);
    }

    // Fallback for an ant that has wandered off the end of the trail network.
    // Walking the surface back to the entrance and dropping in beats stepping
    // blindly toward the chamber, which just wedges the ant against terrain.
    headHome(world) {
        if (world.aboveGround(this.x, this.y)) {
            const inward = Math.sign(world.entranceX - this.x) || 1;
            // Walk inward and drop in the moment the ground opens up. Aiming
            // at a fixed rim column instead strands the ant on the lip, where
            // the cell below is still solid, shuffling back and forth forever.
            if (this.step(world, this.x + inward, this.y + 1)) return;
            if (this.step(world, this.x, this.y + 1)) return;
            this.sidle(world, inward);
            return;
        }
        if (this.followNav(world, world.distNest)) return;
        if (!this.stepToward(world, world.chamberX, world.chamberY)) this.wander(world);
    }

    // --- Nurse ---------------------------------------------------------

    doNurse(world, colony) {
        // Draw a meal and commit to the hungriest larva. The old build fed
        // whichever larva sat first in the array, exactly once, forever.
        if (colony.foodStore >= CONFIG.larvaMealCost) {
            const larva = colony.hungriestLarva();
            if (larva) {
                colony.foodStore -= CONFIG.larvaMealCost;
                larva.claimedBy = this;
                this.targetItem = larva;
                this.cargo = CARGO_FOOD;
                return;
            }
        }

        const body = colony.claimCorpseNear(this.x, this.y, 25, this);
        if (body) {
            this.cargo = CARGO_CORPSE;
            this.targetItem = body;
            return;
        }

        if (this.inChamber(world)) this.wander(world);
        else if (!this.stepToward(world, world.chamberX, world.chamberY)) this.wander(world);
    }

    deliverMeal(world) {
        const larva = this.targetItem;
        if (!(larva instanceof Larva) || !larva.alive) {
            // Recipient died en route; the meal is lost with it.
            this.targetItem = null;
            this.cargo = CARGO_NONE;
            return;
        }
        if (Math.abs(larva.x - this.x) <= 2 && Math.abs(larva.y - this.y) <= 2) {
            larva.feed();
            this.targetItem = null;
            this.cargo = CARGO_NONE;
            return;
        }
        if (!this.stepToward(world, larva.x, larva.y)) this.wander(world);
    }

    // --- Digger --------------------------------------------------------

    // Galleries are cut below the original ground line only. Without this an
    // ant that has just dumped its load turns round and digs the same cell
    // straight back out, and nothing is ever excavated.
    canExcavate(world, x, y) { return y > world.surfaceAt(x); }

    doDig(world, colony) {
        if (world.aboveGround(this.x, this.y)) {
            // Getting back underground is the same journey a laden forager
            // makes, so share it rather than keeping a second, weaker copy.
            this.headHome(world);
            return;
        }

        if (!this.target || this.reached(this.target)) this.target = colony.nextDigSite(world, this);
        if (!this.target) {
            this.wander(world);
            return;
        }

        let dx = Math.sign(this.target.x - this.x);
        let dy = Math.sign(this.target.y - this.y);

        // Wander off the straight line now and then. Cutting dead straight at
        // the target produced galleries that read as ruled lines radiating from
        // the nest; a little meander makes them look burrowed.
        if (Math.random() < 0.3) {
            if (Math.random() < 0.5) dx = dx === 0 ? (Math.random() < 0.5 ? 1 : -1) : 0;
            else dy = dy === 0 ? (Math.random() < 0.5 ? 1 : -1) : 0;
        }

        // Ride the existing shaft down to nest level first.
        if (this.y < world.chamberY - DESCEND_MARGIN && this.stuck < 12
            && this.stepToward(world, world.chamberX, world.chamberY)) return;

        for (const [ax, ay] of [[dx, dy], [dx, 0], [0, dy]]) {
            if (ax === 0 && ay === 0) continue;
            const tx = this.x + ax;
            const ty = this.y + ay;
            if (world.isDirt(tx, ty) && this.canExcavate(world, tx, ty)
                && this.dig(world, tx, ty)) return;
        }
        if (!this.stepToward(world, this.target.x, this.target.y)) this.wander(world);
    }

    reached(t) { return Math.abs(t.x - this.x) <= 1 && Math.abs(t.y - this.y) <= 1; }

    // --- Hauling -------------------------------------------------------

    haulSpoil(world) {
        // During rain the spoil goes into the doorway instead of the mound,
        // until the door is sealed. Without the cap the whole digger caste
        // just shuttles dirt into the entrance for the length of the storm.
        if (world.raining && world.plugCells.length < PLUG_MAX) {
            this.plugEntrance(world);
            return;
        }

        // Head for the shaft deliberately. Blind climbing leaves a laden ant
        // shuffling along whatever gallery it is standing in — the ceiling is
        // solid, so every upward move fails and it never finds its way out.
        if (!world.aboveGround(this.x, this.y)) {
            this.headOut(world);
            return;
        }

        // Commit to a specific column that is still below profile and walk to
        // it. Blindly shuffling outward and reversing at the band edges just
        // made laden ants pace the rim forever without ever unloading.
        if (this.spoilTarget === null || !this.columnNeedsFill(world, this.spoilTarget)) {
            this.spoilTarget = this.findSpoilColumn(world);
        }

        if (this.spoilTarget === null) {
            // Nowhere left within reach that is below profile — keep hold of
            // the load rather than stacking it into a tower.
            this.sidleOutward(world);
            return;
        }

        if (this.x !== this.spoilTarget) {
            this.sidle(world, Math.sign(this.spoilTarget - this.x));
            return;
        }

        this.dropSpoil(world);
        this.spoilTarget = null;
    }

    // Cells piled on top of the original ground line in this column.
    moundHeight(world, x) {
        return Math.round(world.surfaceAt(x)) - world.groundTop(x);
    }

    // Target heap profile: rises one cell per column from the throat, holds a
    // plateau, then tapers back to nothing at the rim. Every step is a single
    // cell, which is what an ant can climb or drop in one stride.
    //
    // Two earlier rules both failed. Comparing a column only to its outward
    // neighbour let the inner face grow into a sixteen-cell cliff that penned
    // foragers outside the nest holding food. Comparing it to both neighbours
    // fixed the cliff but pinned the whole heap at height two against the
    // untouched apron, so it spread flat to the far radius and a single pellet
    // became a thousand-tick round trip.
    moundCap(world, x) {
        const adx = Math.abs(x - world.entranceX);
        return Math.min(
            MOUND_MAX_HEIGHT,
            adx - MOUND_THROAT + 1,      // inner ramp
            MOUND_RADIUS - adx + 1,      // outer taper
        );
    }

    columnNeedsFill(world, x) {
        if (x < 1 || x >= world.width - 1) return false;
        const adx = Math.abs(x - world.entranceX);
        if (adx < MOUND_THROAT || adx > MOUND_RADIUS) return false;
        return this.moundHeight(world, x) < this.moundCap(world, x);
    }

    // Always dump on the side of the entrance the ant is already standing on.
    // Sending it to the nearest needy column regardless of side makes it try to
    // cross the funnel; stepping into the bowl puts it below the ground line,
    // its "get out" navigation walks it straight back, and it see-saws on the
    // rim forever without ever unloading.
    findSpoilColumn(world) {
        const own = this.x < world.entranceX ? -1 : 1;
        for (const side of [own, -own]) {
            let best = null;
            let bestDist = Infinity;
            for (let adx = MOUND_THROAT; adx <= MOUND_RADIUS; adx++) {
                const x = world.entranceX + side * adx;
                if (!this.columnNeedsFill(world, x)) continue;
                const d = Math.abs(x - this.x);
                if (d < bestDist) { bestDist = d; best = x; }
            }
            if (best !== null) return best;
        }
        return null;
    }

    dropSpoil(world) {
        const top = world.groundTop(this.x);
        world.set(this.x, top - 1, TYPE_DIRT);
        this.cargo = CARGO_NONE;
        if (this.y >= top - 1) this.y = Math.max(0, top - 2);
    }

    // Walking sideways across the surface has to be able to scale a step and to
    // work back down a face, or a laden digger gets pinned against the rim of
    // the entrance funnel and carries its load forever.
    sidle(world, dir) {
        for (const dy of [0, -1, 1, -2, 2]) {
            if (this.step(world, this.x + dir, this.y + dy)) return;
        }
        // Blocked sideways: go up and over before considering dropping down,
        // otherwise the ant just see-saws between two cells beside the mound.
        if (this.step(world, this.x, this.y - 1)) return;
        if (this.step(world, this.x, this.y + 1)) return;
        if (!this.climb(world)) this.wander(world);
    }

    sidleOutward(world) { this.sidle(world, this.x < world.entranceX ? -1 : 1); }

    sidleInward(world) { this.sidle(world, this.x < world.entranceX ? 1 : -1); }

    plugEntrance(world) {
        if (Math.abs(this.x - world.entranceX) > MOUND_THROAT) { this.sidleInward(world); return; }

        // Fill the shaft from the top down.
        const top = Math.round(world.skyLine(this.x));
        if (this.y >= top && this.y <= top + 4 && world.isAir(this.x, this.y)) {
            world.set(this.x, this.y, TYPE_DIRT);
            world.plugCells.push({ x: this.x, y: this.y });
            this.cargo = CARGO_NONE;
            this.y = Math.max(0, this.y - 1);
            return;
        }
        if (this.y > top + 4) { if (!this.climb(world)) this.wander(world); }
        else this.wander(world);
    }

    haulCorpse(world, colony) {
        const body = this.targetItem;
        if (body) { body.x = this.x; body.y = this.y; }

        if (!world.aboveGround(this.x, this.y)) {
            this.headOut(world);
            return;
        }

        // Out past the working face of the heap is the midden.
        if (Math.abs(this.x - world.entranceX) > MIDDEN_RADIUS) {
            if (body) body.alive = false;
            colony.middenCount++;
            this.cargo = CARGO_NONE;
            this.targetItem = null;
            return;
        }
        this.sidleOutward(world);
    }
}
