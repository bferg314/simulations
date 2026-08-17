import { TYPE_AIR } from './World.js';
import { Queen } from './Queen.js';

const PIT_RADIUS = 9;
const PIT_DEPTH = 9;

// A conical sand trap. Foragers that wander into the funnel lose their footing
// and slide toward the mandibles at the bottom.
export class Antlion {
    constructor(world, x) {
        this.x = Math.round(x);
        this.rimY = Math.round(world.surfaceAt(this.x));
        this.bottomY = this.rimY + PIT_DEPTH;
        this.kills = 0;
        this.lungeTimer = 0;
        this.carve(world);
    }

    carve(world) {
        for (let dx = -PIT_RADIUS; dx <= PIT_RADIUS; dx++) {
            const x = this.x + dx;
            if (x < 0 || x >= world.width) continue;
            const depth = Math.round((1 - Math.abs(dx) / PIT_RADIUS) * PIT_DEPTH);
            const top = Math.round(world.surfaceAt(x));
            for (let y = top; y <= top + depth; y++) world.set(x, y, TYPE_AIR);
        }
    }

    contains(ant) {
        const dx = ant.x - this.x;
        if (Math.abs(dx) > PIT_RADIUS) return false;
        const slope = Math.round((1 - Math.abs(dx) / PIT_RADIUS) * PIT_DEPTH);
        return ant.y >= this.rimY - 1 && ant.y <= this.rimY + slope + 1;
    }

    update(world, colony) {
        if (this.lungeTimer > 0) this.lungeTimer--;

        for (const ant of colony.ants) {
            if (!ant.alive || ant instanceof Queen) continue;
            if (!this.contains(ant)) continue;

            if (Math.abs(ant.x - this.x) <= 1 && ant.y >= this.bottomY - 2) {
                ant.alive = false;
                ant.eaten = true;      // consumed, so no corpse is left behind
                this.kills++;
                this.lungeTimer = 25;
                continue;
            }

            // Loose sand: the ant slips inward and down more often than it climbs.
            if (Math.random() < 0.65) {
                const inward = Math.sign(this.x - ant.x) || (Math.random() < 0.5 ? 1 : -1);
                if (!ant.step(world, ant.x + inward, ant.y + 1)) {
                    ant.step(world, ant.x, ant.y + 1);
                }
            }
        }
    }
}
