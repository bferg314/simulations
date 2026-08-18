import { CONFIG } from '../config.js';
import { Ant, CARGO_NONE, CARGO_DIRT, CARGO_FOOD, CARGO_CORPSE } from './Ant.js';
import { TYPE_DIRT, NAV_UNREACHABLE } from './World.js';
import { Larva } from './Brood.js';

const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export const FORAGER = 'forager';
export const NURSE = 'nurse';
export const DIGGER = 'digger';
export const ROLES = [FORAGER, NURSE, DIGGER];

// Spoil-mound profile. Dirt is dumped into a cone centred on the entrance with
// the throat left clear — the old build dumped at exactly ±30 from the
// entrance and built an unnatural crater rim.
const MOUND_THROAT = 13;    // clear apron between the funnel rim and the heap
const MOUND_RADIUS = 140;   // how far the profiled heap may spread before the
                            // frontier rule below takes over
const MOUND_MAX_HEIGHT = 18;   // roughly the amplitude of the natural terrain
const MIDDEN_MIN = 34;      // nearest the entrance a corpse may be tipped

// A trail has to be genuinely fresh before an ant abandons its own search to
// follow it. Set too low, foragers chase the faint stale residue that always
// lingers around the nest and orbit the entrance instead of going out to look.
const TRAIL_SIGNAL = 0.2;
// How long a forager will follow a trail before writing it off and searching on
// its own again. Without a limit the caste never searched at all: a trail to an
// exhausted patch stays above TRAIL_SIGNAL for hundreds of ticks and is topped
// up by every ant that walks it, so the foragers circulated inside their own
// pheromone for 99% of their working lives — a third of a million ant-ticks in
// half an hour of simulation, against six hundred spent actually looking — and
// the colony starved with ninety seeds lying on the surface.
const TRAIL_PATIENCE = 320;
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
// Ticks a digger will spend trying to reach one site before choosing another.
// A site whose face has already been cut out from under it, or that sits behind
// a stretch of wall the corridor rule will not let anyone open, is otherwise
// held for thousands of ticks while the ant walks the same gallery over and
// over.
const DIG_PATIENCE = 260;

