import { RBC } from './classes/RBC.js';
import { WBC } from './classes/WBC.js';
import { Platelet } from './classes/Platelet.js';
import { Pathogen } from './classes/Pathogen.js';
import { Cholesterol } from './classes/Cholesterol.js';

// Configuration
const CONFIG = {
    rbcCount: 300,
    wbcCount: 15,
    plateletCount: 100,
    cholesterolCount: 30,
    pathogenCount: 0,
    backgroundColor: 0x220000,
};

// State
const state = {
    app: null,
    container: null,
    entities: [],
    damageZones: [],
    flowRate: 1.0,
    baseFlowRate: 1.0,
    heartBeatPhase: 0,
    vesselRadius: 0,
    activeTool: 'observe',
    isCutting: false,
    ecgData: [],
    ecgGraphics: null,
    oxygenSaturation: 98,
    totalKills: 0,
    // Adrenaline system
    adrenalineActive: false,
    adrenalineTimer: 0,
    adrenalineDuration: 300, // ~5 seconds at 60fps
    // Fever system
    feverActive: false,
    bodyTemperature: 98.6,
    feverIntensity: 0,
    // Plaque tracking
    plaqueLevel: 0
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

    // Initialize ECG trace
    initECG();

    // Spawn Entities
    for (let i = 0; i < CONFIG.plateletCount; i++) spawnPlatelet();
    for (let i = 0; i < CONFIG.rbcCount; i++) spawnRBC();
    for (let i = 0; i < CONFIG.wbcCount; i++) spawnWBC();
    for (let i = 0; i < CONFIG.cholesterolCount; i++) spawnCholesterol();

    // UI & Events
    setupUI();
    setupInteractions();

    // Loop
    state.app.ticker.add((delta) => gameLoop(delta));
}

function createBackground() {
    const fragSrc = document.getElementById('plasma-frag').textContent;
    const filter = new PIXI.Filter(null, fragSrc, {
        time: 0.0,
        resolution: [state.app.screen.width, state.app.screen.height]
    });

    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff);
    bg.drawRect(0, 0, state.app.screen.width, state.app.screen.height);
    bg.endFill();
    bg.filters = [filter];

    state.container.addChild(bg);
    state.plasmaFilter = filter;
}

function initECG() {
    // Initialize ECG data array
    state.ecgData = new Array(200).fill(0);

    // Create ECG graphics overlay - position in bottom right
    state.ecgGraphics = new PIXI.Graphics();
    state.ecgGraphics.x = state.app.screen.width - 230;
    state.ecgGraphics.y = state.app.screen.height - 80;
    state.app.stage.addChild(state.ecgGraphics);
}

function updateECG(delta) {
    // Generate realistic ECG waveform based on heartbeat phase
    const phase = state.heartBeatPhase % (Math.PI * 2);
    let value = 0;

    // P wave (atrial depolarization)
    if (phase > 0.5 && phase < 1.0) {
        value = Math.sin((phase - 0.5) * Math.PI * 2) * 0.3;
    }
    // QRS complex (ventricular depolarization)
    else if (phase > 1.2 && phase < 1.4) {
        value = -0.2; // Q wave
    } else if (phase > 1.4 && phase < 1.6) {
        value = 1.0; // R wave (spike)
    } else if (phase > 1.6 && phase < 1.8) {
        value = -0.3; // S wave
    }
    // T wave (ventricular repolarization)
    else if (phase > 2.5 && phase < 3.2) {
        value = Math.sin((phase - 2.5) * Math.PI / 0.7) * 0.4;
    }

    // Add some noise
    value += (Math.random() - 0.5) * 0.05;

    // Shift data left and add new value
    state.ecgData.shift();
    state.ecgData.push(value);

    // Draw ECG
    state.ecgGraphics.clear();

    // Background
    state.ecgGraphics.beginFill(0x000000, 0.6);
    state.ecgGraphics.drawRoundedRect(0, 0, 220, 60, 5);
    state.ecgGraphics.endFill();

    // Grid lines
    state.ecgGraphics.lineStyle(0.5, 0x00FF00, 0.2);
    for (let i = 0; i < 5; i++) {
        state.ecgGraphics.moveTo(0, 12 * i + 6);
        state.ecgGraphics.lineTo(220, 12 * i + 6);
    }

    // ECG trace
    state.ecgGraphics.lineStyle(2, 0x00FF00, 1);
    state.ecgGraphics.moveTo(10, 30);

    for (let i = 0; i < state.ecgData.length; i++) {
        const x = 10 + i;
        const y = 30 - state.ecgData[i] * 20;
        state.ecgGraphics.lineTo(x, y);
    }

    // Label
    state.ecgGraphics.lineStyle(0);
}

