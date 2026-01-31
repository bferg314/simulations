import { Bacteria } from './classes/Bacteria.js';
import { Paramecium } from './classes/Paramecium.js';
import { Algae } from './classes/Algae.js';
import { Amoeba } from './classes/Amoeba.js';
import { Euglena } from './classes/Euglena.js';
import { Rotifer } from './classes/Rotifer.js';
import { Detritus } from './classes/Detritus.js';
import { Hydra } from './classes/Hydra.js';

// Configuration
const CONFIG = {
    bacteriaCount: 150,
    parameciaCount: 10,
    algaeCount: 35,
    amoebaCount: 2,
    euglenaCount: 8,
    rotiferCount: 4,
    hydraCount: 2,
    backgroundColor: 0x051a26,
    zoomedBackgroundColor: 0x0a2e3d,
    dayNightCycleSpeed: 0.0005,
    maxEuglena: 30,
    maxRotifer: 12,
    maxHydra: 5,
};

// State
const state = {
    app: null,
    container: null,
    entities: [],
    oxygenBubbles: [],
    motionTrails: [],
    zoom: 1.0,
    activeTool: 'cursor',
    lightIntensity: 1.0,
    tooltip: null,
    tooltipText: null,
    timeOfDay: 0.5,
    dayNightEnabled: true,
    temperature: 1.0,
    frameCount: 0,
    // Speed control
    simulationSpeed: 1.0,
    paused: false,
    // Vortex
    vortex: null,
    vortexGraphics: null,
    // Population history for graph
    populationHistory: [],
    populationGraphCanvas: null,
    // Panning
    isPanning: false,
    panStart: { x: 0, y: 0 },
};

// Initialize Pixi App
async function init() {
    const canvasContainer = document.getElementById('canvas-container');

    state.app = new PIXI.Application({
        resizeTo: window,
        backgroundColor: CONFIG.backgroundColor,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
    });

    canvasContainer.appendChild(state.app.view);

    // Create a main container for the world to handle zoom/pan
    state.container = new PIXI.Container();
    state.container.sortableChildren = true;
    state.app.stage.addChild(state.container);

    // Add background effects (Caustic Shader)
    createBackground();

    // Create vortex graphics (hidden initially)
    state.vortexGraphics = new PIXI.Graphics();
    state.container.addChild(state.vortexGraphics);

    // Spawn initial life
    spawnBacteria(CONFIG.bacteriaCount);
    spawnParamecia(CONFIG.parameciaCount);
    spawnAlgae(CONFIG.algaeCount);
    spawnAmoebas(CONFIG.amoebaCount);
    spawnEuglena(CONFIG.euglenaCount);
    spawnRotifers(CONFIG.rotiferCount);
    spawnHydras(CONFIG.hydraCount);

    // Setup Event Listeners
    setupInteractions();
    setupUI();

    // Setup organism inspector
    setupOrganismInspector();

    // Setup population graph
    setupPopulationGraph();

    // Start Loop
    state.app.ticker.add((delta) => gameLoop(delta));
}

function createBackground() {
    // Load shader from HTML script tag
    const shaderFrag = document.getElementById('caustic-frag').textContent;

    // Create filter
    // Note: In Pixi v7 Filter constructor takes (vertexSrc, fragmentSrc, uniforms)
    // We use default vertex by passing null or undefined
    const causticFilter = new PIXI.Filter(null, shaderFrag, {
        time: 0.0,
        resolution: [state.app.screen.width, state.app.screen.height],
        uSampler: PIXI.Texture.WHITE // Not strictly needed as Pixi handles uSampler
    });

    // Apply to a background sprite or the container. 
    // Applying to the whole container might be heavy if many objects. 
    // Better to apply to a large background tiling sprite.

    const bg = new PIXI.Graphics();
    bg.beginFill(0x051a26);
    bg.drawRect(0, 0, 4000, 4000); // Large enough world
    bg.endFill();

    // We want the shader to affect the "water", so let's put it on the background
    bg.filters = [causticFilter];

    // Add to container at bottom
    state.container.addChildAt(bg, 0);

    // Keep reference to update time
    state.causticFilter = causticFilter;
}

