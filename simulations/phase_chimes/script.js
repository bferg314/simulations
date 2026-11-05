import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pane } from 'tweakpane';
import { FixedClock } from '../../shared/clock.js';
import { onClick } from '../../shared/input.js';
import { mountPlayback } from '../../shared/playback.js';
import {
    G0, AIR_DRAG, periods, lengths, patternRate, angle, strikeRate,
    LinearSource, RK4Row, NonlinearSource, SCALES, midiToHz, noteFrequencies, formatClock,
} from './physics.js';
import { StrikeScheduler } from './scheduler.js';
import { ChimeEngine } from './audio.js';

// --- Settings -------------------------------------------------------------

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const ROOTS = {};
for (let midi = 48; midi <= 72; midi++) ROOTS[`${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`] = midi;

const CONFIG = {
    count: 15,
    k: 51,
    cycle: 60,
    amplitude: 18,         // degrees
    damping: 0.002,        // 1/s
    gravity: G0,
    real: false,
    strike: 'one',
    scale: 'major pentatonic',
    root: 60,
    span: 3,
    volume: 0.7,
    muted: false,
    camera: 'three-quarter',
};

const VOICE_GAIN = 0.09;
const ROW_SPACING = 0.32;
const MAX_DRAWN_LENGTH = 3.6;     // scene units for the longest pendulum
const BOB_RADIUS = 0.1;

// --- Scene ----------------------------------------------------------------

const BG = 0x05070c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 14, 34);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI * 0.62;

scene.add(new THREE.HemisphereLight(0x606878, 0x101018, 0.3));
const key = new THREE.DirectionalLight(0xfff0e0, 1.6);
key.position.set(4, 9, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x6080ff, 0.8);
rim.position.set(-6, 4, -6);
scene.add(rim);

const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, roughness: 0.85, metalness: 0.2 });
const barMat = new THREE.MeshStandardMaterial({ color: 0x4a3d28, roughness: 0.6, metalness: 0.3, emissive: 0x000000 });
// The beam fades when seen from above, where it would hide the bobs
const beamMat = frameMat.clone();
beamMat.transparent = true;
const stringMat = new THREE.LineBasicMaterial({ color: 0x9aa4b8, transparent: true, opacity: 0.35 });

// Rebuilt whenever the row changes
let row = null;

function buildRow() {
    if (row) {
        scene.remove(row.group);
        row.group.traverse((o) => {
            o.geometry?.dispose();
            if (o.material && o.material !== frameMat && o.material !== beamMat && o.material !== barMat && o.material !== stringMat) o.material.dispose();
        });
    }
    const { count, k, cycle } = CONFIG;
    const L = lengths(count, k, cycle);
    const scale = MAX_DRAWN_LENGTH / L[0];
    const drawn = L.map((len) => len * scale);
    const width = (count - 1) * ROW_SPACING;
    const top = MAX_DRAWN_LENGTH + 1.1;

    const group = new THREE.Group();
    scene.add(group);

    // Frame: base, two posts and a beam
    const halfX = width / 2 + 0.45;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2 * halfX + 0.5, 0.12, 2.6), frameMat);
    base.position.y = 0.06;
    group.add(base);
    for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, top, 0.12), frameMat);
        post.position.set(sx * halfX, top / 2, 0);
        group.add(post);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 2.2), frameMat);
        foot.position.set(sx * halfX, 0.16, 0);
        group.add(foot);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * halfX + 0.12, 0.1, 0.14), beamMat);
    beam.position.y = top;
    group.add(beam);

    // Strings: a V from two points on the beam keeps each bob in its plane
    const stringGeo = new THREE.BufferGeometry();
    stringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
    const strings = new THREE.LineSegments(stringGeo, stringMat);
    strings.frustumCulled = false;
    group.add(strings);

    const bobGeo = new THREE.SphereGeometry(BOB_RADIUS, 24, 16);
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10);
    barGeo.rotateZ(Math.PI / 2);
    const bobs = [], bars = [];
    for (let n = 0; n < count; n++) {
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 });
        const bob = new THREE.Mesh(bobGeo, mat);
        group.add(bob);
        bobs.push(bob);
        const pair = [1, -1].map(() => {
            const bar = new THREE.Mesh(barGeo, barMat.clone());
            group.add(bar);
            return bar;
        });
        bars.push(pair);
    }

    row = { group, L, drawn, width, top, strings, bobs, bars, flash: new Float32Array(count * 3) };
    colourRow();
    placeBars();
    updateSound();
}

