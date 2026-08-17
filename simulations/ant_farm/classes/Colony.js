import { CONFIG } from '../config.js';
import { Queen } from './Queen.js';
import { Worker, FORAGER, NURSE, DIGGER, ROLES } from './Worker.js';
import { Egg, Larva, Pupa } from './Brood.js';
import { Food, Corpse } from './Food.js';
import { Antlion } from './Antlion.js';

export const TICKS_PER_DAY = 3000;

export class Colony {
    constructor(world) {
        this.world = world;
        this.foodStore = 90;          // the founding queen's fat reserves
        this.delivered = 0;
        this.middenCount = 0;
        this.deaths = 0;
        this.ants = [];
        this.brood = [];
        this.food = [];
        this.corpses = [];
        this.predators = [];
        this.roleTimer = 0;
        this.foodSpawnRate = CONFIG.foodSpawnRate;
        this.stats = this.emptyStats();

        this.queen = new Queen(world.entranceX, Math.round(world.surfaceAt(world.entranceX)));
        this.ants.push(this.queen);

        for (let i = 0; i < CONFIG.initialAnts; i++) {
            const x = world.entranceX + Math.round((Math.random() - 0.5) * 10);
            const role = ROLES[i % ROLES.length];
            this.ants.push(new Worker(x, Math.round(world.surfaceAt(x)) - 1, role));
        }

        // One antlion pit, well clear of the nest entrance.
        const side = Math.random() < 0.5 ? -1 : 1;
        const px = world.entranceX + side * (70 + Math.random() * 90);
        if (px > 20 && px < world.width - 20) this.predators.push(new Antlion(world, px));
    }

    emptyStats() {
        return {
            population: 0, forager: 0, nurse: 0, digger: 0,
            eggs: 0, larvae: 0, pupae: 0, starving: 0,
            food: 0, tunnel: 0, day: 0, status: 'Founding',
        };
    }

    // --- Queries used by workers ---------------------------------------

    takeFoodNear(x, y, r) {
        for (let i = 0; i < this.food.length; i++) {
            const f = this.food[i];
            if (Math.abs(f.x - x) <= r && Math.abs(f.y - y) <= r) {
                this.food.splice(i, 1);
                return f;
            }
        }
        return null;
    }

    claimCorpseNear(x, y, r, ant) {
        for (const c of this.corpses) {
            if (!c.alive) continue;
            if (c.claimedBy && c.claimedBy.alive) continue;
            if (Math.abs(c.x - x) <= r && Math.abs(c.y - y) <= r) {
                c.claimedBy = ant;
                return c;
            }
        }
        return null;
    }

    hungriestLarva() {
        let best = null;
        for (const b of this.brood) {
            if (!(b instanceof Larva) || !b.alive) continue;
            if (b.claimedBy && b.claimedBy.alive) continue;
            if (b.hunger < 200) continue;          // not worth a trip yet
            if (!best || b.hunger > best.hunger) best = b;
        }
        return best;
    }

    // Repairs first, then a fresh gallery radiating from the chamber. Digging
    // toward a deliberate target is what produces a branching nest instead of
    // the random pockmarks the old build made by bumping into walls.
    //
    // Targets are per-ant on purpose. Pooling them into a few shared faces was
    // tried and throughput collapsed: diggers crowded the same spot, arrived,
    // re-picked the same nearest site and thrashed instead of excavating.
    nextDigSite(world, digger) {
        if (world.repairQueue.length && Math.random() < 0.7) {
            return world.repairQueue.shift();
        }

        for (let attempt = 0; attempt < 12; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 14 + Math.random() * 46;
            const x = Math.round(world.chamberX + Math.cos(angle) * radius);
            // Bias downward: galleries spread sideways and sink, never upward
            // into the spoil mound.
            const y = Math.round(world.chamberY + Math.abs(Math.sin(angle)) * radius * 0.8
                - radius * 0.15);

            if (x < 10 || x > world.width - 10) continue;
            if (y < world.chamberY - 22 || y > world.height - 12) continue;
            if (!world.isDirt(x, y)) continue;
            return { x, y };
        }
        return { x: world.chamberX, y: Math.min(world.height - 12, world.chamberY + 12) };
    }

    // --- Castes ---------------------------------------------------------