// Fever visual overlay
function updateFeverOverlay() {
    if (!state.feverOverlay) {
        state.feverOverlay = new PIXI.Graphics();
        state.app.stage.addChild(state.feverOverlay);
    }

    state.feverOverlay.clear();

    if (state.feverIntensity > 0.05) {
        // Red vignette that intensifies with fever
        const alpha = state.feverIntensity * 0.3;

        // Pulsing effect
        const pulse = 1 + Math.sin(state.heartBeatPhase * 2) * 0.2;

        // Draw red overlay with gradient
        state.feverOverlay.beginFill(0xFF0000, alpha * pulse);
        state.feverOverlay.drawRect(0, 0, state.app.screen.width, state.app.screen.height);
        state.feverOverlay.endFill();

        // Clear center to create vignette
        // Using a semi-transparent center
        const centerX = state.app.screen.width / 2;
        const centerY = state.app.screen.height / 2;
        const radius = Math.min(centerX, centerY) * (1.5 - state.feverIntensity * 0.5);

        // Draw lighter center
        state.feverOverlay.beginFill(0xFF0000, 0);
        state.feverOverlay.drawCircle(centerX, centerY, radius);
        state.feverOverlay.endFill();
    }
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
    state.container.addChildAt(p.sprite, 1);
}

function spawnPathogen(x, y) {
    const pathogen = new Pathogen(x, y);
    state.entities.push(pathogen);
    state.container.addChild(pathogen.sprite);

    // Flash effect when pathogen is injected
    const flash = new PIXI.Graphics();
    flash.beginFill(0xFF0000, 0.3);
    flash.drawCircle(x, y, 50);
    flash.endFill();
    state.container.addChild(flash);

    // Fade out
    let alpha = 0.3;
    const fadeInterval = setInterval(() => {
        alpha -= 0.02;
        flash.alpha = alpha;
        if (alpha <= 0) {
            clearInterval(fadeInterval);
            state.container.removeChild(flash);
        }
    }, 16);
}

function spawnCholesterol() {
    const center = state.app.screen.height / 2;
    const radius = state.vesselRadius || state.app.screen.height / 2;
    const y = center + (Math.random() - 0.5) * 2 * radius * 0.7;
    const x = Math.random() * state.app.screen.width;
    const chol = new Cholesterol(x, y);
    state.entities.push(chol);
    state.container.addChildAt(chol.sprite, 1);
}

