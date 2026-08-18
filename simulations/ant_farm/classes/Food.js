// Inert carryable items: surface forage and the colony's dead.

// Neither can hold on to anything: both fall to the nearest floor, and both are
// pushed back up by soil tipped over them. A seed dropped into an open gallery —
// or a worker that died over one — used to hang in the air where it was left.
function settle(item, world) { world.restItem(item); }

export class Food {
    constructor(x, y) {
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.age = 0;
        this.alive = true;
        this.claimedBy = null;
        this.rotAt = 6000 + Math.random() * 4000;
    }

    update(world) {
        this.age++;
        settle(this, world);
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

    update(world) {
        this.age++;
        settle(this, world);
        // Anything the undertakers never reached eventually breaks down.
        if (this.age > 12000) this.alive = false;
    }
}
