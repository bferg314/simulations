// Step the pond ecosystem without a browser and print the census.
//
//   node simulations/pond_drop/tools/headless.mjs [minutes] [--dark]
//
// Runs at 60 ticks per simulated second with the same starting populations as
// the page. --dark holds the lamp at night level to watch the algae die back.
// A healthy run keeps every group present, or returning from dormancy, with
// bacteria swinging as the grazers bloom and starve.

// The organism classes draw with Pixi. A callable proxy stands in for every
// Pixi object: any property is another stub, any call returns one, and it
// coerces to a number for the odd bit of arithmetic on scale.
const stub = () => new Proxy(function () {}, {
    get(target, key) {
        if (key === Symbol.toPrimitive) return () => 1;
        if (key in target) return target[key];
        return stub();
    },
    set(target, key, value) { target[key] = value; return true; },
    apply: () => stub(),
    construct: () => stub(),
});
function PixiStub() { return stub(); }
globalThis.PIXI = { Graphics: PixiStub, Container: PixiStub, Text: PixiStub };

const root = new URL('..', import.meta.url);
const { Ecology } = await import(new URL('ecology.js', root));
const load = async (name) => (await import(new URL(`classes/${name}.js`, root)))[name];
const [Bacteria, Paramecium, Algae, Amoeba, Euglena, Rotifer, Hydra, Detritus] = await Promise.all(
    ['Bacteria', 'Paramecium', 'Algae', 'Amoeba', 'Euglena', 'Rotifer', 'Hydra', 'Detritus'].map(load)
);

const ecology = new Ecology({
    bacteria: (x, y) => new Bacteria(x, y),
    paramecium: (x, y) => new Paramecium(x, y),
    algae: (x, y) => new Algae(x, y),
    amoeba: (x, y) => new Amoeba(x, y),
    euglena: (x, y) => new Euglena(x, y),
    rotifer: (x, y) => new Rotifer(x, y),
    hydra: (x, y) => new Hydra(x, y),
    detritus: (x, y, size) => new Detritus(x, y, size),
});

const args = process.argv.slice(2);
const minutes = Number(args.find((a) => !a.startsWith('--')) ?? 10);
const dark = args.includes('--dark');

const bounds = { width: 1280, height: 800 };
const start = { bacteria: 150, paramecium: 10, algae: 35, amoeba: 2, euglena: 8, rotifer: 4, hydra: 2 };
const entities = [];
for (const [type, count] of Object.entries(start)) {
    for (let i = 0; i < count; i++) {
        // Hydra attach near the bottom, as on the page
        const x = type === 'hydra' ? 100 + Math.random() * (bounds.width - 200) : Math.random() * bounds.width;
        const y = type === 'hydra' ? bounds.height - 80 - Math.random() * 100 : Math.random() * bounds.height;
        entities.push(ecology.make(type, x, y));
    }
}

const columns = ['bacteria', 'paramecium', 'algae', 'amoeba', 'euglena', 'rotifer', 'hydra', 'detritus'];
console.log('  min' + columns.map((c) => c.slice(0, 6).padStart(8)).join('') + '  dissolved');

let timeOfDay = 0.5;
for (let tick = 0; tick <= minutes * 3600; tick++) {
    // Same day/night curve and micro-currents as script.js
    timeOfDay = (timeOfDay + 0.0005) % 1;
    const light = dark ? 0.05 : 0.2 + Math.sin(timeOfDay * Math.PI);
    const t = tick / 60;
    ecology.step(entities, {
        delta: 1,
        bounds,
        light,
        temperature: 1,
        driftX: Math.sin(t * 0.1) * 0.03 + Math.sin(t * 0.23) * 0.02,
        driftY: Math.cos(t * 0.13) * 0.03 + Math.cos(t * 0.19) * 0.02,
    });

    if (tick % 1800 === 0) {
        const counts = {};
        for (const e of entities) counts[e.type] = (counts[e.type] || 0) + 1;
        console.log(
            (tick / 3600).toFixed(1).padStart(5) +
            columns.map((c) => String(counts[c] || 0).padStart(8)).join('') +
            ecology.dissolved.toFixed(0).padStart(11)
        );
    }
}