function gameLoop(delta) {
    // ADRENALINE SYSTEM
    if (state.adrenalineActive) {
        state.adrenalineTimer -= delta;
        if (state.adrenalineTimer <= 0) {
            state.adrenalineActive = false;
            state.flowRate = state.baseFlowRate;
            state.container.x = 0;
            state.container.y = 0;
        } else {
            // Intense heart rate
            state.flowRate = state.baseFlowRate * 2.5;
            // Screen shake
            state.container.x = (Math.random() - 0.5) * 4;
            state.container.y = (Math.random() - 0.5) * 2;
        }
    }

    // FEVER SYSTEM
    if (state.feverActive) {
        // Gradually increase temperature
        if (state.bodyTemperature < 103) {
            state.bodyTemperature += 0.002 * delta;
        }
        state.feverIntensity = (state.bodyTemperature - 98.6) / 4.4; // 0 to 1
    } else {
        // Cool down
        if (state.bodyTemperature > 98.6) {
            state.bodyTemperature -= 0.005 * delta;
        }
        state.feverIntensity = Math.max(0, (state.bodyTemperature - 98.6) / 4.4);
    }

    // Heartbeat simulation
    const heartRateMultiplier = 1 + state.feverIntensity * 0.3; // Fever raises heart rate
    state.heartBeatPhase += 0.05 * state.flowRate * heartRateMultiplier * delta;
    let pulse = 1 + Math.sin(state.heartBeatPhase) * 0.2;
    let currentFlow = state.flowRate * pulse;

    // Fever boosts immune cell speed but applies stress
    const immuneBoost = 1 + state.feverIntensity * 0.5;

    if (state.plasmaFilter) {
        state.plasmaFilter.uniforms.time += 0.01 * delta * state.flowRate;
        // Add red tint during fever
        if (state.feverIntensity > 0.1) {
            // We'll handle this with a separate overlay
        }
    }

    // Update fever visual overlay
    updateFeverOverlay();

    // Update ECG
    updateECG(delta);

    // Update pulse waves (observe mode)
    if (state.pulseWaves && state.pulseWaves.length > 0) {
        updatePulseWaves(delta);
    }

    const bounds = { width: state.app.screen.width, height: state.app.screen.height };
    const center = state.app.screen.height / 2;

    // Clean up dead pathogens
    state.entities = state.entities.filter(e => {
        if (e.constructor.name === 'Pathogen' && !e.isAlive) {
            state.container.removeChild(e.sprite);
            return false;
        }
        return true;
    });

    // Update and heal damage zones (fever accelerates healing)
    updateDamageZones(delta * (1 + state.feverIntensity * 0.5));

    // Calculate plaque level
    state.plaqueLevel = state.entities.filter(e =>
        e.constructor.name === 'Cholesterol' && e.isStuck
    ).length;

    state.entities.forEach(e => {
        // WBCs get fever boost
        let entityFlow = currentFlow;
        if (e.constructor.name === 'WBC' && state.feverIntensity > 0) {
            entityFlow *= immuneBoost;
        }
        e.update(delta, bounds, entityFlow, center, state.vesselRadius, state.damageZones, state.entities);
    });


    // UI Updates (throttled)
    if (frameCount % 30 === 0) {
        // RBC count
        const rbcCount = state.entities.filter(e => e.constructor.name === 'RBC').length;
        document.getElementById('count-rbc').innerText = rbcCount;

        // Clotting status
        const clots = state.entities.filter(e => e.state === 'clumping').length;
        const statusEl = document.getElementById('val-status');
        statusEl.innerText = clots > 10 ? 'Clotting' : 'Normal';
        statusEl.style.color = clots > 10 ? '#ef4444' : 'white';

        // Pathogen count
        const pathogenCount = state.entities.filter(e => e.constructor.name === 'Pathogen' && e.isAlive).length;
        const pathogenEl = document.getElementById('count-pathogen');
        if (pathogenEl) {
            pathogenEl.innerText = pathogenCount;
            pathogenEl.style.color = pathogenCount > 10 ? '#ef4444' : pathogenCount > 0 ? '#fbbf24' : '#22c55e';
        }

        // Total kills by WBCs
        state.totalKills = state.entities
            .filter(e => e.constructor.name === 'WBC')
            .reduce((sum, wbc) => sum + wbc.killCount, 0);
        const killsEl = document.getElementById('count-kills');
        if (killsEl) killsEl.innerText = state.totalKills;

        // O2 Saturation (affected by pathogen count)
        // More pathogens = inflammation = lower O2 delivery
        const baseO2 = 98;
        const pathogenPenalty = pathogenCount * 0.5;
        const clotPenalty = clots * 0.3;
        state.oxygenSaturation = Math.max(85, baseO2 - pathogenPenalty - clotPenalty);

        const o2El = document.getElementById('val-o2');
        o2El.innerText = `${Math.round(state.oxygenSaturation)}%`;
        o2El.style.color = state.oxygenSaturation < 92 ? '#ef4444' :
            state.oxygenSaturation < 95 ? '#fbbf24' : 'white';

        // Temperature display
        const tempEl = document.getElementById('val-temp');
        if (tempEl) {
            tempEl.innerText = `${state.bodyTemperature.toFixed(1)}°F`;
            tempEl.style.color = state.bodyTemperature > 101 ? '#ef4444' :
                state.bodyTemperature > 99 ? '#fbbf24' : 'white';
        }

        // Plaque level display
        const plaqueEl = document.getElementById('val-plaque');
        if (plaqueEl) {
            const plaquePercent = Math.min(100, Math.round(state.plaqueLevel / CONFIG.cholesterolCount * 100));
            plaqueEl.innerText = `${plaquePercent}%`;
            plaqueEl.style.color = plaquePercent > 60 ? '#ef4444' :
                plaquePercent > 30 ? '#fbbf24' : '#22c55e';
        }
    }

    // Blood Pressure (affected by plaque)
    if (frameCount % 10 === 0) {
        // Plaque increases blood pressure
        const plaqueFactor = 1 + (state.plaqueLevel / CONFIG.cholesterolCount) * 0.5;
        const baseSys = 120 * state.flowRate * plaqueFactor;
        const baseDia = 80 * (0.5 + state.flowRate * 0.5) * plaqueFactor;
        const dispSys = Math.round(baseSys);
        const dispDia = Math.round(baseDia);

        const bpLabel = document.getElementById('val-bp');
        bpLabel.innerText = `${dispSys}/${dispDia}`;

        if (dispSys > 160) {
            bpLabel.style.color = '#ef4444';
            if (dispSys > 190 && Math.random() < 0.05) {
                const x = Math.random() * state.app.screen.width;
                const r = state.vesselRadius;
                const y = Math.random() > 0.5 ? center - r + 30 : center + r - 30;
                createDamage(x, y);
                state.container.x = (Math.random() - 0.5) * 10;
                setTimeout(() => state.container.x = 0, 100);
            }
        } else {
            bpLabel.style.color = 'white';
        }

        // Update heart rate display (affected by adrenaline and fever)
        const effectiveHR = Math.floor(60 * state.flowRate * (1 + state.feverIntensity * 0.3));
        document.getElementById('val-hr').innerText = effectiveHR;
        document.getElementById('val-hr').style.color =
            state.adrenalineActive ? '#f97316' :
                effectiveHR > 100 ? '#fbbf24' : 'white';
    }

    frameCount++;
}
let frameCount = 0;