function rowX(n) {
    return -row.width / 2 + n * ROW_SPACING;
}

// Bob colour runs with pitch, from warm (low) to cool (high)
function colourRow() {
    const { count } = CONFIG;
    row.bobs.forEach((bob, n) => {
        const c = new THREE.Color().setHSL(0.08 + 0.55 * (n / Math.max(1, count - 1)), 0.85, 0.6);
        bob.material.color.copy(c).multiplyScalar(0.6);
        bob.material.emissive.copy(c);
        bob.userData.base = c;
    });
}

// Chime bars sit where the bob turns at the release amplitude
function placeBars() {
    const th = THREE.MathUtils.degToRad(CONFIG.amplitude);
    row.bars.forEach((pair, n) => {
        const len = row.drawn[n] + BOB_RADIUS + 0.03;
        pair.forEach((bar, side) => {
            const s = side === 0 ? 1 : -1;
            bar.position.set(rowX(n), row.top - len * Math.cos(th), s * len * Math.sin(th));
            bar.visible = CONFIG.strike === 'both' || (CONFIG.strike === 'one' && s === 1);
        });
    });
}

// --- Cameras --------------------------------------------------------------

function cameraPreset(name) {
    const w = row ? row.width : 4.5;
    const mid = row ? row.top - MAX_DRAWN_LENGTH * 0.75 : 2;
    // Back off on tall, narrow screens so the whole row fits
    const d = (4 + w * 0.9) * Math.max(1, 1.3 / camera.aspect) ** 0.55;
    switch (name) {
        case 'top-down': return { pos: [0, row.top + d * 0.85, 0.5], target: [0, mid, 0] };
        case 'end-on': return { pos: [w / 2 + d * 1.0, mid + 0.8, 1.1], target: [0, mid, 0] };
        default: return { pos: [d * 0.62, mid + d * 0.42, d * 0.9], target: [0, mid - 0.2, 0] };
    }
}

let camMove = null;
function setCamera(name, instant = false) {
    CONFIG.camera = name;
    const { pos, target } = cameraPreset(name);
    if (instant) {
        camera.position.set(...pos);
        controls.target.set(...target);
        controls.update();
        camMove = null;
        return;
    }
    camMove = {
        t: 0,
        fromPos: camera.position.clone(), toPos: new THREE.Vector3(...pos),
        fromTarget: controls.target.clone(), toTarget: new THREE.Vector3(...target),
    };
}

function stepCamera(dt) {
    if (!camMove) return;
    camMove.t = Math.min(1, camMove.t + dt / 1.2);
    const e = camMove.t * camMove.t * (3 - 2 * camMove.t);
    camera.position.lerpVectors(camMove.fromPos, camMove.toPos, e);
    controls.target.lerpVectors(camMove.fromTarget, camMove.toTarget, e);
    if (camMove.t >= 1) camMove = null;
}
controls.addEventListener('start', () => { camMove = null; });

// --- Motion ---------------------------------------------------------------
//
// p is pattern time. In the ideal mode it runs at √(g/G0) per simulated
// second and the closed form gives every angle. In the real mode it is just
// simulated seconds and an RK4 row is stepped to it.

const sim = {
    released: false,
    p: 0,
    source: null,
    realRow: null,          // display row, real mode only
    lastStrike: [],         // real mode: pattern time of each pendulum's last strike
    realign: null,          // real mode: { at, spread } predicted at release
};

function theta0() {
    return THREE.MathUtils.degToRad(CONFIG.amplitude);
}

function strikeWanted(kind) {
    const m = CONFIG.strike;
    return m === 'one' ? kind === '+' : m === 'both' ? kind !== '0' : m === 'centre' ? kind === '0' : false;
}

function makeRealRow() {
    return new RK4Row({ lengths: row.L, g: CONFIG.gravity, theta0: theta0(), damping: CONFIG.damping, drag: AIR_DRAG });
}

function makeSource() {
    if (!CONFIG.real) {
        return new LinearSource({
            count: CONFIG.count, k: CONFIG.k, T: CONFIG.cycle, mode: CONFIG.strike, theta0: theta0(), damping: CONFIG.damping,
        });
    }
    return new NonlinearSource(sim.realRow.clone(), CONFIG.strike, theta0());
}

