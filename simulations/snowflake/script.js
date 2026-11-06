import { Pane } from 'tweakpane';
import { FixedClock } from '../../shared/clock.js';
import { mountPlayback } from '../../shared/playback.js';
import { SnowModel } from './model.js';
import { CrystalRenderer } from './render.js';
import { PRESETS } from './presets.js';

// Growth field radius in cells. Reiter's figures used about 400 x 400.
const RADIUS = 200;
// Real time per frame the model may use, so a fast speed slows the growth
// rather than the page
const STEP_BUDGET_MS = 10;
// Slider target: about this many seconds to grow a preset at 1x
const GROW_SECONDS = 20;

const params = {
    preset: 'stellarDendrite',
    alpha: 1,
    beta: 0.35,
    logGamma: -3,
    growth: 5,
    drift: false,
};

const model = new SnowModel({ radius: RADIUS });
const renderer = new CrystalRenderer(model, 2);

// --- Canvases -------------------------------------------------------------

const view = document.getElementById('view');
const ctx = view.getContext('2d');
const crystal = document.createElement('canvas');
crystal.width = crystal.height = renderer.size;
const crystalCtx = crystal.getContext('2d');

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.round(window.innerWidth * dpr);
    view.height = Math.round(window.innerHeight * dpr);
    dirty = true;
}
let dirty = true;
window.addEventListener('resize', resize);
resize();