function createDamage(x, y) {
    // Vary the wound appearance
    const woundType = Math.floor(Math.random() * 3); // 0=slash, 1=puncture, 2=tear
    const woundGraphics = new PIXI.Graphics();
    const size = 15 + Math.random() * 20;
    const angle = Math.random() * Math.PI;

    if (woundType === 0) {
        // Slash wound - diagonal cut
        woundGraphics.lineStyle(3 + Math.random() * 2, 0x8B0000, 0.9);
        woundGraphics.moveTo(x - Math.cos(angle) * size, y - Math.sin(angle) * size);
        woundGraphics.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);

        // Blood seeping
        woundGraphics.lineStyle(1.5, 0x660000, 0.6);
        for (let i = 0; i < 3; i++) {
            const offset = (Math.random() - 0.5) * size;
            woundGraphics.moveTo(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset);
            woundGraphics.lineTo(
                x + Math.cos(angle) * offset + (Math.random() - 0.5) * 10,
                y + Math.sin(angle) * offset + Math.random() * 10
            );
        }
    } else if (woundType === 1) {
        // Puncture wound - circular with rough edges
        woundGraphics.beginFill(0x660000, 0.8);
        woundGraphics.drawCircle(x, y, size * 0.4);
        woundGraphics.endFill();

        // Jagged ring around it
        woundGraphics.lineStyle(2, 0x8B0000, 0.7);
        const points = 8 + Math.floor(Math.random() * 4);
        for (let i = 0; i < points; i++) {
            const a = (i / points) * Math.PI * 2;
            const r = size * 0.4 + Math.random() * 8;
            if (i === 0) {
                woundGraphics.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            } else {
                woundGraphics.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            }
        }
    } else {
        // Tear wound - irregular shape
        woundGraphics.beginFill(0x550000, 0.7);
        woundGraphics.moveTo(x, y - size * 0.5);
        woundGraphics.bezierCurveTo(
            x + size * 0.6, y - size * 0.3,
            x + size * 0.4, y + size * 0.4,
            x, y + size * 0.5
        );
        woundGraphics.bezierCurveTo(
            x - size * 0.5, y + size * 0.2,
            x - size * 0.6, y - size * 0.3,
            x, y - size * 0.5
        );
        woundGraphics.endFill();

        // Highlight edge
        woundGraphics.lineStyle(1.5, 0xAA0000, 0.5);
        woundGraphics.drawEllipse(x, y, size * 0.3, size * 0.5);
    }

    // Tissue damage glow
    woundGraphics.lineStyle(0);
    woundGraphics.beginFill(0xFF0000, 0.15);
    woundGraphics.drawCircle(x, y, size * 1.5);
    woundGraphics.endFill();

    state.container.addChild(woundGraphics);
    if (state.container.children.length > 1) {
        state.container.setChildIndex(woundGraphics, 1);
    }

    // Create damage zone with healing properties
    state.damageZones.push({
        x: x,
        y: y,
        radius: size + 10,
        graphics: woundGraphics,
        healProgress: 0, // 0 to 1
        healRate: 0.0002 + Math.random() * 0.0003, // Variable healing speed
        clotLevel: 0 // Increases as platelets gather
    });
}

