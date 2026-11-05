import { Pane } from 'tweakpane';
import { FixedClock } from '../../shared/clock.js';
import { mountPlayback } from '../../shared/playback.js';
import { onClick } from '../../shared/input.js';
import { SlimeModel, DEFAULTS } from './model.js';
import { applyPreset, PRESETS } from './presets.js';

// --- Settings --------------------------------------------------------------

const MAX_GRID = 1024;      // trail map is capped at 1024 x 1024 cells
const MIN_AUTO_AGENTS = 15000;

const params = {
    preset: 'dish',
    agents: 0,               // filled in from the preset's density
    sensorAngle: DEFAULTS.sensorAngle,
    sensorOffset: DEFAULTS.sensorOffset,
    rotationAngle: DEFAULTS.rotationAngle,
    stepSize: DEFAULTS.stepSize,
    deposit: DEFAULTS.deposit,
    decay: DEFAULTS.decay,
    foodStrength: DEFAULTS.foodStrength,
    palette: 'agar',
    tool: 'food',
    cityNames: false,
    autoAgents: true,
};
let userAgents = null;  // set once the agent slider is touched

// Colour stops by trail level (0 = bare, 1 = saturated). The `wall` colour
// is used outside the dish (or for the sea on the Tokyo map), `light` for lit cells.
const PALETTES = {
    agar: {
        stops: [[0, '#2b1e0d'], [0.18, '#5a3d12'], [0.45, '#c98a12'], [0.75, '#f3c531'], [1, '#fff4b8']],
        wall: '#0b0805', sea: '#0a1420', light: '#8d93a0',
        flake: '#efe3c4', flakeEdge: '#9c8457', rim: 'rgba(255, 240, 200, 0.25)',
    },
    neon: {
        stops: [[0, '#04020a'], [0.2, '#24064a'], [0.45, '#8a18d8'], [0.75, '#22d3ee'], [1, '#f0ffff']],
        wall: '#000000', sea: '#020812', light: '#3c3f55',
        flake: '#ffffff', flakeEdge: '#ff4fd8', rim: 'rgba(160, 120, 255, 0.35)',
    },
};

// --- DOM ---------------------------------------------------------------------

const trailCanvas = document.getElementById('trail');
const overlay = document.getElementById('overlay');
const tctx = trailCanvas.getContext('2d');
const octx = overlay.getContext('2d');
const hudPreset = document.getElementById('hud-preset');
const hudStats = document.getElementById('hud-stats');
const hudNote = document.getElementById('hud-note');

let model = null;
let stepMs = 0, frameMs = 16.7, lastNow = 0, slowFrames = 0, hudTimer = 0;
let image = null, pixels = null, cellKind = null, lut = null, special = null;

// --- World setup -------------------------------------------------------------

function gridSize() {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = Math.max(2, w / MAX_GRID, h / MAX_GRID);
    return [Math.max(64, Math.floor(w / scale)), Math.max(64, Math.floor(h / scale))];
}

function modelParams() {
    return {
        sensorAngle: params.sensorAngle,
        sensorOffset: params.sensorOffset,
        rotationAngle: params.rotationAngle,
        stepSize: params.stepSize,
        deposit: params.deposit,
        decay: params.decay,
        foodStrength: params.foodStrength,
        lightStrength: 10,
        exclusion: true,
    };
}

function buildWorld() {
    const [W, H] = gridSize();
    model = new SlimeModel({ width: W, height: H, seed: (Math.random() * 2 ** 31) | 0, params: modelParams() });
    const density = { dish: 0.2, tokyo: 0.12, agar: 0.1 }[params.preset];
    params.agents = applyPreset(model, params.preset, { count: userAgents, density });

    trailCanvas.width = W;
    trailCanvas.height = H;
    image = tctx.createImageData(W, H);
    pixels = new Uint32Array(image.data.buffer);
    rebuildKinds();
    buildLut();
    resizeOverlay();
    hudPreset.textContent = PRESETS[params.preset].label;
    hudNote.textContent = '';
    slowFrames = 0;
    pane?.refresh();
}