    roleTargets(pop) {
        const hungry = this.brood.reduce(
            (n, b) => n + (b instanceof Larva && b.alive && b.hunger > 200 ? 1 : 0), 0);

        // Nurses scale with unfed brood; foragers surge when the store is low;
        // diggers take the remainder plus a boost when repairs are pending.
        let nurse = Math.min(pop * 0.45, Math.max(1, Math.ceil(hungry * 0.6)));
        // Famine pulls ants off the digging face and onto the food supply.
        let forager = pop * (this.foodStore < 15 ? 0.72 : 0.4);
        if (this.world.repairQueue.length > 4) forager *= 0.75;

        let digger = Math.max(1, pop - nurse - forager);
        const total = nurse + forager + digger;
        return {
            [NURSE]: (nurse / total) * pop,
            [FORAGER]: (forager / total) * pop,
            [DIGGER]: (digger / total) * pop,
        };
    }

    reviewRoles() {
        const workers = this.ants.filter(a => a instanceof Worker);
        const pop = workers.length;
        if (pop === 0) return;

        const targets = this.roleTargets(pop);
        const counts = { [FORAGER]: 0, [NURSE]: 0, [DIGGER]: 0 };
        for (const w of workers) counts[w.role]++;

        const margin = pop * CONFIG.roleSwitchMargin;
        // Only unencumbered ants change job, so nobody abandons a load midway.
        const free = workers.filter(w => !w.isCarrying && !w.targetItem);
        let next = 0;

        for (const role of ROLES) {
            while (counts[role] - targets[role] > margin && next < free.length) {
                const need = ROLES.find(r => targets[r] - counts[r] > margin);
                if (!need) return;
                const cand = free.find((w, i) => i >= next && w.role === role);
                if (!cand) break;
                next = free.indexOf(cand) + 1;
                cand.role = need;
                cand.target = null;
                counts[role]--;
                counts[need]++;
            }
        }
    }

    // --- Lifecycle -------------------------------------------------------

    promoteBrood() {
        for (let i = this.brood.length - 1; i >= 0; i--) {
            const b = this.brood[i];
            if (b.alive) continue;

            if (b.promoteTo === 'larva') this.brood.push(new Larva(b.x, b.y));
            else if (b.promoteTo === 'pupa') this.brood.push(new Pupa(b.x, b.y));
            else if (b.promoteTo === 'worker') {
                this.ants.push(new Worker(b.x, b.y, NURSE));
            } else {
                // Died rather than developed.
                this.corpses.push(new Corpse(b.x, b.y));
            }
            this.brood.splice(i, 1);
        }
    }

    cullAnts() {
        for (let i = this.ants.length - 1; i >= 0; i--) {
            const a = this.ants[i];
            if (a.alive) continue;
            if (!a.eaten) this.corpses.push(new Corpse(a.x, a.y));
            this.deaths++;
            this.ants.splice(i, 1);
        }
    }

    spawnFood(world) {
        if (this.food.length >= CONFIG.foodMax) return;
        if (Math.random() > this.foodSpawnRate) return;

        const x = (Math.random() * world.width) | 0;
        // Lands on whatever the top surface is now, spoil mound included.
        const y = world.groundTop(x);
        if (y >= world.height) return;
        this.food.push(new Food(x, Math.max(2, y - 1)));
    }

    // --- Main tick -------------------------------------------------------

    update(world) {
        for (const a of this.ants) a.update(world, this);
        for (const b of this.brood) b.update();
        for (const f of this.food) f.update();
        for (const c of this.corpses) c.update();
        for (const p of this.predators) p.update(world, this);

        this.promoteBrood();
        this.cullAnts();

        for (let i = this.food.length - 1; i >= 0; i--) if (!this.food[i].alive) this.food.splice(i, 1);
        for (let i = this.corpses.length - 1; i >= 0; i--) if (!this.corpses[i].alive) this.corpses.splice(i, 1);

        this.spawnFood(world);

        if (++this.roleTimer >= CONFIG.roleReviewInterval) {
            this.roleTimer = 0;
            this.reviewRoles();
        }
    }

    census(world) {
        const s = this.emptyStats();
        for (const a of this.ants) {
            if (a instanceof Worker) {
                s.population++;
                s[a.role]++;
            }
        }
        for (const b of this.brood) {
            if (b instanceof Egg) s.eggs++;
            else if (b instanceof Larva) { s.larvae++; if (b.starving) s.starving++; }
            else if (b instanceof Pupa) s.pupae++;
        }
        s.food = Math.floor(this.foodStore);
        s.tunnel = world.tunnelVolume();
        s.day = Math.floor(world.tick / TICKS_PER_DAY);

        if (!this.queen.alive) s.status = s.population === 0 ? 'Dead' : 'Collapsing';
        else if (this.queen.state !== 'lay') s.status = 'Founding';
        else if (this.foodStore < 5 || s.starving > s.larvae * 0.5) s.status = 'Hungry';
        else if (s.population === 0) s.status = 'Collapsing';
        else s.status = 'Thriving';

        this.stats = s;
        return s;
    }
}