function spawnBacteria(count, originX, originY) {
    for (let i = 0; i < count; i++) {
        let x, y;

        if (originX !== undefined && originY !== undefined) {
            // Spawn in a small cluster around the click, e.g. radius 50
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 50;
            x = originX + Math.cos(angle) * dist;
            y = originY + Math.sin(angle) * dist;
        } else {
            x = Math.random() * state.app.screen.width;
            y = Math.random() * state.app.screen.height;
        }

        const bacteria = new Bacteria(x, y);
        state.entities.push(bacteria);
        state.container.addChild(bacteria.graphics);
    }
    updateStats();
}

function spawnParamecia(count) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * state.app.screen.width;
        const y = Math.random() * state.app.screen.height;
        const p = new Paramecium(x, y);
        state.entities.push(p);
        state.container.addChild(p.graphics);
    }
    updateStats();
}

function spawnAlgae(count) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * state.app.screen.width;
        const y = Math.random() * state.app.screen.height;
        const a = new Algae(x, y);
        state.entities.push(a);
        state.container.addChild(a.graphics);
    }
    updateStats();
}

function spawnAmoebas(count) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * state.app.screen.width;
        const y = Math.random() * state.app.screen.height;
        const a = new Amoeba(x, y);
        state.entities.push(a);
        state.container.addChild(a.graphics);
    }
    updateStats();
}

function spawnEuglena(count) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * state.app.screen.width;
        const y = Math.random() * state.app.screen.height;
        const e = new Euglena(x, y);
        state.entities.push(e);
        state.container.addChild(e.graphics);
    }
    updateStats();
}

function spawnRotifers(count) {
    for (let i = 0; i < count; i++) {
        const x = Math.random() * state.app.screen.width;
        const y = Math.random() * state.app.screen.height;
        const r = new Rotifer(x, y);
        state.entities.push(r);
        state.container.addChild(r.graphics);
    }
    updateStats();
}

function spawnHydras(count) {
    for (let i = 0; i < count; i++) {
        // Hydras attach near bottom of screen
        const x = 100 + Math.random() * (state.app.screen.width - 200);
        const y = state.app.screen.height - 80 - Math.random() * 100;
        const h = new Hydra(x, y);
        state.entities.push(h);
        state.container.addChild(h.graphics);
    }
    updateStats();
}

function spawnDetritus(x, y, size) {
    const d = new Detritus(x, y, size);
    state.entities.push(d);
    state.container.addChild(d.graphics);
}

function createOxygenBubble(x, y) {
    const bubble = {
        x: x,
        y: y,
        vy: -0.5 - Math.random() * 0.5, // Float upward
        vx: (Math.random() - 0.5) * 0.3,
        size: 2 + Math.random() * 3,
        life: 200 + Math.random() * 100,
        graphics: new PIXI.Graphics()
    };

    bubble.graphics.beginFill(0xAAFFFF, 0.4);
    bubble.graphics.lineStyle(1, 0xFFFFFF, 0.3);
    bubble.graphics.drawCircle(0, 0, bubble.size);
    bubble.graphics.endFill();

    // Highlight
    bubble.graphics.beginFill(0xFFFFFF, 0.5);
    bubble.graphics.drawCircle(-bubble.size * 0.3, -bubble.size * 0.3, bubble.size * 0.3);
    bubble.graphics.endFill();

    bubble.graphics.x = x;
    bubble.graphics.y = y;

    state.container.addChild(bubble.graphics);
    state.oxygenBubbles.push(bubble);
}

function updateOxygenBubbles(delta) {
    for (let i = state.oxygenBubbles.length - 1; i >= 0; i--) {
        const bubble = state.oxygenBubbles[i];

        // Wobble and rise
        bubble.vx += (Math.random() - 0.5) * 0.05;
        bubble.vx *= 0.98;

        bubble.x += bubble.vx * delta;
        bubble.y += bubble.vy * delta;
        bubble.life -= delta;

        // Update graphics
        bubble.graphics.x = bubble.x;
        bubble.graphics.y = bubble.y;
        bubble.graphics.alpha = Math.min(1, bubble.life / 50);

        // Slight grow as it rises
        const scale = 1 + (200 - bubble.life) / 400;
        bubble.graphics.scale.set(scale);

        // Remove when dead or off screen
        if (bubble.life <= 0 || bubble.y < -20) {
            state.container.removeChild(bubble.graphics);
            state.oxygenBubbles.splice(i, 1);
        }
    }
}