function drawView() {
    crystalCtx.putImageData(renderer.draw(), 0, 0);
    const w = view.width, h = view.height;
    ctx.fillStyle = '#0b1830';
    ctx.fillRect(0, 0, w, h);
    // The crystal field fades into this background colour at its rim
    const side = Math.min(w, h) * 0.96;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(crystal, (w - side) / 2, (h - side) / 2, side, side);
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
    vignette.addColorStop(0, 'rgba(2, 4, 10, 0)');
    vignette.addColorStop(1, 'rgba(2, 4, 10, 0.85)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
}

// --- Growth ----------------------------------------------------------------

// Conditions in force right now (they differ from params while drifting or
// after a preset's scripted switch)
const live = { beta: params.beta, gamma: 10 ** params.logGamma };
let stage = null;        // the preset's pending scripted change, if any
let driftPhase = [0, 0, 0, 0];
let stepCarry = 0;

function setConditions(beta, gamma) {
    live.beta = beta;
    live.gamma = gamma;
    model.setBeta(beta);
    model.gamma = gamma;
}

// The slider's gamma, or the preset's exact value while the slider still
// shows it (the log slider snaps -0.30103 to -0.30)
function chosenGamma() {
    return matchesPreset() ? PRESETS[params.preset].gamma : 10 ** params.logGamma;
}

function restart() {
    model.alpha = params.alpha;
    model.gamma = chosenGamma();
    model.beta = params.beta;
    model.reset();
    live.beta = model.beta;
    live.gamma = model.gamma;
    stage = PRESETS[params.preset]?.then && matchesPreset() ? PRESETS[params.preset].then : null;
    driftPhase = driftPhase.map(() => Math.random() * Math.PI * 2);
    stepCarry = 0;
    dirty = true;
}

// True while the sliders still hold the preset's values
function matchesPreset() {
    const p = PRESETS[params.preset];
    // Sliders snap to their step, so compare loosely
    return p && Math.abs(p.alpha - params.alpha) < 1e-6 && Math.abs(p.beta - params.beta) < 1e-6
        && Math.abs(Math.log10(p.gamma) - params.logGamma) < 0.006;
}

// Conditions drift: as the crystal grows it "falls through" a cloud whose
// vapour level and supply wander. Smooth sums of sines in growth progress,
// ramped in so the centre grows at the chosen conditions.
function driftedConditions() {
    const t = model.iceRadius / RADIUS;
    const ramp = Math.min(1, t * 5);
    const [a, b, c, d] = driftPhase;
    const wave1 = 0.6 * Math.sin(2 * Math.PI * 1.1 * t + a) + 0.4 * Math.sin(2 * Math.PI * 2.7 * t + b);
    const wave2 = 0.6 * Math.sin(2 * Math.PI * 0.9 * t + c) + 0.4 * Math.sin(2 * Math.PI * 2.3 * t + d);
    const logGamma = clamp(Math.log10(chosenGamma()) + 0.9 * ramp * wave1, -4, -0.3);
    const beta = clamp(params.beta + 0.1 * ramp * wave2, 0.2, 0.95);
    return { beta, gamma: 10 ** logGamma };
}

function advance(deadline) {
    stepCarry += params.growth;
    let n = Math.floor(stepCarry);
    stepCarry -= n;
    while (n-- > 0 && !model.done) {
        if (performance.now() > deadline) { stepCarry = 0; break; }
        if (stage && model.iceRadius >= stage.atRadius * RADIUS) {
            setConditions(stage.beta, stage.gamma);
            stage = null;
        }
        if (params.drift && model.steps % 4 === 0) {
            const next = driftedConditions();
            if (Math.abs(next.beta - live.beta) > 0.004) setConditions(next.beta, next.gamma);
            else { live.gamma = next.gamma; model.gamma = next.gamma; }
        }
        model.step();
        dirty = true;
    }
}

// --- Controls --------------------------------------------------------------

const pane = new Pane({ title: 'Snowflake', expanded: window.innerWidth >= 700 });
// Wide enough for the long labels; on a phone, clear of the back button
pane.element.parentElement.style.width = 'min(340px, calc(100vw - 180px))';

const presetOptions = Object.fromEntries(Object.entries(PRESETS).map(([key, p]) => [p.label, key]));
pane.addBinding(params, 'preset', { label: 'preset', options: presetOptions })
    .on('change', (ev) => applyPreset(ev.value));

const conditions = pane.addFolder({ title: 'Conditions' });
conditions.addBinding(params, 'beta', { label: 'background vapour (β)', min: 0, max: 0.95, step: 0.01 })
    .on('change', (ev) => { if (!params.drift) setConditions(ev.value, live.gamma); });
conditions.addBinding(params, 'logGamma', {
    label: 'vapour supply (γ)', min: -4, max: 0, step: 0.01,
    format: (v) => formatGamma(10 ** v),
}).on('change', (ev) => { if (!params.drift) setConditions(live.beta, 10 ** ev.value); });
conditions.addBinding(params, 'alpha', { label: 'diffusion (α)', min: 0.1, max: 2.7, step: 0.001 })
    .on('change', (ev) => { model.alpha = ev.value; });
conditions.addBinding(params, 'drift', { label: 'conditions drift' })
    .on('change', (ev) => { if (!ev.value) setConditions(params.beta, chosenGamma()); });

pane.addBinding(params, 'growth', { label: 'growth speed', min: 0.1, max: 40, step: 0.1 });
pane.addButton({ title: 'Restart (R)' }).on('click', restart);
pane.addButton({ title: 'Save PNG' }).on('click', savePng);

function applyPreset(key) {
    const p = PRESETS[key];
    params.preset = key;
    params.alpha = p.alpha;
    params.beta = p.beta;
    params.logGamma = Math.log10(p.gamma);
    // Pace each preset to take about GROW_SECONDS at 1x
    params.growth = clamp(Math.round((p.steps / (GROW_SECONDS * 60)) * 10) / 10, 0.1, 40);
    pane.refresh();
    restart();
    highlightNakaya(p.form);
}

function highlightNakaya(form) {
    for (const el of document.querySelectorAll('#nakaya [data-form]')) {
        el.classList.toggle('on', el.dataset.form === form);
    }
}

function savePng() {
    drawView();
    crystal.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `snowflake-${params.preset}-${model.steps}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
}

window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'r' || e.key === 'R') restart();
});

// The inset starts open only when there is room for it beside the crystal
document.getElementById('nakaya').open = (window.innerWidth - window.innerHeight * 0.96) / 2 > 360;

// --- Status ----------------------------------------------------------------

const status = document.getElementById('status');
function updateStatus() {
    const p = PRESETS[params.preset];
    const name = matchesPreset() ? p.label : 'Custom';
    const state = model.done ? 'fully grown' : `radius ${Math.round((100 * model.iceRadius) / RADIUS)}%`;
    const drifting = params.drift || stage === null && p.then && matchesPreset();
    status.innerHTML = `${name} · step ${model.steps.toLocaleString()} · ${state} · fill ${model.fillRatio().toFixed(2)}`
        + (drifting ? `<br>now β ${live.beta.toFixed(2)}, γ ${formatGamma(live.gamma)}` : '');
}

// --- Loop ------------------------------------------------------------------

const clock = new FixedClock();
mountPlayback(clock, { speeds: [0.5, 1, 2, 4] });

let frameCount = 0;
function animate(now) {
    requestAnimationFrame(animate);
    const steps = clock.frame(now);
    const deadline = performance.now() + STEP_BUDGET_MS;
    for (let i = 0; i < steps; i++) advance(deadline);
    // Drawing costs about as much as the growth, so while the crystal is
    // growing it is redrawn every other frame
    frameCount++;
    if (dirty && (model.done || clock.paused || frameCount % 2 === 0)) {
        drawView();
        updateStatus();
        dirty = false;
    }
}

applyPreset(params.preset);
requestAnimationFrame(animate);

// For automated checks
window.snowflake = { model, params, applyPreset, restart, savePng };

function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
function formatGamma(g) { return g >= 0.01 ? g.toFixed(3) : g.toExponential(1); }
