// Inert carryable items: surface forage and the colony's dead.

export class Food {
    constructor(x, y) {
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.age = 0;
        this.alive = true;
        this.claimedBy = null;
        this.rotAt = 6000 + Math.random() * 4000;
    }

    update() {
        this.age++;
        if (this.age > this.rotAt) this.alive = false;
    }
}

export class Corpse {
    constructor(x, y) {
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.age = 0;
        this.alive = true;
        this.claimedBy = null;
    }

    update() {
        this.age++;
        // Anything the undertakers never reached eventually breaks down.
        if (this.age > 12000) this.alive = false;
    }
}