function updateDamageZones(delta) {
    for (let i = state.damageZones.length - 1; i >= 0; i--) {
        const zone = state.damageZones[i];

        // Count platelets in this zone (accelerates healing)
        let plateletsInZone = 0;
        for (const e of state.entities) {
            if (e.state === 'clumping') {
                const dx = e.x - zone.x;
                const dy = e.y - zone.y;
                if (dx * dx + dy * dy < zone.radius * zone.radius) {
                    plateletsInZone++;
                }
            }
        }

        // Clot formation accelerates healing
        zone.clotLevel = Math.min(1, plateletsInZone / 15);

        // Healing progress
        const healBonus = 1 + zone.clotLevel * 2; // Up to 3x faster with full clot
        zone.healProgress += zone.healRate * healBonus * delta;

        // Visual healing - fade out wound graphics
        if (zone.graphics) {
            zone.graphics.alpha = 1 - zone.healProgress;

            // Add pink scar tissue overlay as it heals
            if (zone.healProgress > 0.5 && !zone.scarDrawn) {
                zone.scarDrawn = true;
                const scar = new PIXI.Graphics();
                scar.beginFill(0xDDA0A0, 0.3);
                scar.drawEllipse(zone.x, zone.y, zone.radius * 0.3, zone.radius * 0.15);
                scar.endFill();
                state.container.addChild(scar);
                zone.scarGraphics = scar;
            }
        }

        // Wound fully healed
        if (zone.healProgress >= 1) {
            // Remove wound graphics
            if (zone.graphics) {
                state.container.removeChild(zone.graphics);
            }
            // Fade out scar
            if (zone.scarGraphics) {
                let scarAlpha = zone.scarGraphics.alpha;
                const fadeInterval = setInterval(() => {
                    scarAlpha -= 0.02;
                    zone.scarGraphics.alpha = scarAlpha;
                    if (scarAlpha <= 0) {
                        clearInterval(fadeInterval);
                        state.container.removeChild(zone.scarGraphics);
                    }
                }, 50);
            }
            // Remove from array
            state.damageZones.splice(i, 1);
        }
    }
}