function createParticleBurst(x, y, color) {
    const particleCount = 5;
    for (let i = 0; i < particleCount; i++) {
        const p = new PIXI.Graphics();
        p.beginFill(color);
        p.drawCircle(0, 0, 2);
        p.endFill();
        p.x = x;
        p.y = y;
        state.container.addChild(p);

        // Simple physics for particle
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 1;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        let life = 1.0;

        const animateParticle = () => {
            life -= 0.05;
            p.x += vx;
            p.y += vy;
            p.alpha = life;

            if (life > 0) {
                requestAnimationFrame(animateParticle);
            } else {
                state.container.removeChild(p);
            }
        };
        requestAnimationFrame(animateParticle);
    }
}

// Motion trail system
function createMotionTrail(x, y, color, size) {
    const trail = {
        x: x,
        y: y,
        color: color,
        size: Math.max(2, size * 0.3),
        alpha: 0.4,
        graphics: new PIXI.Graphics()
    };

    trail.graphics.beginFill(color, trail.alpha);
    trail.graphics.drawCircle(0, 0, trail.size);
    trail.graphics.endFill();
    trail.graphics.x = x;
    trail.graphics.y = y;

    state.container.addChildAt(trail.graphics, 0); // Behind everything
    state.motionTrails.push(trail);

    // Limit trail count
    if (state.motionTrails.length > 100) {
        const old = state.motionTrails.shift();
        state.container.removeChild(old.graphics);
    }
}

function updateMotionTrails(delta) {
    for (let i = state.motionTrails.length - 1; i >= 0; i--) {
        const trail = state.motionTrails[i];
        trail.alpha -= 0.02 * delta;
        trail.graphics.alpha = trail.alpha;

        if (trail.alpha <= 0) {
            state.container.removeChild(trail.graphics);
            state.motionTrails.splice(i, 1);
        }
    }
}

// Vortex effect
function updateVortex(delta) {
    if (!state.vortex) {
        state.vortexGraphics.clear();
        return;
    }

    state.vortex.phase += 0.1 * delta;
    state.vortex.life -= delta;

    // Draw swirling vortex
    state.vortexGraphics.clear();
    const alpha = Math.min(0.5, state.vortex.life / 50);

    for (let ring = 0; ring < 4; ring++) {
        const radius = state.vortex.radius * (0.3 + ring * 0.25);
        state.vortexGraphics.lineStyle(2 - ring * 0.3, 0x66aaff, alpha * (1 - ring * 0.2));
        state.vortexGraphics.beginFill(0, 0);

        // Spiral shape
        const points = [];
        for (let i = 0; i <= 32; i++) {
            const angle = (i / 32) * Math.PI * 2 + state.vortex.phase + ring * 0.5;
            const r = radius + Math.sin(angle * 3 + state.vortex.phase) * 5;
            points.push({
                x: state.vortex.x + Math.cos(angle) * r,
                y: state.vortex.y + Math.sin(angle) * r
            });
        }

        if (points.length > 0) {
            state.vortexGraphics.moveTo(points[0].x, points[0].y);
            for (const pt of points) {
                state.vortexGraphics.lineTo(pt.x, pt.y);
            }
        }
    }

    // Apply vortex force to entities
    for (const entity of state.entities) {
        const dx = state.vortex.x - entity.x;
        const dy = state.vortex.y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < state.vortex.radius && dist > 10) {
            // Swirl force (tangential + inward)
            const force = (state.vortex.radius - dist) / state.vortex.radius * 0.3;
            const angle = Math.atan2(dy, dx);

            // Tangential (perpendicular to center)
            entity.vx = (entity.vx || 0) + Math.cos(angle + Math.PI / 2) * force * delta;
            entity.vy = (entity.vy || 0) + Math.sin(angle + Math.PI / 2) * force * delta;

            // Slight pull inward
            entity.vx += (dx / dist) * force * 0.3 * delta;
            entity.vy += (dy / dist) * force * 0.3 * delta;
        }
    }

    // Remove vortex when expired
    if (state.vortex.life <= 0) {
        state.vortex = null;
    }
}

function createVortex(x, y) {
    state.vortex = {
        x: x,
        y: y,
        radius: 120,
        phase: 0,
        life: 100
    };
}

// Population graph
function setupPopulationGraph() {
    const graphContainer = document.getElementById('population-graph');
    if (!graphContainer) return;

    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 60;
    canvas.style.width = '100%';
    canvas.style.height = '60px';
    graphContainer.appendChild(canvas);

    state.populationGraphCanvas = canvas;
}