// Where and how tightly the real row lines up after one cycle
function predictRealign() {
    const probe = makeRealRow();
    const at = new Array(CONFIG.count).fill(null);
    const target = CONFIG.k;
    const counts = new Array(CONFIG.count).fill(0);
    const limit = CONFIG.cycle * 1.3 / Math.sqrt(CONFIG.gravity / G0);
    probe.advanceTo(limit, (n, t, kind) => {
        if (kind !== '+') return;
        counts[n]++;
        if (counts[n] === target + n) at[n] = t;
    });
    if (at.some((t) => t === null)) return null;
    const mean = at.reduce((a, b) => a + b, 0) / at.length;
    return { at: mean, spread: Math.max(...at) - Math.min(...at) };
}

function release() {
    sim.released = true;
    sim.p = 0;
    sim.lastStrike = new Array(CONFIG.count).fill(-Infinity);
    sim.realRow = CONFIG.real ? makeRealRow() : null;
    sim.realign = CONFIG.real ? predictRealign() : null;
    sim.source = makeSource();
    document.getElementById('release').classList.add('gone');
    if (audio) {
        const now = audio.ctx.currentTime;
        audio.sched.reset(now, 0);
        audio.sched.setSource(sim.source);
        restartClock();
    }
}

function update(dt) {
    if (!sim.released) return;
    if (CONFIG.real) {
        sim.p += dt;
        sim.realRow.advanceTo(sim.p, (n, t, kind) => {
            if (strikeWanted(kind)) sim.lastStrike[n] = t;
        });
    } else {
        sim.p += dt * patternRate(CONFIG.gravity);
    }
}

function currentAngle(n) {
    if (!sim.released) return theta0();
    if (CONFIG.real) {
        // The row sits on whole RK4 steps; the step is short enough to draw as is
        return sim.realRow.theta[n];
    }
    const Tn = CONFIG.cycle / (CONFIG.k + n);
    return angle(theta0(), CONFIG.damping, Tn, sim.p);
}

function lastStrikeOf(n) {
    if (!sim.released) return -Infinity;
    return CONFIG.real ? sim.lastStrike[n] : sim.source.lastStrike(n, sim.p);
}

const viewDir = new THREE.Vector3();
function fadeForView() {
    camera.getWorldDirection(viewDir);
    const above = THREE.MathUtils.smoothstep(-viewDir.y, 0.7, 0.9);
    beamMat.opacity = 1 - 0.88 * above;
    beamMat.depthWrite = above < 0.5;
    stringMat.opacity = 0.35 - 0.2 * above;
}

function drawRow(dt) {
    fadeForView();
    const pos = row.strings.geometry.attributes.position.array;
    const strikeEnd = CONFIG.strike === 'both';
    for (let n = 0; n < CONFIG.count; n++) {
        const th = currentAngle(n);
        const len = row.drawn[n];
        const x = rowX(n);
        const y = row.top - len * Math.cos(th);
        const z = len * Math.sin(th);
        row.bobs[n].position.set(x, y, z);

        // Two strings from points either side along the beam
        const spread = Math.min(0.13, ROW_SPACING * 0.4);
        const o = n * 12;
        pos.set([x - spread, row.top, 0, x, y, z, x + spread, row.top, 0, x, y, z], o);

        // Glow on each strike, fading in about a fifth of a second
        const since = (sim.p - lastStrikeOf(n)) / Math.max(0.2, playbackRate());
        const glow = since >= 0 && since < 2 ? Math.exp(-since / 0.22) : 0;
        const bob = row.bobs[n];
        bob.material.emissiveIntensity = 0.28 + 2.2 * glow;
        // Which bar was hit: the one on the side the bob is on
        const side = z >= 0 ? 0 : 1;
        row.bars[n].forEach((bar, s) => {
            const g = (s === side || !strikeEnd) ? glow : 0;
            row.flash[n * 2 + s] = Math.max(g, row.flash[n * 2 + s] - dt * 4);
            bar.material.emissive.setRGB(1.0, 0.75, 0.4).multiplyScalar(row.flash[n * 2 + s] * 1.4);
        });
    }
    row.strings.geometry.attributes.position.needsUpdate = true;
}

// --- Sound ----------------------------------------------------------------

let audio = null;           // { ctx, engine, sched }
let freqs = [];

function updateSound() {
    freqs = noteFrequencies(CONFIG.count, { scale: CONFIG.scale, rootHz: midiToHz(CONFIG.root), span: CONFIG.span });
}

// Pattern seconds per real second at the current speed
function playbackRate() {
    return clock.speed * (CONFIG.real ? 1 : patternRate(CONFIG.gravity));
}