function setupUI() {
    const flowSlider = document.getElementById('flowSlider');
    flowSlider.addEventListener('input', (e) => {
        state.baseFlowRate = parseFloat(e.target.value);
        if (!state.adrenalineActive) {
            state.flowRate = state.baseFlowRate;
        }
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

    // Adrenaline button
    const adrenalineBtn = document.getElementById('btn-adrenaline');
    if (adrenalineBtn) {
        adrenalineBtn.addEventListener('click', () => {
            if (!state.adrenalineActive) {
                state.adrenalineActive = true;
                state.adrenalineTimer = state.adrenalineDuration;
                adrenalineBtn.classList.add('active');

                // Visual flash
                const flash = new PIXI.Graphics();
                flash.beginFill(0xFFAA00, 0.4);
                flash.drawRect(0, 0, state.app.screen.width, state.app.screen.height);
                flash.endFill();
                state.app.stage.addChild(flash);

                let alpha = 0.4;
                const fadeInterval = setInterval(() => {
                    alpha -= 0.03;
                    flash.alpha = alpha;
                    if (alpha <= 0) {
                        clearInterval(fadeInterval);
                        state.app.stage.removeChild(flash);
                    }
                }, 16);

                // Remove active class after duration
                setTimeout(() => {
                    adrenalineBtn.classList.remove('active');
                }, state.adrenalineDuration * 16);
            }
        });
    }

    // Fever toggle
    const feverBtn = document.getElementById('btn-fever');
    if (feverBtn) {
        feverBtn.addEventListener('click', () => {
            state.feverActive = !state.feverActive;
            feverBtn.classList.toggle('active', state.feverActive);
        });
    }
}

function setupInteractions() {
    state.app.stage.eventMode = 'static';
    state.app.stage.hitArea = state.app.screen;

    // Tooltip for cell inspection
    state.tooltip = new PIXI.Graphics();
    state.tooltipText = new PIXI.Text('', {
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 12,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: 180
    });
    state.tooltip.visible = false;
    state.tooltipText.visible = false;
    state.app.stage.addChild(state.tooltip);
    state.app.stage.addChild(state.tooltipText);

    // Pulse waves array
    state.pulseWaves = [];

    state.app.stage.on('pointerdown', (e) => {
        if (state.activeTool === 'cut') {
            createDamage(e.global.x, e.global.y);
        } else if (state.activeTool === 'inject') {
            const count = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                const offsetX = (Math.random() - 0.5) * 60;
                const offsetY = (Math.random() - 0.5) * 60;
                spawnPathogen(e.global.x + offsetX, e.global.y + offsetY);
            }
        } else if (state.activeTool === 'observe') {
            // Create pulse wave
            createPulseWave(e.global.x, e.global.y);
        }
    });

    // Hover tracking for tooltip
    state.app.stage.on('pointermove', (e) => {
        if (state.activeTool === 'observe') {
            updateCellInspector(e.global.x, e.global.y);
        } else {
            state.tooltip.visible = false;
            state.tooltipText.visible = false;
        }
    });
}

// Cell Inspector - shows tooltip with cell info on hover
function updateCellInspector(mouseX, mouseY) {
    let hoveredCell = null;
    let minDist = 30; // Detection radius

    // Find closest cell to mouse
    for (const e of state.entities) {
        const dx = e.x - mouseX;
        const dy = e.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
            minDist = dist;
            hoveredCell = e;
        }
    }

    if (hoveredCell) {
        // Build tooltip content based on cell type
        let info = '';
        const type = hoveredCell.constructor.name;

        if (type === 'RBC') {
            info = `🔴 RED BLOOD CELL\n`;
            info += `━━━━━━━━━━━━━━\n`;
            info += `Carrying oxygen\n`;
            info += `Speed: ${(hoveredCell.sprite.scale.x * 100).toFixed(0)}%\n`;
            info += `Rotation: ${(hoveredCell.angle * 180 / Math.PI).toFixed(0)}°`;
        } else if (type === 'WBC') {
            info = `⚪ WHITE BLOOD CELL\n`;
            info += `━━━━━━━━━━━━━━\n`;
            info += `Type: ${hoveredCell.type}\n`;
            info += `State: ${hoveredCell.state}\n`;
            info += `Kills: ${hoveredCell.killCount}`;
            if (hoveredCell.target) {
                info += `\n🎯 Hunting target!`;
            }
        } else if (type === 'Platelet') {
            info = `🟡 PLATELET\n`;
            info += `━━━━━━━━━━━━━━\n`;
            info += `State: ${hoveredCell.state}\n`;
            if (hoveredCell.state === 'clumping') {
                info += `Clot time: ${Math.floor(hoveredCell.clotLife / 60)}s\n`;
                info += `🩹 Forming clot!`;
            }
        } else if (type === 'Pathogen') {
            info = `🦠 PATHOGEN\n`;
            info += `━━━━━━━━━━━━━━\n`;
            info += `Type: ${hoveredCell.type}\n`;
            info += `Status: ${hoveredCell.beingEngulfed ? '⚠️ Being engulfed!' : 'Active'}\n`;
            if (hoveredCell.beingEngulfed) {
                info += `Engulf: ${(hoveredCell.engulfProgress * 100).toFixed(0)}%`;
            }
        } else if (type === 'Cholesterol') {
            info = `🟡 CHOLESTEROL\n`;
            info += `━━━━━━━━━━━━━━\n`;
            info += `Status: ${hoveredCell.isStuck ? '⚠️ Stuck to wall!' : 'Floating'}\n`;
            info += `Size: ${hoveredCell.size.toFixed(1)}px`;
            if (hoveredCell.isStuck) {
                info += `\nTime stuck: ${Math.floor(hoveredCell.stuckTime / 60)}s`;
            }
        }

        // Draw tooltip background
        state.tooltip.clear();
        state.tooltip.beginFill(0x000000, 0.85);
        state.tooltip.lineStyle(1, 0x666666, 0.8);

        // Position tooltip near mouse but keep on screen
        let tooltipX = mouseX + 20;
        let tooltipY = mouseY - 60;

        // Keep on screen
        if (tooltipX + 200 > state.app.screen.width) tooltipX = mouseX - 210;
        if (tooltipY < 10) tooltipY = mouseY + 20;

        state.tooltip.drawRoundedRect(0, 0, 200, 90, 6);
        state.tooltip.endFill();
        state.tooltip.x = tooltipX;
        state.tooltip.y = tooltipY;
        state.tooltip.visible = true;

        // Update text
        state.tooltipText.text = info;
        state.tooltipText.x = tooltipX + 10;
        state.tooltipText.y = tooltipY + 8;
        state.tooltipText.visible = true;

        // Highlight the cell
        hoveredCell.sprite.alpha = 1.2; // Slight brightness boost
    } else {
        state.tooltip.visible = false;
        state.tooltipText.visible = false;
    }
}