function updatePopulationGraph() {
    if (!state.populationGraphCanvas) return;

    const ctx = state.populationGraphCanvas.getContext('2d');
    const width = state.populationGraphCanvas.width;
    const height = state.populationGraphCanvas.height;

    // Record current populations
    const counts = {
        bacteria: state.entities.filter(e => e.type === 'bacteria').length,
        euglena: state.entities.filter(e => e.type === 'euglena').length,
        predators: state.entities.filter(e =>
            e.type === 'amoeba' || e.type === 'hydra' || e.type === 'paramecium'
        ).length
    };

    state.populationHistory.push(counts);

    // Keep last 90 data points
    if (state.populationHistory.length > 90) {
        state.populationHistory.shift();
    }

    // Clear canvas completely
    ctx.clearRect(0, 0, width, height);

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.1)';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Find max for scaling
    let maxPop = 50;
    for (const h of state.populationHistory) {
        maxPop = Math.max(maxPop, h.bacteria, h.euglena * 5, h.predators * 10);
    }

    // Draw lines for each population
    const populations = [
        { key: 'bacteria', color: '#a8c8ff', scale: 1 },
        { key: 'euglena', color: '#66dd66', scale: 5 },
        { key: 'predators', color: '#ff8866', scale: 10 }
    ];

    for (const pop of populations) {
        ctx.strokeStyle = pop.color;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let started = false;
        for (let i = 0; i < state.populationHistory.length; i++) {
            const x = (i / 90) * width;
            const value = (state.populationHistory[i][pop.key] || 0) * pop.scale;
            const y = height - 2 - (value / maxPop) * (height - 4);

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }
}

