// Pond population dynamics: energy budgets, feeding, death and reproduction.
//
// Pure logic with no Pixi or DOM access, so it can be stepped headlessly. The
// organism classes still decide how to move and what to catch; this module
// decides what that is worth, who starves, and who divides. script.js applies
// the visual side (adding and removing graphics, bursts, bubbles) from the
// events each step returns.

// Energy budgets for organisms whose classes don't keep their own. Euglena,
// rotifers and hydra track energy and decide when to divide themselves; they
// only need a population cap here.
// `digest` is the handling time after a meal: a predator that is still
// digesting brushes past prey instead of eating it. Without it a few paramecia
// strip the drop of bacteria in seconds and starve before anything recovers.
export const LIFE = {
    bacteria: { start: 20, upkeep: 0.004, splitAt: 40, cap: 400 },
    paramecium: { start: 60, upkeep: 0.015, meal: 9, digest: 240, splitAt: 120, cap: 40 },
    amoeba: { start: 80, upkeep: 0.012, meal: 6, bigMeal: 30, digest: 200, splitAt: 160, cap: 6 },
    algae: { start: 40, upkeep: 0.012, photosynthesis: 0.03, splitAt: 80, cap: 60 },
    euglena: { cap: 30 },
    rotifer: { cap: 12 },
    hydra: { cap: 5 },
};

// Size of the detritus a dead organism leaves behind.
const CORPSE_SIZE = {
    paramecium: 4, amoeba: 6, euglena: 3, rotifer: 5, hydra: 6, algae: 3,
};

const DECOMPOSE_RANGE = 12;       // how close a bacterium must be to feed on detritus
const SCENT_RANGE = 80;           // bacteria swim up the gradient toward detritus this close
const SCENT_PULL = 0.004;
const DECOMPOSE_RATE = 0.05;      // nutrients a bacterium draws per tick
const DECOMPOSE_YIELD = 2;        // bacterial energy per nutrient unit
// Per detritus per tick: chance it carries in a dormant spore, cyst or egg that
// hatches. Hatching doesn't depend on the living population, which is what lets
// a species that crashed come back.
const DORMANT = {
    bacteria: 0.0004, algae: 0.00003, paramecium: 0.00005, euglena: 0.00003,
    amoeba: 0.00002, rotifer: 0.00003, hydra: 0.00001,
};
const SETTLE_CHANCE = 0.1 / 60;   // per tick: organic matter drifts in from above

// Dissolved organic matter: what most pond bacteria actually live on. Algae
// leak it while they photosynthesize, decomposition releases part of what it
// breaks down, and the pipette adds it directly.
const EXUDATE = 0.02;             // per alga per tick at full light
const UPTAKE = 0.03;              // most a bacterium can absorb per tick
const UPTAKE_YIELD = 1;           // bacterial energy per unit absorbed
const DECOMPOSE_RELEASE = 0.5;    // share of decomposed nutrients that dissolves
const DISSOLVED_MAX = 2000;

export class Ecology {
    // factories: { [type]: (x, y, size?) => entity }
    constructor(factories) {
        this.factories = factories;
        this.dissolved = 1000;
    }

    addNutrients(amount) {
        this.dissolved = Math.min(DISSOLVED_MAX, this.dissolved + amount);
    }

    // Give a freshly created organism its starting energy.
    init(entity) {
        const life = LIFE[entity.type];
        if (life && life.start !== undefined && entity.energy === undefined) {
            entity.energy = life.start;
        }
        return entity;
    }

    make(type, x, y, size) {
        return this.init(this.factories[type](x, y, size));
    }