// Pulse Wave - creates a visible pressure wave that pushes cells
function createPulseWave(x, y) {
    const wave = {
        x: x,
        y: y,
        radius: 10,
        maxRadius: 200,
        speed: 8,
        alpha: 0.8,
        graphics: new PIXI.Graphics()
    };

    state.container.addChild(wave.graphics);
    state.pulseWaves.push(wave);

    // Sound-like visual ping at origin
    const ping = new PIXI.Graphics();
    ping.beginFill(0x00FFFF, 0.6);
    ping.drawCircle(x, y, 15);
    ping.endFill();
    state.container.addChild(ping);

    // Fade ping
    let pingAlpha = 0.6;
    const pingFade = setInterval(() => {
        pingAlpha -= 0.05;
        ping.alpha = pingAlpha;
        if (pingAlpha <= 0) {
            clearInterval(pingFade);
            state.container.removeChild(ping);
        }
    }, 16);
}

// Update pulse waves in game loop
function updatePulseWaves(delta) {
    for (let i = state.pulseWaves.length - 1; i >= 0; i--) {
        const wave = state.pulseWaves[i];

        // Expand the wave
        wave.radius += wave.speed * delta;
        wave.alpha = 0.8 * (1 - wave.radius / wave.maxRadius);

        // Draw the wave ring
        wave.graphics.clear();
        wave.graphics.lineStyle(3, 0x00FFFF, wave.alpha);
        wave.graphics.drawCircle(wave.x, wave.y, wave.radius);

        // Inner ring
        wave.graphics.lineStyle(1, 0x88FFFF, wave.alpha * 0.5);
        wave.graphics.drawCircle(wave.x, wave.y, wave.radius * 0.8);

        // Push cells that the wave passes through
        const waveRingInner = wave.radius - 20;
        const waveRingOuter = wave.radius + 10;

        for (const e of state.entities) {
            const dx = e.x - wave.x;
            const dy = e.y - wave.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // If entity is in the wave ring, push it outward
            if (dist > waveRingInner && dist < waveRingOuter && dist > 0) {
                const pushStrength = 3 * wave.alpha;
                const nx = dx / dist;
                const ny = dy / dist;

                e.x += nx * pushStrength * delta;
                e.y += ny * pushStrength * delta;

                // Add some spin/tumble
                if (e.angle !== undefined) {
                    e.angle += (Math.random() - 0.5) * 0.2;
                }
                if (e.rotSpeed !== undefined) {
                    e.rotSpeed += (Math.random() - 0.5) * 0.1;
                }
            }
        }

        // Remove wave when fully expanded
        if (wave.radius >= wave.maxRadius) {
            state.container.removeChild(wave.graphics);
            state.pulseWaves.splice(i, 1);
        }
    }
}

// Start
init();