function gameLoop(delta) {
    // Pause check
    if (state.paused) return;

    // Apply speed multiplier
    delta *= state.simulationSpeed;

    state.frameCount = (state.frameCount || 0) + 1;

    // Update motion trails
    updateMotionTrails(delta);

    // Create motion trails for fast organisms
    if (state.frameCount % 3 === 0) {
        for (const entity of state.entities) {
            const speed = Math.sqrt((entity.vx || 0) ** 2 + (entity.vy || 0) ** 2);
            if (speed > 0.5 && entity.type !== 'algae' && entity.type !== 'detritus') {
                createMotionTrail(entity.x, entity.y, entity.color || 0xFFFFFF, entity.size || 5);
            }
        }
    }

    // Update vortex effect
    updateVortex(delta);

    // Day/Night Cycle
    if (state.dayNightEnabled) {
        state.timeOfDay += CONFIG.dayNightCycleSpeed * delta;
        if (state.timeOfDay >= 1) state.timeOfDay = 0;

        // Light follows sine wave: brightest at 0.5 (noon), darkest at 0 and 1 (midnight)
        const dayLight = Math.sin(state.timeOfDay * Math.PI);
        state.lightIntensity = 0.2 + dayLight * 1.0; // Range: 0.2 to 1.2

        // Update light slider to reflect current light
        const lightSlider = document.getElementById('lightSlider');
        if (lightSlider && !lightSlider.matches(':active')) {
            lightSlider.value = state.lightIntensity;
        }
    }

    // Temperature affects simulation speed
    const tempMultiplier = state.temperature;

    // Update shader time
    if (state.causticFilter) {
        state.causticFilter.uniforms.time += 0.01 * delta * tempMultiplier;
    }

    // Update all entities
    const bounds = { width: state.app.screen.width / state.zoom, height: state.app.screen.height / state.zoom };

    // Micro-currents (drift) - affected by temperature
    const time = Date.now() * 0.001;
    const driftX = (Math.sin(time * 0.1) * 0.03 + Math.sin(time * 0.23) * 0.02) * tempMultiplier;
    const driftY = (Math.cos(time * 0.13) * 0.03 + Math.cos(time * 0.19) * 0.02) * tempMultiplier;

    // Entities to spawn (reproduction)
    const toSpawn = [];

    // Iterate properly to allow removal
    for (let i = state.entities.length - 1; i >= 0; i--) {
        const entity = state.entities[i];

        // Apply Drift (gentler)
        entity.x += driftX * delta;
        entity.y += driftY * delta;

        // Pass entities list for interaction (hunting)
        // Apply temperature multiplier to delta for faster/slower metabolism
        const adjustedDelta = delta * tempMultiplier;
        const eatenEntity = entity.update(adjustedDelta, bounds, state.lightIntensity, state.entities, state.temperature);

        if (eatenEntity) {
            // Check if detritus just decomposed
            if (eatenEntity === 'decomposed') {
                // Remove the decomposed detritus
                state.entities.splice(i, 1);
                state.container.removeChild(entity.graphics);
                continue;
            }

            // Remove eaten entity
            const index = state.entities.indexOf(eatenEntity);
            if (index > -1) {
                // PARTICLE BURST EFFECT
                createParticleBurst(eatenEntity.x, eatenEntity.y, eatenEntity.color || 0xFFFFFF);

                // Larger organisms leave detritus
                if (eatenEntity.type === 'paramecium' || eatenEntity.type === 'euglena') {
                    spawnDetritus(eatenEntity.x, eatenEntity.y, 4);
                }

                state.entities.splice(index, 1);
                state.container.removeChild(eatenEntity.graphics);
                updateStats();
            }
        }

        // Check for reproduction
        if (entity.canReproduce && entity.canReproduce()) {
            const spawnInfo = entity.reproduce();
            toSpawn.push({ type: entity.type, x: spawnInfo.x, y: spawnInfo.y });
        }

        // Algae produce oxygen bubbles during photosynthesis
        if (entity.type === 'algae' && state.lightIntensity > 0.8) {
            if (Math.random() < 0.002 * state.lightIntensity * delta) {
                createOxygenBubble(
                    entity.x + (Math.random() - 0.5) * 15,
                    entity.y + (Math.random() - 0.5) * 15
                );
            }
        }

        // Euglena also produces bubbles when photosynthesizing
        if (entity.type === 'euglena' && entity.mode === 'photosynthetic' && state.lightIntensity > 0.9) {
            if (Math.random() < 0.001 * delta) {
                createOxygenBubble(entity.x, entity.y);
            }
        }
    }

    // Spawn offspring from reproduction (with population caps)
    const euglenaCount = state.entities.filter(e => e.type === 'euglena').length;
    const rotiferCount = state.entities.filter(e => e.type === 'rotifer').length;

    for (const spawn of toSpawn) {
        if (spawn.type === 'euglena' && euglenaCount < CONFIG.maxEuglena) {
            const e = new Euglena(spawn.x, spawn.y);
            state.entities.push(e);
            state.container.addChild(e.graphics);
        } else if (spawn.type === 'rotifer' && rotiferCount < CONFIG.maxRotifer) {
            const r = new Rotifer(spawn.x, spawn.y);
            state.entities.push(r);
            state.container.addChild(r.graphics);
        }
    }

    // Update oxygen bubbles
    updateOxygenBubbles(delta);

    // Periodic stats update and bacteria respawn
    if (state.frameCount % 60 === 0) {
        updateStats();
        updatePopulationGraph();

        // Bacteria slowly reproduce if there are few left
        const bacteriaCount = state.entities.filter(e => e.type === 'bacteria').length;
        if (bacteriaCount < 50 && Math.random() < 0.3) {
            spawnBacteria(5);
        }

        // Occasionally spawn detritus (organic matter settling)
        if (Math.random() < 0.1) {
            spawnDetritus(
                Math.random() * state.app.screen.width,
                -10,
                2 + Math.random() * 2
            );
        }
    }

    // Update background darkness based on light intensity
    if (state.causticFilter && state.lightIntensity !== undefined) {
        // Modulate the background slightly (darker when light is low)
        const brightness = 0.3 + state.lightIntensity * 0.7;
        state.container.alpha = brightness;
    }
}