// 0 = agar, 1 = wall, 2 = light. Rebuilt whenever stimuli change.
function rebuildKinds() {
    const n = model.width * model.height;
    if (!cellKind || cellKind.length !== n) cellKind = new Uint8Array(n);
    for (let i = 0; i < n; i++) cellKind[i] = model.wall[i] ? 1 : (model.light[i] ? 2 : 0);
}

// --- Colour ----------------------------------------------------------------

const LUT_SIZE = 1024;
const LUT_RANGE = 48;           // trail level that maps to the top of the LUT
const LUT_SCALE = LUT_SIZE / LUT_RANGE;

function hex(c) {
    const v = parseInt(c.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function pack([r, g, b]) {
    // ImageData is RGBA in memory; on little-endian machines that's ABGR as a uint32
    return (255 << 24) | (b << 16) | (g << 8) | r;
}

function buildLut() {
    const pal = PALETTES[params.palette];
    const stops = pal.stops.map(([t, c]) => [t, hex(c)]);
    lut = new Uint32Array(LUT_SIZE);
    for (let i = 0; i < LUT_SIZE; i++) {
        const v = i / LUT_SCALE;
        const t = 1 - Math.exp(-v / 9);  // soft tone curve: veins read, food doesn't blow out
        let k = 1;
        while (k < stops.length - 1 && stops[k][0] < t) k++;
        const [t0, c0] = stops[k - 1], [t1, c1] = stops[k];
        const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        lut[i] = pack([0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * f)));
    }
    // Lit agar: the bare-agar colour washed toward the light tint. The overlay
    // adds a soft halo on top, so the hard cell edge doesn't show.
    const bare = stops[0][1], tint = hex(pal.light);
    special = [0, pack(hex(params.preset === 'tokyo' ? pal.sea : pal.wall)), pack(bare.map((v, j) => Math.round(v + (tint[j] - v) * 0.14)))];
}

function renderTrail() {
    const t = model.trail, n = t.length;
    const kinds = cellKind, L = lut, S = special, top = LUT_SIZE - 1;
    for (let i = 0; i < n; i++) {
        const k = kinds[i];
        if (k !== 0) { pixels[i] = S[k]; continue; }
        let j = (t[i] * LUT_SCALE) | 0;
        if (j < 0) j = 0; else if (j > top) j = top;
        pixels[i] = L[j];
    }
    tctx.putImageData(image, 0, 0);
}

// The overlay holds what should stay crisp: dish rim, oat flakes, light halos
// and city names. It only changes when the stimuli do.
function resizeOverlay() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.round(window.innerWidth * dpr);
    overlay.height = Math.round(window.innerHeight * dpr);
    drawOverlay();
}

