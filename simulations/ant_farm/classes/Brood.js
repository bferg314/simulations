import { CONFIG, between } from '../config.js';

// Brood never constructs the next stage itself — it just reports that it is
// ready and Colony performs the promotion. That keeps Brood free of imports
// from Worker/Colony and avoids a module cycle.

class BroodItem {
    constructor(x, y) {
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.age = 0;
        this.alive = true;
        this.promoteTo = null;
    }
}

export class Egg extends BroodItem {
    constructor(x, y) {
        super(x, y);
        this.stage = 'egg';
        this.hatchAt = between(CONFIG.eggHatch);
    }

    update() {
        this.age++;
        if (this.age > this.hatchAt) {
            this.alive = false;
            this.promoteTo = 'larva';
        }
    }
}

export class Larva extends BroodItem {
    constructor(x, y) {
        super(x, y);
        this.stage = 'larva';
        this.hunger = 0;
        this.meals = 0;
        this.pupateAt = between(CONFIG.larvaPupate);
        this.claimedBy = null;   // nurse currently en route, prevents dogpiling
    }

    update() {
        this.age++;
        this.hunger++;

        // Starvation is the mechanism that makes the food economy bite. The
        // old build incremented hunger and never read it.
        if (this.hunger > CONFIG.larvaStarve) {
            this.alive = false;
            return;
        }

        // A larva only develops while it is being fed; a hungry one stalls.
        if (this.hunger < CONFIG.larvaStarve * 0.5 && this.age > this.pupateAt && this.meals >= 2) {
            this.alive = false;
            this.promoteTo = 'pupa';
        }
    }

    feed() {
        this.hunger = 0;
        this.meals++;
        this.claimedBy = null;
    }

    get starving() { return this.hunger > CONFIG.larvaStarve * 0.6; }
}

export class Pupa extends BroodItem {
    constructor(x, y) {
        super(x, y);
        this.stage = 'pupa';
        this.emergeAt = between(CONFIG.pupaEmerge);
    }

    update() {
        this.age++;
        if (this.age > this.emergeAt) {
            this.alive = false;
            this.promoteTo = 'worker';
        }
    }
}