function strikeGain(event) {
    const chimes = CONFIG.count * (CONFIG.strike === 'both' ? 2 : 1);
    const density = Math.sqrt(15 / chimes);
    const tilt = (262 / freqs[event.n]) ** 0.25;
    const swing = 0.65 + 0.35 * Math.min(1, CONFIG.amplitude / 30);
    return VOICE_GAIN * density * tilt * swing * Math.max(0, Math.min(1, event.amp));
}

function startAudio() {
    if (audio) {
        if (audio.ctx.state !== 'running') audio.ctx.resume();
        return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    const engine = new ChimeEngine(ctx);
    engine.setVolume(CONFIG.volume, CONFIG.muted);
    const sched = new StrikeScheduler({
        lookahead: 0.1,
        play: (event, time) => {
            const n = event.n;
            const pan = CONFIG.count > 1 ? (n / (CONFIG.count - 1) * 2 - 1) * 0.7 : 0;
            return engine.strike({ time, freq: freqs[n], pan, gain: strikeGain(event), chime: `${n}:${event.end}` });
        },
        cancel: (voice) => engine.cancel(voice),
    });
    audio = { ctx, engine, sched };
    ctx.resume();
}

// Re-tie the audio clock to pattern time (speed, pause, gravity, drift)
function restartClock() {
    if (!audio) return;
    const now = audio.ctx.currentTime;
    audio.sched.cancelFuture(now);
    if (clock.paused || !sim.released) audio.sched.pause(now);
    else audio.sched.anchor(now, sim.p, playbackRate());
}

// The strikes themselves changed (strike mode, or damping in the ideal mode)
function newStrikes() {
    if (!sim.released) return;
    sim.source = makeSource();
    if (audio) {
        audio.sched.cancelFuture(audio.ctx.currentTime);
        audio.sched.setSource(sim.source);
        restartClock();
    }
}

// Queued strikes pick up a new pitch
function requeue() {
    if (audio && sim.released) restartClock();
}

function pumpAudio() {
    if (!audio || !sim.released || clock.paused || audio.ctx.state !== 'running') return;
    const now = audio.ctx.currentTime;
    // Display and audio clocks are tied by a line; if they part (a stalled
    // tab, dropped frames), re-anchor rather than let them drift
    if (Math.abs(audio.sched.drift(now, sim.p)) > 0.05) restartClock();
    audio.sched.fill(now);
}

// --- HUD --------------------------------------------------------------------

const hud = document.getElementById('hud');
function drawHud() {
    const rate = CONFIG.real ? 1 : patternRate(CONFIG.gravity);
    const cycleReal = CONFIG.cycle / rate;
    const lines = [];
    if (!CONFIG.real) {
        const t = sim.p / rate;
        const into = t % cycleReal;
        const num = Math.floor(t / cycleReal + 1e-9) + 1;
        lines.push(`<div class="cycle">cycle ${formatClock(into)} / ${formatClock(cycleReal)}${num > 1 ? ` · #${num}` : ''}</div>`);
    } else {
        const at = sim.realign?.at ?? cycleReal;
        const t = sim.p;
        lines.push(`<div class="cycle">${formatClock(t % at)} · near-realignment at ${formatClock(at)}.${String(Math.floor((at % 1) * 10))}</div>`);
    }
    const strikes = strikeRate(CONFIG.count, CONFIG.k, CONFIG.cycle, CONFIG.strike) * rate;
    const L = row.L;
    lines.push(`<div>${CONFIG.count} pendulums, ${CONFIG.k} to ${CONFIG.k + CONFIG.count - 1} swings per cycle · ${(L[0] * 100).toFixed(1)} to ${(L[L.length - 1] * 100).toFixed(1)} cm · ${strikes.toFixed(1)} strikes/s${CONFIG.muted ? ' · muted' : ''}</div>`);
    if (CONFIG.real) {
        const r = sim.realign;
        const slow = ((r ? r.at : cycleReal) / cycleReal - 1) * 100;
        lines.push(`<div class="note">Real pendulum: big swings take longer (here ${slow.toFixed(1)}% longer), and air drag takes swing off each bob at its own rate. So the row lines up late${r ? `, and only to within ${(r.spread * 1000).toFixed(0)} ms` : ''}, and misses by more each cycle.</div>`);
    }
    const html = lines.join('');
    if (hud.innerHTML !== html) hud.innerHTML = html;
}

// --- Controls ---------------------------------------------------------------

const pane = new Pane({ title: 'Phase Chimes', expanded: window.innerWidth >= 700 });

const fRow = pane.addFolder({ title: 'Pendulums' });
fRow.addBinding(CONFIG, 'count', { label: 'pendulums', min: 8, max: 24, step: 1 }).on('change', () => { buildRow(); rerelease(); });
fRow.addBinding(CONFIG, 'k', { label: 'swings (k)', min: 10, max: 80, step: 1 }).on('change', () => { buildRow(); rerelease(); });
fRow.addBinding(CONFIG, 'cycle', { label: 'cycle T (s)', min: 30, max: 180, step: 5 }).on('change', () => { buildRow(); rerelease(); });
fRow.addBinding(CONFIG, 'amplitude', { label: 'amplitude °', min: 2, max: 45, step: 1 }).on('change', () => {
    placeBars();
    if (CONFIG.real) rerelease();
});
// The real row's motion (and its predicted realignment) depends on every
// physical setting, so changing one there starts it again
fRow.addBinding(CONFIG, 'damping', { label: 'damping /s', min: 0, max: 0.05, step: 0.001 }).on('change', () => {
    if (CONFIG.real) rerelease(); else newStrikes();
});
fRow.addBinding(CONFIG, 'gravity', { label: 'gravity m/s²', min: 1, max: 25, step: 0.01 }).on('change', () => {
    if (CONFIG.real) rerelease(); else restartClock();
});
fRow.addBinding(CONFIG, 'real', { label: 'real pendulum' }).on('change', rerelease);

const fSound = pane.addFolder({ title: 'Sound' });
fSound.addBinding(CONFIG, 'strike', {
    label: 'strike',
    options: { 'one end': 'one', 'both ends': 'both', 'centre crossing': 'centre', off: 'off' },
}).on('change', () => { placeBars(); newStrikes(); });
fSound.addBinding(CONFIG, 'scale', { options: Object.fromEntries(Object.keys(SCALES).map((s) => [s, s])) })
    .on('change', () => { updateSound(); requeue(); });
fSound.addBinding(CONFIG, 'root', { options: ROOTS }).on('change', () => { updateSound(); requeue(); });
fSound.addBinding(CONFIG, 'span', { label: 'octaves', min: 1, max: 4, step: 1 }).on('change', () => { updateSound(); requeue(); });
fSound.addBinding(CONFIG, 'volume', { min: 0, max: 1, step: 0.01 }).on('change', () => audio?.engine.setVolume(CONFIG.volume, CONFIG.muted));
const muteBinding = fSound.addBinding(CONFIG, 'muted', { label: 'mute (M)' }).on('change', () => audio?.engine.setVolume(CONFIG.volume, CONFIG.muted));

const fView = pane.addFolder({ title: 'View' });
const camBinding = fView.addBinding(CONFIG, 'camera', {
    options: { 'three-quarter (1)': 'three-quarter', 'top-down (2)': 'top-down', 'end-on (3)': 'end-on' },
}).on('change', (e) => setCamera(e.value));
pane.addButton({ title: 'Release (R)' }).on('click', () => { startAudio(); release(); });

function rerelease() {
    if (sim.released) release();
}

// --- Input ------------------------------------------------------------------

onClick(renderer.domElement, () => {
    startAudio();
    if (!sim.released) release();
});

window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.code === 'KeyR') { startAudio(); release(); }
    else if (e.code === 'KeyM') { CONFIG.muted = !CONFIG.muted; muteBinding.refresh(); audio?.engine.setVolume(CONFIG.volume, CONFIG.muted); }
    else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
        setCamera(['three-quarter', 'top-down', 'end-on'][Number(e.code.slice(5)) - 1]);
        camBinding.refresh();
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// --- Loop -------------------------------------------------------------------

const clock = new FixedClock();
mountPlayback(clock, { speeds: [0.5, 1, 2, 4] });
clock.onChange(restartClock);

buildRow();
setCamera(CONFIG.camera, true);

// For tests/listen.html-style checks from the console or a test driver
window.__phaseChimes = { sim, CONFIG, clock, get audio() { return audio; } };

function animate(now) {
    requestAnimationFrame(animate);
    const steps = clock.frame(now);
    for (let i = 0; i < steps; i++) update(clock.step);
    pumpAudio();
    stepCamera(clock.realDelta);
    controls.update();
    drawRow(clock.realDelta);
    drawHud();
    composer.render();
}
requestAnimationFrame(animate);