function setupInteractions() {
    state.app.stage.eventMode = 'static';
    state.app.stage.hitArea = state.app.screen;

    state.app.stage.on('pointerdown', (event) => {
        const localPos = state.container.toLocal(event.global);

        if (state.activeTool === 'pipette') {
            // Spawn a burst of nutrients at the clicked location
            spawnBacteria(20, localPos.x, localPos.y);

            // Visual feedback: a small expanding circle for the "drop"
            const drop = new PIXI.Graphics();
            drop.beginFill(0x88ff88, 0.3);
            drop.drawCircle(0, 0, 10);
            drop.endFill();
            drop.x = localPos.x;
            drop.y = localPos.y;
            state.container.addChild(drop);

            // Animate fade out (simple ticker-based or requestAnimationFrame)
            let alpha = 0.5;
            let scale = 1;
            const animateDrop = () => {
                alpha -= 0.02;
                scale += 0.5;
                drop.alpha = alpha;
                drop.scale.set(scale);
                drop.clear(); // Clear before redrawing if changing shape, but here we just scale
                drop.beginFill(0x88ff88, alpha);
                drop.drawCircle(0, 0, 10); // Redraw

                if (alpha > 0) {
                    requestAnimationFrame(animateDrop);
                } else {
                    state.container.removeChild(drop);
                }
            };
            requestAnimationFrame(animateDrop);

        } else if (state.activeTool === 'cursor') {
            // Visual ripple effect
            const ripple = new PIXI.Graphics();
            ripple.lineStyle(2, 0x88ccff, 0.6);
            ripple.drawCircle(0, 0, 10);
            ripple.x = localPos.x;
            ripple.y = localPos.y;
            state.container.addChild(ripple);

            let rippleRadius = 10;
            let rippleAlpha = 0.6;
            const animateRipple = () => {
                rippleRadius += 4;
                rippleAlpha -= 0.03;
                ripple.clear();
                ripple.lineStyle(2, 0x88ccff, rippleAlpha);
                ripple.drawCircle(0, 0, rippleRadius);

                if (rippleAlpha > 0) {
                    requestAnimationFrame(animateRipple);
                } else {
                    state.container.removeChild(ripple);
                }
            };
            requestAnimationFrame(animateRipple);

            // Push entities away with distance-based force
            state.entities.forEach(entity => {
                const dx = entity.x - localPos.x;
                const dy = entity.y - localPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150 && dist > 0) {
                    // Stronger push for closer entities
                    const force = (150 - dist) / 150 * 8;
                    entity.vx = (entity.vx || 0) + (dx / dist) * force;
                    entity.vy = (entity.vy || 0) + (dy / dist) * force;
                }
            });
        } else if (state.activeTool === 'vortex') {
            // Create swirling vortex
            createVortex(localPos.x, localPos.y);
        } else if (state.activeTool === 'grab') {
            // Start panning
            state.isPanning = true;
            state.panStart.x = event.global.x - state.container.position.x;
            state.panStart.y = event.global.y - state.container.position.y;
            document.body.style.cursor = 'grabbing';
        }
    });

    // Pan move
    state.app.stage.on('pointermove', (event) => {
        if (state.isPanning && state.activeTool === 'grab') {
            state.container.position.x = event.global.x - state.panStart.x;
            state.container.position.y = event.global.y - state.panStart.y;
        }
    });

    // Pan end
    state.app.stage.on('pointerup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            document.body.style.cursor = state.activeTool === 'grab' ? 'grab' : 'default';
        }
    });

    state.app.stage.on('pointerupoutside', () => {
        if (state.isPanning) {
            state.isPanning = false;
            document.body.style.cursor = state.activeTool === 'grab' ? 'grab' : 'default';
        }
    });
}