function drawOverlay() {
    const pal = PALETTES[params.palette];
    const sx = overlay.width / model.width, sy = overlay.height / model.height;
    const s = Math.min(sx, sy);
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (model.dish) {
        octx.strokeStyle = pal.rim;
        octx.lineWidth = 2 * s;
        octx.beginPath();
        octx.ellipse(model.dish.cx * sx, model.dish.cy * sy, model.dish.r * sx, model.dish.r * sy, 0, 0, Math.PI * 2);
        octx.stroke();
    }
    if (model.map) {
        octx.strokeStyle = pal.rim;
        octx.lineWidth = 1.2 * s;
        octx.beginPath();
        model.map.poly.forEach(([x, y], i) => (i ? octx.lineTo(x * sx, y * sy) : octx.moveTo(x * sx, y * sy)));
        octx.closePath();
        octx.stroke();
    }

    // Keep light halos on the agar: clip to the dish or the coastline
    octx.save();
    if (model.dish || model.map) {
        octx.beginPath();
        if (model.dish) octx.ellipse(model.dish.cx * sx, model.dish.cy * sy, model.dish.r * sx, model.dish.r * sy, 0, 0, Math.PI * 2);
        else model.map.poly.forEach(([x, y], i) => (i ? octx.lineTo(x * sx, y * sy) : octx.moveTo(x * sx, y * sy)));
        octx.closePath();
        octx.clip();
    }
    for (const l of model.lights) {
        const g = octx.createRadialGradient(l.x * sx, l.y * sy, 0, l.x * sx, l.y * sy, l.r * 1.4 * s);
        g.addColorStop(0, 'rgba(255, 255, 240, 0.42)');
        g.addColorStop(0.7, 'rgba(220, 235, 255, 0.18)');
        g.addColorStop(1, 'rgba(220, 235, 255, 0)');
        octx.fillStyle = g;
        octx.beginPath();
        octx.arc(l.x * sx, l.y * sy, l.r * 1.4 * s, 0, Math.PI * 2);
        octx.fill();
    }
    octx.restore();

    octx.font = `${Math.round(10 * Math.min(2, window.devicePixelRatio || 1))}px Inter, sans-serif`;
    octx.textAlign = 'left';
    octx.textBaseline = 'middle';
    for (const f of model.foods) {
        const r = Math.max(3, f.r * s);
        // An oat flake: a slightly flattened, tilted oval
        const tilt = ((f.x * 13.7 + f.y * 7.3) % 3.14);
        octx.save();
        octx.translate(f.x * sx, f.y * sy);
        octx.rotate(tilt);
        octx.fillStyle = pal.flake;
        octx.strokeStyle = pal.flakeEdge;
        octx.lineWidth = Math.max(1, r * 0.18);
        octx.beginPath();
        octx.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
        octx.fill();
        octx.stroke();
        octx.restore();
        if (params.cityNames && f.name) {
            octx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            octx.fillText(f.name, f.x * sx + r * 1.4, f.y * sy);
        }
    }
}

function stimuliChanged() {
    rebuildKinds();
    drawOverlay();
}

// --- Interaction -----------------------------------------------------------

function toCell(e) {
    return [(e.clientX / window.innerWidth) * model.width, (e.clientY / window.innerHeight) * model.height];
}

function removeAt(e) {
    const [x, y] = toCell(e);
    if (model.removeNear(x, y, 10)) stimuliChanged();
}

let suppressClick = false;
onClick(trailCanvas, (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const [x, y] = toCell(e);
    if (x < 0 || y < 0 || x >= model.width || y >= model.height) return;
    const tool = e.shiftKey ? 'light' : params.tool;
    if (tool === 'remove') { removeAt(e); return; }
    if (model.wall[(y | 0) * model.width + (x | 0)]) return;
    if (tool === 'light') model.addLight(x, y, Math.max(8, Math.min(model.width, model.height) * 0.04));
    else model.addFood(x, y, Math.max(2.5, Math.min(model.width, model.height) * 0.008));
    stimuliChanged();
});

trailCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    removeAt(e);
});

// Long press removes, for touch screens (and anyone without a right button)
let press = null;
trailCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    start.timer = setTimeout(() => {
        removeAt({ clientX: start.x, clientY: start.y });
        suppressClick = true;
        press = null;
    }, 550);
    press = start;
});
const cancelPress = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) return;
    clearTimeout(press.timer);
    press = null;
};
trailCanvas.addEventListener('pointermove', cancelPress);
trailCanvas.addEventListener('pointerup', cancelPress);
trailCanvas.addEventListener('pointercancel', cancelPress);

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildWorld, 250);
});

// --- Controls --------------------------------------------------------------

let pane = null;
buildWorld();

pane = new Pane({ title: 'Slime mould', expanded: window.innerWidth >= 700 });
// On a phone the collapsed pane would sit on the back button; drop it below.
if (window.innerWidth < 700) pane.element.parentElement.style.top = '64px';
const setup = pane.addFolder({ title: 'Setup' });
setup.addBinding(params, 'preset', {
    label: 'layout',
    options: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [v.label, k])),
}).on('change', () => buildWorld());
setup.addBinding(params, 'agents', { min: 2000, max: 250000, step: 1000 }).on('change', (ev) => {
    if (!ev.last) return;
    userAgents = params.agents;
    model.resize(params.agents);
});
setup.addBinding(params, 'tool', {
    label: 'click places',
    options: { 'oat flake (food)': 'food', 'light (repels)': 'light', 'remove': 'remove' },
});
setup.addButton({ title: 'Reset' }).on('click', () => buildWorld());
setup.addButton({ title: 'Clear food and lights' }).on('click', () => {
    model.clearStimuli();
    stimuliChanged();
});