    // Advance every organism one tick. Mutates `entities` (removing the dead and
    // eaten, appending the newborn) and returns what happened for the renderer.
    step(entities, env) {
        const { delta, bounds, light, temperature, driftX, driftY } = env;
        const bioDelta = delta * temperature;
        const events = { removed: [], added: [], eaten: [], bubbles: [] };
        const gone = new Set();
        const remove = (e) => { gone.add(e); events.removed.push(e); };
        const add = (e) => { entities.push(e); events.added.push(e); };

        const counts = {};
        for (const e of entities) counts[e.type] = (counts[e.type] || 0) + 1;

        // Movement, hunting and metabolism
        for (let i = entities.length - 1; i >= 0; i--) {
            const e = entities[i];
            if (gone.has(e)) continue;

            e.x += driftX * delta;
            e.y += driftY * delta;

            const result = e.update(bioDelta, bounds, light, entities, temperature);

            if (result === 'decomposed') {
                remove(e);
                continue;
            }
            const life = LIFE[e.type];
            if (result && result !== 'decomposed' && life && life.digest && e.digesting > 0) {
                // Still digesting the last meal: the prey gets away
            } else if (result && !gone.has(result)) {
                remove(result);
                events.eaten.push(result);
                counts[result.type]--;
                this.feed(e, result);
                // Prey large enough to leave remains
                if (result.type === 'paramecium' || result.type === 'euglena') {
                    add(this.make('detritus', result.x, result.y, 4));
                }
            }

            this.metabolize(e, bioDelta, light);

            // Photosynthesis gives off oxygen
            if (e.type === 'algae' && light > 0.8 && Math.random() < 0.002 * light * delta) {
                events.bubbles.push({ x: e.x + (Math.random() - 0.5) * 15, y: e.y + (Math.random() - 0.5) * 15 });
            }
            if (e.type === 'euglena' && e.mode === 'photosynthetic' && light > 0.9 && Math.random() < 0.001 * delta) {
                events.bubbles.push({ x: e.x, y: e.y });
            }
        }

        this.decompose(entities, gone, bioDelta, add, counts, bounds);
        this.absorb(entities, gone, bioDelta, light, counts);

        // Starvation: the dead become detritus
        for (const e of entities) {
            if (gone.has(e) || e.type === 'detritus' || e.energy === undefined || e.energy > 0) continue;
            remove(e);
            counts[e.type]--;
            if (CORPSE_SIZE[e.type]) add(this.make('detritus', e.x, e.y, CORPSE_SIZE[e.type]));
        }

        // Division
        for (let i = 0, n = entities.length; i < n; i++) {
            const e = entities[i];
            if (gone.has(e)) continue;
            const life = LIFE[e.type];
            if (!life || (counts[e.type] || 0) >= life.cap) continue;

            let spot = null;
            if (life.splitAt !== undefined) {
                if (e.energy >= life.splitAt) {
                    e.energy /= 2;
                    spot = { x: e.x + (Math.random() - 0.5) * 20, y: e.y + (Math.random() - 0.5) * 20 };
                }
            } else if (e.canReproduce && e.canReproduce()) {
                spot = e.reproduce();
            }
            if (spot) {
                const child = this.make(e.type, spot.x, spot.y);
                if (life.splitAt !== undefined) child.energy = e.energy;
                add(child);
                counts[e.type]++;
            }
        }

        // Organic matter settling in from the surface
        if (Math.random() < SETTLE_CHANCE * delta) {
            add(this.make('detritus', Math.random() * bounds.width, -10, 2 + Math.random() * 2));
        }

        // Drop everything that died or was eaten this tick
        if (gone.size) {
            let w = 0;
            for (let r = 0; r < entities.length; r++) {
                if (!gone.has(entities[r])) entities[w++] = entities[r];
            }
            entities.length = w;
        }

        return events;
    }

    feed(predator, prey) {
        const life = LIFE[predator.type];
        if (!life || life.meal === undefined) return; // class handles its own meals
        const meal = prey.type === 'bacteria' ? life.meal : (life.bigMeal || life.meal);
        predator.energy += meal;
        if (life.digest) predator.digesting = life.digest;
    }

    metabolize(e, bioDelta, light) {
        const life = LIFE[e.type];
        if (!life || life.upkeep === undefined) return;
        e.energy -= life.upkeep * bioDelta;
        if (e.digesting > 0) e.digesting -= bioDelta;
        if (life.photosynthesis) e.energy += life.photosynthesis * light * bioDelta;
    }

    // Bacteria feed on nearby detritus, drawing its nutrients down until it is
    // gone. Detritus also carries dormant spores and cysts (see DORMANT).
    decompose(entities, gone, bioDelta, add, counts, bounds) {
        const detritus = [];
        const bacteria = [];
        for (const e of entities) {
            if (gone.has(e)) continue;
            if (e.type === 'detritus') detritus.push(e);
            else if (e.type === 'bacteria') bacteria.push(e);
        }

        for (const d of detritus) {
            const reach = d.size + DECOMPOSE_RANGE;
            for (const b of bacteria) {
                if (d.nutrients <= 0) break;
                const dx = b.x - d.x;
                const dy = b.y - d.y;
                const distSq = dx * dx + dy * dy;
                if (distSq > SCENT_RANGE * SCENT_RANGE) continue;
                if (distSq > reach * reach) {
                    // Chemotaxis toward the food
                    const dist = Math.sqrt(distSq);
                    b.vx -= (dx / dist) * SCENT_PULL * bioDelta;
                    b.vy -= (dy / dist) * SCENT_PULL * bioDelta;
                    continue;
                }
                const take = Math.min(DECOMPOSE_RATE * bioDelta, d.nutrients);
                d.nutrients -= take;
                b.energy += take * DECOMPOSE_YIELD;
                this.addNutrients(take * DECOMPOSE_RELEASE);
            }

            for (const type in DORMANT) {
                if ((counts[type] || 0) < LIFE[type].cap && Math.random() < DORMANT[type] * bioDelta) {
                    // Hydra settle on the bottom; everything else hatches in place
                    const y = type === 'hydra' ? bounds.height - 80 - Math.random() * 100 : d.y;
                    add(this.make(type, d.x, y));
                    counts[type] = (counts[type] || 0) + 1;
                }
            }
        }
    }

    // Algae feed the dissolved pool; bacteria share what is there.
    absorb(entities, gone, bioDelta, light, counts) {
        this.addNutrients((counts.algae || 0) * EXUDATE * light * bioDelta);

        const bacteria = counts.bacteria || 0;
        if (bacteria <= 0) return;
        const supply = Math.min(this.dissolved, bacteria * UPTAKE * bioDelta);
        this.dissolved -= supply;
        const share = (supply / bacteria) * UPTAKE_YIELD;
        for (const e of entities) {
            if (e.type === 'bacteria' && !gone.has(e)) e.energy += share;
        }
    }
}
