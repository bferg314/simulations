import { CONFIG } from '../config.js';
import { Ant } from './Ant.js';
import { TYPE_AIR } from './World.js';
import { Egg } from './Brood.js';

const DESCEND = 'descend';
const EXCAVATE = 'excavate';
const LAY = 'lay';

export class Queen extends Ant {
    constructor(x, y) {
        super(x, y);
        this.state = DESCEND;
        this.eggTimer = 0;
        this.maxAge = Infinity;       // the queen dies of starvation, not old age
        this.starved = 0;
        this.chamberPlan = null;
        this.isQueen = true;
    }

    update(world, colony) {
        if (!this.preUpdate(world)) return;

        // She is the largest thing in the nest and the one the eye goes to, so
        // she in particular must never hang in the middle of the chamber.
        if (this.state === LAY) this.settle(world);

        // The royal chamber is the anchor of the home gradient.
        world.deposit(world.home, this.x, this.y, 1);

        colony.foodStore -= CONFIG.queenUpkeep;
        if (colony.foodStore <= 0) {
            colony.foodStore = 0;
            this.starved++;
            // A long fuse. The colony should only lose its queen to a real,
            // sustained famine — which the food-abundance control can still
            // cause deliberately — not to an unlucky first few minutes.
            if (this.starved > 9000) this.die();
        } else {
            this.starved = Math.max(0, this.starved - 2);
        }

        if (this.state === DESCEND) this.descend(world);
        else if (this.state === EXCAVATE) this.excavate(world);
        else this.lay(world, colony);
    }

    descend(world) {
        if (this.y >= world.chamberY) {
            this.buildChamberPlan(world);
            this.state = EXCAVATE;
            return;
        }
        // Sink a shaft wide enough that traffic never deadlocks in it.
        for (let dx = -2; dx <= 2; dx++) world.set(this.x + dx, this.y, TYPE_AIR);
        world.set(this.x, this.y + 1, TYPE_AIR);
        this.y++;
    }

    // Ordered list of chamber cells so excavation is animated rather than the
    // whole gallery vanishing in a single frame.
    //
    // A broad, flat lens rather than the old sphere. Height is the point: a void
    // taller than four cells has rows in the middle of it that are out of reach
    // of any wall, so the sphere was a room whose centre nothing could stand in —
    // the queen hung in the middle of it, the brood hung around her, and nurses
    // could not cross from the ceiling to the floor. Flat is also what a real
    // brood gallery looks like.
    buildChamberPlan(world) {
        const rx = 16;
        const up = 1;
        const down = 2;
        const cells = [];
        for (let dx = -rx; dx <= rx; dx++) {
            const taper = Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2));
            const top = Math.round(up * taper);
            const bottom = Math.round(down * taper);
            for (let dy = -top; dy <= bottom; dy++) {
                const d = Math.hypot(dx, dy * 6);   // dug outward from the centre
                cells.push({ x: this.x + dx, y: this.y + dy, d });
            }
        }
        cells.sort((a, b) => a.d - b.d);
        this.chamberPlan = cells;
        world.chamberX = this.x;
        world.chamberY = this.y;
    }

    excavate(world) {
        for (let n = 0; n < 3 && this.chamberPlan.length; n++) {
            const c = this.chamberPlan.shift();
            world.set(c.x, c.y, TYPE_AIR);
        }
        if (this.chamberPlan.length === 0) {
            this.state = LAY;
            this.chamberPlan = null;
        }
    }

    lay(world, colony) {
        // Laying rate tracks the food surplus, so famine visibly throttles
        // the colony instead of the queen pumping out eggs regardless.
        const surplus = Math.min(colony.foodStore, 60);
        const interval = CONFIG.eggIntervalBase / (1 + surplus / 20);

        this.eggTimer++;
        if (this.eggTimer > interval && colony.foodStore > CONFIG.eggCost * 2) {
            const spot = this.findEggSpot(world);
            if (spot) {
                colony.brood.push(new Egg(spot.x, spot.y));
                colony.foodStore -= CONFIG.eggCost;
                this.eggTimer = 0;
            }
        }

        // A slow shuffle around the chamber, through air only.
        if (Math.random() < 0.06) {
            const nx = this.x + (Math.random() > 0.5 ? 1 : -1);
            const ny = this.y + (Math.random() > 0.5 ? 1 : -1);
            if (world.isAir(nx, ny)
                && world.hasFooting(nx, ny)
                && Math.abs(nx - world.chamberX) < 7
                && Math.abs(ny - world.chamberY) < 7) {
                this.x = nx;
                this.y = ny;
            }
        }
    }

    // Eggs must land in open chamber air; the old build could bury them in dirt.
    findEggSpot(world) {
        for (let attempt = 0; attempt < 12; attempt++) {
            const x = this.x + Math.round((Math.random() - 0.5) * 8);
            const y = this.y + Math.round((Math.random() - 0.5) * 6);
            if (world.isAir(x, y) && world.isDirt(x, y + 1)) return { x, y };
        }
        return world.isAir(this.x, this.y) ? { x: this.x, y: this.y } : null;
    }
}