export class Worker extends Ant {
    constructor(x, y, role = FORAGER) {
        super(x, y);
        this.role = role;
        this.target = null;        // {x, y} dig site
        this.targetItem = null;    // larva being fed, or corpse being hauled
        this.spoilTarget = null;   // column of the mound this ant is filling
        this.trailPatience = TRAIL_PATIENCE;
        this.digTicks = 0;
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
                const tx = this.x + dx;
                const ty = this.y + dy;
                // Underground only. Left unrestricted, this was by far the
                // busiest excavator in the colony: an ant that had just tipped
                // its load stood still long enough to count as stuck, dug the
                // pellet straight back out of the mound, carried it two cells
                // and dropped it again. Five sixths of all digging was that
                // treadmill, and the heap never gained a single cell of height.
                if (!this.canExcavate(world, tx, ty)) continue;
                if (this.dig(world, tx, ty)) {
                    this.stuck = 0;
                    return;
                }
            }
        }
    }

    // Inside the royal chamber proper. The old box was as tall as it was wide and
    // reached well above the roof, so ants "delivered" food and drew meals from
    // the store while standing in the shaft over it.
    inChamber(world) {
        return Math.abs(this.x - world.chamberX) <= 14 && Math.abs(this.y - world.chamberY) <= 3;
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
            this.trailPatience = TRAIL_PATIENCE;   // this trail is paying: trust it
            return;
        }

        const body = colony.claimCorpseNear(this.x, this.y, 4, this);
        if (body) {
            this.cargo = CARGO_CORPSE;
            this.targetItem = body;
            return;
        }

        // A live food trail leads out of the nest and on to the source, so
        // following it covers both recruitment and the exit — for as long as the
        // ant is prepared to believe it.
        if (this.trailPatience > 0 && this.fieldPeak(world, world.foodField) > TRAIL_SIGNAL) {
            this.trailPatience--;
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
        // A heading of zero is not a direction. Field-following sets dirX from
        // the step it took, and a straight-up or straight-down move leaves it at
        // 0 — after which every "step" of the sweep was onto the ant's own cell,
        // it reported success, and the forager stood on that square for the rest
        // of its life. Reversing the sign does not rescue a zero either.
        if (this.dirX === 0) this.dirX = Math.random() < 0.5 ? -1 : 1;
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
            this.trailPatience = TRAIL_PATIENCE;   // fresh trip, fresh benefit of the doubt
            return;
        }
        // Homing is dead reckoning, not trail-following — which is how real
        // ants do it. The home field is near-flat wherever traffic is heavy
        // (every outbound ant leaves the nest at full strength), so ascending
        // it is a slow random walk. Trails earn their keep recruiting
        // nestmates to food; getting back is navigation.
        this.headHome(world);
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
    headHome(world) {
        // The nest field covers the outdoor surface skin as well as the
        // galleries, so it carries an ant home across broken mound terrain and
        // down the funnel wall. The hand-rolled descent below cannot: on a mound
        // face it alternated a step down into a hollow with a step back up out
        // of it, and laden foragers wore that pair of cells out for the rest of
        // their lives while the colony starved around them.
        if (this.followNav(world, world.distNest)) return;

        // Off the field entirely — sealed in, or standing somewhere the last
        // rebuild has not caught up with. Walk the surface inward and drop in
        // the moment the ground opens up. Aiming at a fixed rim column instead
        // strands the ant on the lip, where the cell below is still solid.
        if (world.aboveGround(this.x, this.y)) {
            const inward = Math.sign(world.entranceX - this.x) || 1;
            if (this.step(world, this.x + inward, this.y + 1)) return;
            if (this.step(world, this.x, this.y + 1)) return;
            this.sidle(world, inward);
            return;
        }
        if (!this.stepToward(world, world.chamberX, world.chamberY)) this.wander(world);
    }

    // --- Nurse ---------------------------------------------------------

    doNurse(world, colony) {
        // Draw a meal and commit to the hungriest larva. The old build fed
        // whichever larva sat first in the array, exactly once, forever.
        //
        // Only in the chamber: that is where the colony's store is. A nurse that
        // could draw one from anywhere would take a meal while it was out at the
        // midden and then have to carry it home across the whole world.
        if (colony.foodStore >= CONFIG.larvaMealCost && this.inChamber(world)) {
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
        else this.headHome(world);
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
        // Greedy stepping is only good for the last few cells; anything further is
        // a navigation problem, and a nurse that lost track of the nursery
        // wandered with the meal until it died of old age. Inside the chamber it
        // is the only option: the nest field is flat here, so following it just
        // reports that the ant has arrived and leaves it standing still.
        if (!this.inChamber(world)) {
            this.headHome(world);
            return;
        }
        if (!this.stepToward(world, larva.x, larva.y)) this.wander(world);
    }

    // --- Digger --------------------------------------------------------

    // Galleries are cut below the original ground line only. Without this an
    // ant that has just dumped its load turns round and digs the same cell
    // straight back out, and nothing is ever excavated.
    //
    // The slab under the royal chamber is off limits as well. Brood cannot hold
    // on to anything, so the moment a digger opened the nursery floor the entire
    // clutch dropped into the gallery below, where the nurses could not reach it
    // and every larva starved.
    canExcavate(world, x, y) {
        if (y <= world.surfaceAt(x)) return false;
        const underChamber = Math.abs(x - world.chamberX) <= 17
            && y >= world.chamberY + 3 && y <= world.chamberY + 5;
        return !underChamber;
    }

    // Soil an ant is willing to cut *here*, as opposed to soil it is allowed to
    // cut at all. A cell already surrounded by open space is the wall of a room,
    // and taking it out makes the room bigger; a cell with only a couple of open
    // neighbours is the end of a corridor, and taking it out makes the corridor
    // longer. Without the distinction every dig widened whatever was nearest and
    // the nest came out as a single round cavern under the entrance with no
    // galleries at all — which is exactly what it looked like.
    //
    // Three is the threshold that still lets a new branch start off the side of
    // an existing tunnel while refusing to widen one. Near a chosen dig site the
    // limit is relaxed so that rooms open out at the ends of galleries, which is
    // where a real nest keeps its brood and its stores.
    mayCut(world, x, y) {
        if (!world.isDirt(x, y) || !this.canExcavate(world, x, y)) return false;
        const room = this.target
            && Math.abs(x - this.target.x) <= 3 && Math.abs(y - this.target.y) <= 3;
        let open = 0;
        for (const [ax, ay] of NEIGHBOURS) {
            if (!world.isDirt(x + ax, y + ay)) open++;
        }
        return open <= (room ? 5 : 3);
    }

    doDig(world, colony) {
        if (world.aboveGround(this.x, this.y)) {
            // Getting back underground is the same journey a laden forager
            // makes, so share it rather than keeping a second, weaker copy.
            this.headHome(world);
            return;
        }

        if (!this.target || this.reached(this.target) || ++this.digTicks > DIG_PATIENCE) {
            this.target = colony.nextDigSite(world, this);
            this.digTicks = 0;
        }
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

        // Ride the existing shaft down to nest level first — but only while the
        // work is genuinely below. Without that test a digger cutting one of the
        // upper galleries was hauled back down toward the chamber every other
        // tick, undoing the step it had just taken outward.
        if (this.y < world.chamberY - DESCEND_MARGIN && this.target.y > this.y
            && this.stuck < 12 && this.followNav(world, world.distNest)) return;

        for (const [ax, ay] of [[dx, dy], [dx, 0], [0, dy]]) {
            if (ax === 0 && ay === 0) continue;
            const tx = this.x + ax;
            const ty = this.y + ay;
            if (this.mayCut(world, tx, ty) && this.dig(world, tx, ty)) { this.digTicks = 0; return; }
        }

        // No face in that direction, so work outward to the fringe of the nest,
        // where the faces are. Stepping greedily toward the target point instead
        // is what a digger cannot do: the middle of an excavated cavern is open
        // air with nothing to hold, only its walls are walkable, and a greedy
        // step has no way to follow a wall around. Diggers spent well over a
        // million ticks shuffling between the same three cells that way, and cut
        // barely a thousand cells in eighteen days.
        if (this.pushOutward(world, dx, dy)) return;

        // Standing at the far end of the workings with nothing in the chosen
        // direction: take a bite out of whatever wall is to hand.
        if (this.biteAnyWall(world)) return;
        if (!this.stepToward(world, this.target.x, this.target.y)) this.wander(world);
    }

    // One step deeper into the workings: to the walkable neighbour further from
    // daylight than this one, preferring whichever best matches the direction of
    // the dig target so galleries still branch the way the target was chosen.
    // Every gallery's far end is a local maximum of that field, so this walks an
    // ant to a face by following walls, which is the one thing greedy stepping
    // cannot do. Distance from the *chamber* was tried and is worse than useless:
    // the shaft is the furthest thing from the chamber that still counts as
    // underground, so the whole caste filed up it and stood at the entrance.
    pushOutward(world, dx, dy) {
        const field = world.distOut;
        const here = field[world.idx(this.x, this.y)];
        if (here === NAV_UNREACHABLE) return false;

        let bestScore = -1;
        let bx = 0;
        let by = 0;
        for (const [ax, ay] of NEIGHBOURS) {
            const tx = this.x + ax;
            const ty = this.y + ay;
            if (world.aboveGround(tx, ty) || !this.walkable(world, tx, ty)) continue;
            const d = field[world.idx(tx, ty)];
            if (d === NAV_UNREACHABLE || d <= here) continue;
            const score = (ax === dx ? 2 : 0) + (ay === dy ? 2 : 0) + Math.random();
            if (score > bestScore) { bestScore = score; bx = tx; by = ty; }
        }
        if (bestScore < 0) return false;
        this.dirX = Math.sign(bx - this.x);
        this.dirY = Math.sign(by - this.y);
        this.x = bx;
        this.y = by;
        return true;
    }

    biteAnyWall(world) {
        for (const [ax, ay] of NEIGHBOURS) {
            const tx = this.x + ax;
            const ty = this.y + ay;
            if (this.mayCut(world, tx, ty) && this.dig(world, tx, ty)) return true;
        }
        return false;
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
            // The profile is full to its rim. Tip the load on bare ground just
            // beyond the heap's outer edge instead, so the mound keeps creeping
            // outward; holding on indefinitely froze the entire digger caste as
            // soon as the heap matured.
            if (Math.abs(this.x - world.entranceX) > MOUND_THROAT
                && this.surfaceIntact(world, this.x)
                && this.moundHeight(world, this.x) <= 0) {
                this.dropSpoil(world);
                return;
            }
            this.sidleOutward(world);
            return;
        }

        if (this.x !== this.spoilTarget) {
            this.sidleSurface(world, Math.sign(this.spoilTarget - this.x));
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
    // plateau, then tapers back to nothing at the rim.
    //
    // The last clause is what keeps the heap climbable while it is still being
    // built. The profile alone only describes the finished cone, and because
    // ants always fill the nearest column short of profile, each column reached
    // its full height before the next one was touched — so the working face of
    // the heap was a sheer drop of up to MOUND_MAX_HEIGHT cells. Ants can grip
    // their way down a cliff like that but cannot walk over it, and a mound
    // ringing the nest with one penned the entire colony inside a bowl: the
    // foragers spent their whole lives pacing the lip and the nest starved.
    // Requiring a column to stay within one cell of its outward neighbour makes
    // the heap accrete in layers instead, always with a one-cell step, which is
    // both walkable at every stage and how a real mound grows.
    //
    // Comparing against the *inward* neighbour as well was tried and pins the
    // whole heap at height two against the untouched apron.
    moundCap(world, x) {
        const adx = Math.abs(x - world.entranceX);
        const outward = x < world.entranceX ? x - 1 : x + 1;
        return Math.min(
            MOUND_MAX_HEIGHT,
            adx - MOUND_THROAT + 1,      // inner ramp
            MOUND_RADIUS - adx + 1,      // outer taper
            this.moundHeight(world, outward) + 1,
        );
    }

    columnNeedsFill(world, x) {
        if (x < 1 || x >= world.width - 1) return false;
        const adx = Math.abs(x - world.entranceX);
        if (adx < MOUND_THROAT || adx > MOUND_RADIUS) return false;
        if (!this.surfaceIntact(world, x)) return false;
        return this.moundHeight(world, x) < this.moundCap(world, x);
    }

    // A column whose soil starts well below the ground line is a hole into the
    // nest, not a low patch of the heap. It reads as needing more fill than any
    // other column, so ants queued up to tip their pellets down it — the spoil
    // landed inside the galleries and the colony spent the back half of its life
    // filling in the nest it had just dug. Volume went backwards.
    surfaceIntact(world, x) {
        return world.groundTop(x) <= world.skyLine(x) + 1;
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

    // Sideways across the outside of the nest. A laden ant stays in the open air
    // the whole way: dropping into a gallery mid-errand hands it to the "get out"
    // navigation, which walks it back to where it started, and the two moves
    // alternate for the rest of its life. Climbing is left out of the fallback
    // for the same reason — it was the hole in this rule that put ants back down
    // the entrance one cell at a time.
    sidleSurface(world, dir) {
        for (const dy of [0, -1, 1, -2, 2]) {
            const ty = this.y + dy;
            if (!world.aboveGround(this.x + dir, ty)) continue;
            if (this.step(world, this.x + dir, ty)) return;
        }
        if (world.aboveGround(this.x, this.y - 1) && this.step(world, this.x, this.y - 1)) return;
        this.wander(world);
    }

    sidleOutward(world) { this.sidleSurface(world, this.x < world.entranceX ? -1 : 1); }

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

        // The midden is bare ground out past the working face of the heap, so it
        // migrates outward as the mound grows instead of ending up buried under it.
        if (Math.abs(this.x - world.entranceX) > MIDDEN_MIN
            && this.moundHeight(world, this.x) <= 0) {
            if (body) body.alive = false;
            colony.middenCount++;
            this.cargo = CARGO_NONE;
            this.targetItem = null;
            return;
        }
        this.sidleOutward(world);
    }
}