const agent = pane.addFolder({ title: 'Agents (Jones 2010)' });
const live = (key, opts) => agent.addBinding(params, key, opts).on('change', () => {
    model.params[key] = params[key];
});
live('sensorAngle', { label: 'sensor angle °', min: 5, max: 90, step: 0.5 });
live('sensorOffset', { label: 'sensor offset', min: 1, max: 30, step: 1 });
live('rotationAngle', { label: 'rotation °', min: 5, max: 90, step: 0.5 });
live('stepSize', { label: 'step size', min: 0.5, max: 3, step: 0.1 });
live('deposit', { min: 0.5, max: 20, step: 0.5 });
live('decay', { min: 0.01, max: 0.5, step: 0.01 });
live('foodStrength', { label: 'food strength', min: 0, max: 100, step: 1 });
agent.addButton({ title: 'Paper defaults' }).on('click', () => {
    for (const k of ['sensorAngle', 'sensorOffset', 'rotationAngle', 'stepSize', 'deposit', 'decay', 'foodStrength']) {
        params[k] = DEFAULTS[k];
        model.params[k] = DEFAULTS[k];
    }
    pane.refresh();
});

const view = pane.addFolder({ title: 'View' });
view.addBinding(params, 'palette', { options: { 'mould on agar': 'agar', neon: 'neon' } }).on('change', () => {
    buildLut();
    drawOverlay();
});
view.addBinding(params, 'cityNames', { label: 'city names' }).on('change', drawOverlay);
view.addBinding(params, 'autoAgents', { label: 'auto agents' });

// --- Loop ------------------------------------------------------------------

const clock = new FixedClock();
mountPlayback(clock, { speeds: [0.5, 1, 2, 4] });

// If the CPU can't keep up at 1x, shed agents (down to a floor) rather than
// let the frame rate sink. Off with the 'auto agents' switch.
function adaptAgents(steps) {
    if (!params.autoAgents || clock.paused || clock.speed !== 1 || steps === 0) { slowFrames = 0; return; }
    const tooSlow = frameMs > 22 && stepMs > 9;
    slowFrames = tooSlow ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 90 && model.count > MIN_AUTO_AGENTS) {
        const next = Math.max(MIN_AUTO_AGENTS, Math.round((model.count * 0.8) / 1000) * 1000);
        model.resize(next);
        params.agents = next;
        pane.refresh();
        hudNote.textContent = `Lowered agents to ${next.toLocaleString()} to hold the frame rate.`;
        slowFrames = 0;
    }
}

function animate(now) {
    requestAnimationFrame(animate);
    if (lastNow) frameMs += (Math.min(100, now - lastNow) - frameMs) * 0.05;
    lastNow = now;

    const steps = clock.frame(now);
    if (steps > 0) {
        const t0 = performance.now();
        for (let i = 0; i < steps; i++) model.step();
        stepMs += ((performance.now() - t0) / steps - stepMs) * 0.1;
    }
    renderTrail();
    adaptAgents(steps);

    if (now - hudTimer > 250) {
        hudTimer = now;
        hudStats.textContent =
            `${model.count.toLocaleString()} agents · step ${model.steps.toLocaleString()} · ` +
            `${stepMs.toFixed(1)} ms/step · ${(1000 / frameMs).toFixed(0)} fps · ${model.width}×${model.height} grid`;
    }
}
requestAnimationFrame(animate);

// For the browser checks
window.__slime = { get model() { return model; }, clock, params, buildWorld, renderTrail, stats: () => ({ stepMs, fps: 1000 / frameMs }) };