function setupUI() {
    // Scroll to zoom
    const canvasContainer = document.getElementById('canvas-container');
    canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomSpeed = 0.1;
        const oldZoom = state.zoom;

        // Determine zoom direction
        if (e.deltaY < 0) {
            state.zoom = Math.min(3.0, state.zoom + zoomSpeed);
        } else {
            state.zoom = Math.max(0.5, state.zoom - zoomSpeed);
        }

        // Get mouse position relative to canvas
        const rect = canvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate zoom-to-point
        const zoomFactor = state.zoom / oldZoom;

        // Adjust container position to zoom toward mouse
        const newPosX = mouseX - (mouseX - state.container.position.x) * zoomFactor;
        const newPosY = mouseY - (mouseY - state.container.position.y) * zoomFactor;

        state.container.scale.set(state.zoom);
        state.container.position.set(newPosX, newPosY);
    }, { passive: false });

    // Light Slider - with manual override
    const lightSlider = document.getElementById('lightSlider');
    if (lightSlider) {
        lightSlider.addEventListener('input', (e) => {
            state.lightIntensity = parseFloat(e.target.value);
            // Disable day/night when manually adjusting
            state.dayNightEnabled = false;
            const toggle = document.getElementById('dayNightToggle');
            if (toggle) toggle.checked = false;
        });
    }

    // Temperature Slider
    const tempSlider = document.getElementById('tempSlider');
    if (tempSlider) {
        tempSlider.addEventListener('input', (e) => {
            state.temperature = parseFloat(e.target.value);
        });
    }

    // Day/Night Toggle
    const dayNightToggle = document.getElementById('dayNightToggle');
    if (dayNightToggle) {
        dayNightToggle.addEventListener('change', (e) => {
            state.dayNightEnabled = e.target.checked;
        });
    }

    // Tool selection
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTool = btn.dataset.tool;

            // Update cursor for grab tool
            if (btn.dataset.tool === 'grab') {
                document.body.style.cursor = 'grab';
            } else {
                document.body.style.cursor = 'default';
            }
        });
    });

    // Speed controls
    const speedButtons = document.querySelectorAll('.speed-btn');
    speedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            speedButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const speed = parseFloat(btn.dataset.speed);
            if (speed === 0) {
                state.paused = true;
            } else {
                state.paused = false;
                state.simulationSpeed = speed;
            }
        });
    });

    // Panel collapse toggles
    const controlsPanel = document.getElementById('controls-panel');
    const controlsToggle = document.getElementById('controls-toggle');
    if (controlsToggle && controlsPanel) {
        controlsToggle.addEventListener('click', () => {
            controlsPanel.classList.toggle('collapsed');
        });
    }

    const statsPanel = document.getElementById('stats-panel');
    const statsToggle = document.getElementById('stats-toggle');
    if (statsToggle && statsPanel) {
        statsToggle.addEventListener('click', () => {
            statsPanel.classList.toggle('collapsed');
        });
    }
}

function updateStats() {
    const bacteriaCount = state.entities.filter(e => e.type === 'bacteria').length;
    const parameciaCount = state.entities.filter(e => e.type === 'paramecium').length;
    const algaeCount = state.entities.filter(e => e.type === 'algae').length;
    const amoebaCount = state.entities.filter(e => e.type === 'amoeba').length;
    const euglenaCount = state.entities.filter(e => e.type === 'euglena').length;
    const rotiferCount = state.entities.filter(e => e.type === 'rotifer').length;
    const hydraCount = state.entities.filter(e => e.type === 'hydra').length;

    const bacEl = document.getElementById('count-bacteria');
    if (bacEl) bacEl.innerText = bacteriaCount;

    const paraEl = document.getElementById('count-paramecia');
    if (paraEl) paraEl.innerText = parameciaCount;

    const algaeEl = document.getElementById('count-algae');
    if (algaeEl) algaeEl.innerText = algaeCount;

    const amoebaEl = document.getElementById('count-amoeba');
    if (amoebaEl) amoebaEl.innerText = amoebaCount;

    const euglenaEl = document.getElementById('count-euglena');
    if (euglenaEl) euglenaEl.innerText = euglenaCount;

    const rotiferEl = document.getElementById('count-rotifer');
    if (rotiferEl) rotiferEl.innerText = rotiferCount;

    const hydraEl = document.getElementById('count-hydra');
    if (hydraEl) hydraEl.innerText = hydraCount;

    // Update time display
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay && state.dayNightEnabled) {
        const hour = Math.floor(state.timeOfDay * 24);
        let timeStr = '';
        if (hour >= 5 && hour < 12) timeStr = '(Morning)';
        else if (hour >= 12 && hour < 17) timeStr = '(Afternoon)';
        else if (hour >= 17 && hour < 21) timeStr = '(Evening)';
        else timeStr = '(Night)';
        timeDisplay.innerText = timeStr;
    }
}

function setupOrganismInspector() {
    // Create tooltip graphics
    state.tooltip = new PIXI.Graphics();
    state.tooltipText = new PIXI.Text('', {
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 11,
        fill: 0xFFFFFF,
        wordWrap: true,
        wordWrapWidth: 170
    });
    state.tooltip.visible = false;
    state.tooltipText.visible = false;
    state.app.stage.addChild(state.tooltip);
    state.app.stage.addChild(state.tooltipText);

    // Track mouse for tooltip
    state.app.stage.on('pointermove', (e) => {
        const localPos = state.container.toLocal(e.global);
        updateOrganismTooltip(localPos.x, localPos.y, e.global.x, e.global.y);
    });
}

