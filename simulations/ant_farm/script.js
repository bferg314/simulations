import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { CONFIG } from './config.js';
import { World, TYPE_AIR, TYPE_DIRT } from './classes/World.js';
import { Colony } from './classes/Colony.js';
import { Food } from './classes/Food.js';
import { SoilPainter, buildEnclosure, PLANE_W, PLANE_H } from './render.js';

// --- Simulation ---------------------------------------------------------

const world = new World();
const colony = new Colony(world);
const painter = new SoilPainter(world);

let simSpeed = CONFIG.simSpeed;

// --- Scene --------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140d09);

// Orthographic and rotation-locked: this is a flat pane behind glass, and the
// old perspective orbit only ever let you look at the back of it.
// Half-extents of the whole framed object, bezel included, so the farm is
// never cropped by the window.
const FRAME_HALF_W = (PLANE_W + 7) / 2;
const FRAME_HALF_H = (PLANE_H + 7) / 2;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(0, 0, 60);

function applyFrustum() {
    const aspect = window.innerWidth / window.innerHeight;
    // Fit height, then widen if the window is too narrow to show the full width.
    const halfH = Math.max(FRAME_HALF_H, FRAME_HALF_W / Math.max(aspect, 0.0001));
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
}
applyFrustum();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xfff2e0, 1.1);
key.position.set(-8, 12, 20);
scene.add(key);

const { planeMesh, texture } = buildEnclosure(scene, painter);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableRotate = false;      // it is a flat pane; rotating it is nonsense
controls.enablePan = true;
controls.enableZoom = true;
controls.minZoom = 0.6;
controls.maxZoom = 12;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyFrustum();
});

// --- Tools --------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let activeTool = 'pan';
let pointerDown = false;

function worldPointFromEvent(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(planeMesh);
    if (!hits.length || !hits[0].uv) return null;
    return {
        x: Math.floor(hits[0].uv.x * world.width),
        y: Math.floor((1 - hits[0].uv.y) * world.height),
    };
}

function applyTool(e) {
    const p = worldPointFromEvent(e);
    if (!p) return;

    if (activeTool === 'food') {
        for (let i = 0; i < 8; i++) {
            const fx = p.x + Math.round((Math.random() - 0.5) * 10);
            const fy = p.y + Math.round((Math.random() - 0.5) * 6);
            if (world.isValid(fx, fy) && !world.isDirt(fx, fy)) colony.food.push(new Food(fx, fy));
        }
    } else if (activeTool === 'dig') {
        const r = 4;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                if (world.isDirt(p.x + dx, p.y + dy)) world.set(p.x + dx, p.y + dy, TYPE_AIR);
            }
        }
    } else if (activeTool === 'fill') {
        const r = 3;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                if (world.isAir(p.x + dx, p.y + dy)) world.set(p.x + dx, p.y + dy, TYPE_DIRT);
            }
        }
    }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
    if (activeTool === 'pan' || e.button !== 0) return;
    pointerDown = true;
    applyTool(e);
});
renderer.domElement.addEventListener('pointermove', (e) => {
    if (pointerDown && activeTool !== 'pan') applyTool(e);
});
window.addEventListener('pointerup', () => { pointerDown = false; });

function setTool(tool) {
    activeTool = tool;
    // Only drag-to-pan is handed over to the tool; scroll zoom stays live so
    // you can still frame what you are working on.
    controls.enablePan = tool === 'pan';
    document.querySelectorAll('.tool-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tool === tool);
    });
    renderer.domElement.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
}

document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
});
setTool('pan');

document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        simSpeed = Number(btn.dataset.speed);
        document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
});

// --- Panels -------------------------------------------------------------

const rainToggle = document.getElementById('rainToggle');
const rainSlider = document.getElementById('rainSlider');
const foodSlider = document.getElementById('foodSlider');
const pheroToggle = document.getElementById('pheroToggle');

rainToggle.addEventListener('change', () => {
    if (rainToggle.checked) world.startRain(Number(rainSlider.value));
    else world.stopRain();
});
rainSlider.addEventListener('input', () => {
    world.rainIntensity = Number(rainSlider.value);
    document.getElementById('rain-display').textContent = Number(rainSlider.value).toFixed(2);
});
foodSlider.addEventListener('input', () => {
    colony.foodSpawnRate = Number(foodSlider.value);
    document.getElementById('food-display').textContent = Number(foodSlider.value).toFixed(3);
});
pheroToggle.addEventListener('change', () => { painter.showPheromones = pheroToggle.checked; });

for (const side of ['left', 'right']) {
    const panel = document.getElementById(`${side}-panel`);
    document.getElementById(`${side}-toggle`).addEventListener('click', () => {
        panel.classList.toggle('collapsed');
    });
}

const statEls = {};
const setStat = (id, value) => {
    if (!statEls[id]) statEls[id] = document.getElementById(id);
    if (statEls[id]) statEls[id].textContent = value;
};

function refreshStats() {
    const s = colony.census(world);
    setStat('stat-population', s.population);
    setStat('stat-forager', s.forager);
    setStat('stat-nurse', s.nurse);
    setStat('stat-digger', s.digger);
    setStat('stat-eggs', s.eggs);
    setStat('stat-larvae', s.starving ? `${s.larvae} (${s.starving} starving)` : s.larvae);
    setStat('stat-pupae', s.pupae);
    setStat('stat-food', s.food);
    setStat('stat-tunnel', s.tunnel.toLocaleString());
    setStat('stat-day', s.day);
    setStat('stat-deaths', colony.deaths);

    const status = document.getElementById('stat-status');
    if (status) {
        status.textContent = s.status;
        status.className = `value status-${s.status.toLowerCase()}`;
    }
}

// --- Loop ---------------------------------------------------------------

let frame = 0;

function animate() {
    requestAnimationFrame(animate);

    for (let i = 0; i < simSpeed; i++) {
        world.update();
        colony.update(world);
    }

    painter.render(colony);
    texture.needsUpdate = true;

    // The census walks the whole grid for tunnel volume, so it runs on its own
    // cadence rather than every frame.
    if (frame++ % 30 === 0) refreshStats();

    controls.update();
    renderer.render(scene, camera);
}

animate();
