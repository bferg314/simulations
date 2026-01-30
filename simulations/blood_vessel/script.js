import { RBC } from './classes/RBC.js';
import { WBC } from './classes/WBC.js';
import { Platelet } from './classes/Platelet.js';

// Configuration
const CONFIG = {
    rbcCount: 300,
    wbcCount: 15,
    plateletCount: 100,
    backgroundColor: 0x220000,
};

// State
const state = {
    app: null,
    container: null,
    entities: [],
    damageZones: [], // {x, y, radius, freshness}
    flowRate: 1.0,
    heartBeatPhase: 0,
    vesselRadius: 0,
    activeTool: 'observe',
    isCutting: false
};

async function init() {
    const canvasContainer = document.getElementById('canvas-container');

    state.app = new PIXI.Application({
        resizeTo: window,
        backgroundColor: CONFIG.backgroundColor,
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
    });

    canvasContainer.appendChild(state.app.view);

    // Main Container
    state.container = new PIXI.Container();
    state.app.stage.addChild(state.container);

    state.vesselRadius = state.app.screen.height / 2;

    // Background (Shader)
    createBackground();

    // Spawn Entities
    // Order matters for layering (Platelets bottom, then RBC, then WBC)
    for (let i = 0; i < CONFIG.plateletCount; i++) spawnPlatelet();
    for (let i = 0; i < CONFIG.rbcCount; i++) spawnRBC();
    for (let i = 0; i < CONFIG.wbcCount; i++) spawnWBC();

    // UI & Events
    setupUI();
    setupInteractions();

    // Loop
    state.app.ticker.add((delta) => gameLoop(delta));
}

function createBackground() {
    // Load shader code from HTML
    const fragSrc = document.getElementById('plasma-frag').textContent;
    const filter = new PIXI.Filter(null, fragSrc, {
        time: 0.0,
        resolution: [state.app.screen.width, state.app.screen.height]
    });

    // Background rect
    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff); // This fill is ignored by shader usually, but needed for geometry
    bg.drawRect(0, 0, state.app.screen.width, state.app.screen.height);
    bg.endFill();
    bg.filters = [filter];

    state.container.addChild(bg);
    state.plasmaFilter = filter;
}

function spawnRBC() {
    const y = Math.random() * state.app.screen.height;
    const x = Math.random() * state.app.screen.width;
    const rbc = new RBC(x, y);
    state.entities.push(rbc);
    state.container.addChild(rbc.sprite);
}

function spawnWBC() {
    const y = Math.random() * state.app.screen.height;
    const x = Math.random() * state.app.screen.width;
    const wbc = new WBC(x, y);
    state.entities.push(wbc);
    state.container.addChild(wbc.sprite);
}

function spawnPlatelet() {
    const y = Math.random() * state.app.screen.height;
    const x = Math.random() * state.app.screen.width;
    const p = new Platelet(x, y);
    state.entities.push(p);
    state.container.addChildAt(p.sprite, 1); // Add behind cells but above BG
}

function gameLoop(delta) {
    // Heartbeat simulation
    state.heartBeatPhase += 0.05 * state.flowRate * delta;
    // Pulse flow slightly
    let pulse = 1 + Math.sin(state.heartBeatPhase) * 0.2;
    let currentFlow = state.flowRate * pulse;

    if (state.plasmaFilter) {
        state.plasmaFilter.uniforms.time += 0.01 * delta * state.flowRate;
    }

    const bounds = { width: state.app.screen.width, height: state.app.screen.height };
    const center = state.app.screen.height / 2;

    // Process Damage Zones
    // (Fade visuals or heal logic could go here)

    state.entities.forEach(e => {
        // Pass damageZones AND all entities (for collision)
        e.update(delta, bounds, currentFlow, center, state.vesselRadius, state.damageZones, state.entities);
    });

    // UI Updates
    if (frameCount % 60 === 0) { // Optimize dom updates
        document.getElementById('count-rbc').innerText = state.entities.filter(e => e instanceof RBC).length;

        let clots = state.entities.filter(e => e.state === 'clumping').length;
        document.getElementById('val-status').innerText = clots > 10 ? 'Clotting' : 'Normal';
    }

    // DYNAMIC BLOOD PRESSURE LOGIC and VISUALS
    if (frameCount % 10 === 0) {
        // Base pressures derived from Flow Rate
        const baseSys = 120 * state.flowRate;
        const baseDia = 80 * (0.5 + state.flowRate * 0.5);

        // Update UI logic
        const dispSys = Math.round(baseSys);
        const dispDia = Math.round(baseDia);

        const bpLabel = document.getElementById('val-bp');
        bpLabel.innerText = `${dispSys}/${dispDia}`;

        // Hypertension Effects
        if (dispSys > 160) {
            bpLabel.style.color = '#ef4444'; // Red alert

            // SPONTANEOUS DAMAGE RISK (Small chance to rupture if > 190)
            if (dispSys > 190 && Math.random() < 0.05) {
                const x = Math.random() * state.app.screen.width;
                const r = state.vesselRadius;
                const center = state.app.screen.height / 2;
                const y = Math.random() > 0.5 ? center - r + 30 : center + r - 30;
                createDamage(x, y);

                // Visual shake
                state.container.x = (Math.random() - 0.5) * 10;
                setTimeout(() => state.container.x = 0, 100);
            }
        } else {
            bpLabel.style.color = 'white';
        }
    }
    frameCount++;
}
let frameCount = 0;

function createDamage(x, y) {
    const cut = new PIXI.Graphics();
    cut.lineStyle(4, 0x8B0000, 0.8);
    cut.moveTo(x - 20, y - 10);
    cut.lineTo(x + 20, y + 10);
    // Rough edges
    cut.lineStyle(2, 0xFFFFFF, 0.5);
    cut.moveTo(x - 15, y - 5);
    cut.lineTo(x + 15, y + 5);

    state.container.addChild(cut);
    // Try to set index 1 (above BG), but safely
    if (state.container.children.length > 1) {
        state.container.setChildIndex(cut, 1);
    }

    state.damageZones.push({
        x: x,
        y: y,
        radius: 40
    });
}

function setupUI() {
    const flowSlider = document.getElementById('flowSlider');
    flowSlider.addEventListener('input', (e) => {
        state.flowRate = parseFloat(e.target.value);
        document.getElementById('val-hr').innerText = Math.floor(60 * state.flowRate);
    });

    // Tools
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTool = btn.dataset.tool;
        });
    });
}

function setupInteractions() {
    state.app.stage.eventMode = 'static';
    state.app.stage.hitArea = state.app.screen;

    state.app.stage.on('pointerdown', (e) => {
        if (state.activeTool === 'cut') {
            createDamage(e.global.x, e.global.y);
        }
    });
}

// Start
init();