function updateOrganismTooltip(worldX, worldY, screenX, screenY) {
    let hoveredEntity = null;
    let minDist = 50;

    for (const e of state.entities) {
        const dx = e.x - worldX;
        const dy = e.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Larger detection radius for bigger organisms
        const detectionRadius = e.type === 'amoeba' ? 60 :
            e.type === 'hydra' ? 70 :
                e.type === 'paramecium' ? 40 : 30;

        if (dist < Math.min(minDist, detectionRadius)) {
            minDist = dist;
            hoveredEntity = e;
        }
    }

    if (hoveredEntity) {
        let info = '';
        const type = hoveredEntity.type;

        if (type === 'bacteria') {
            info = `🔵 BACTERIA\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Size: ${hoveredEntity.size.toFixed(1)}μm\n`;
            info += `Prokaryotic cell\n`;
            info += `Role: Decomposer`;
        } else if (type === 'paramecium') {
            info = `🔷 PARAMECIUM\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `State: ${hoveredEntity.state || 'Roaming'}\n`;
            info += `Speed: ${hoveredEntity.speed.toFixed(2)}\n`;
            info += `Cilia propulsion\n`;
            info += `Diet: Bacteria`;
        } else if (type === 'algae') {
            info = `🟢 ALGAE\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Cells: ${hoveredEntity.cells.length}\n`;
            info += `Photosynthetic\n`;
            info += `Produces O₂`;
            if (state.lightIntensity > 0.8) {
                info += `\n✨ Active photosynthesis!`;
            }
        } else if (type === 'amoeba') {
            info = `🟣 AMOEBA\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Size: ${hoveredEntity.size.toFixed(0)}μm\n`;
            info += `State: ${hoveredEntity.state}\n`;
            info += `Food eaten: ${hoveredEntity.foodEaten}\n`;
            info += `Pseudopods: ${hoveredEntity.numPseudopods}`;
            if (hoveredEntity.state === 'hunting') {
                info += `\n🎯 Hunting prey!`;
            }
        } else if (type === 'euglena') {
            info = `🌿 EUGLENA\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Mode: ${hoveredEntity.mode}\n`;
            info += `Energy: ${hoveredEntity.energy.toFixed(0)}%\n`;
            info += `Flagellum propulsion`;
            if (hoveredEntity.mode === 'photosynthetic') {
                info += `\n☀️ Absorbing light!`;
            } else {
                info += `\n🔍 Hunting mode!`;
            }
        } else if (type === 'rotifer') {
            info = `🔶 ROTIFER\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Size: ${hoveredEntity.size.toFixed(0)}μm\n`;
            info += `Energy: ${hoveredEntity.energy.toFixed(0)}%\n`;
            info += `Filter feeder\n`;
            info += `🌀 Creating currents`;
        } else if (type === 'detritus') {
            info = `💀 DETRITUS\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Organic matter\n`;
            info += `Decomposing...\n`;
            info += `Food for bacteria`;
        } else if (type === 'hydra') {
            info = `🐙 HYDRA\n`;
            info += `━━━━━━━━━━━━━\n`;
            info += `Size: ${hoveredEntity.size.toFixed(0)}μm\n`;
            info += `Energy: ${hoveredEntity.energy.toFixed(0)}%\n`;
            info += `Tentacles: ${hoveredEntity.numTentacles}`;
            if (hoveredEntity.isContracting) {
                info += `\n🍽️ Feeding!`;
            } else {
                info += `\n🎣 Waiting for prey...`;
            }
        }

        // Draw tooltip
        state.tooltip.clear();
        state.tooltip.beginFill(0x000000, 0.85);
        state.tooltip.lineStyle(1, 0x4488aa, 0.6);

        let tooltipX = screenX + 15;
        let tooltipY = screenY - 80;

        if (tooltipX + 190 > state.app.screen.width) tooltipX = screenX - 200;
        if (tooltipY < 10) tooltipY = screenY + 20;

        state.tooltip.drawRoundedRect(0, 0, 185, 95, 5);
        state.tooltip.endFill();
        state.tooltip.x = tooltipX;
        state.tooltip.y = tooltipY;
        state.tooltip.visible = true;

        state.tooltipText.text = info;
        state.tooltipText.x = tooltipX + 8;
        state.tooltipText.y = tooltipY + 6;
        state.tooltipText.visible = true;

        // Highlight organism
        hoveredEntity.graphics.alpha = 1.2;
    } else {
        state.tooltip.visible = false;
        state.tooltipText.visible = false;
    }
}

// Start
init();
