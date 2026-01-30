import { Bacteria } from './classes/Bacteria.js';
import { Paramecium } from './classes/Paramecium.js';
import { Algae } from './classes/Algae.js';

// Configuration
const CONFIG = {
    bacteriaCount: 200,
    parameciaCount: 15,
    algaeCount: 40,
    backgroundColor: 0x051a26, // Deep pond blue/green
    zoomedBackgroundColor: 0x0a2e3d,
};

// State
const state = {
    app: null,
    container: null,
    entities: [],
    zoom: 1.0,
    activeTool: 'cursor',
    lightIntensity: 1.0
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

    // Spawn initial life
    spawnBacteria(CONFIG.bacteriaCount);
    spawnParamecia(CONFIG.parameciaCount);
    spawnAlgae(CONFIG.algaeCount);

    // Setup Event Listeners
    setupInteractions();
    setupUI();

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

function gameLoop(delta) {
    // Update shader time
    if (state.causticFilter) {
        state.causticFilter.uniforms.time += 0.01 * delta;
    }

    // Update all entities
    const bounds = { width: state.app.screen.width / state.zoom, height: state.app.screen.height / state.zoom };

    // Iterate properly to allow removal
    for (let i = state.entities.length - 1; i >= 0; i--) {
        const entity = state.entities[i];

        // Pass entities list for interaction (hunting)
        // Returns an entity if it "ate" something
        const eatenEntity = entity.update(delta, bounds, state.lightIntensity, state.entities);

        if (eatenEntity) {
            // Remove eaten entity
            const index = state.entities.indexOf(eatenEntity);
            if (index > -1) {
                state.entities.splice(index, 1);
                state.container.removeChild(eatenEntity.graphics);

                // Visual feedback: paramecium pulse/growth? 
                // handled in class or maybe just update stats
                updateStats();
            }
        }
    }

    // Update global effects based on light
    // Dim background if light is low
    // (Optional enhancement later)
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
            // Repel or attract
            // For now, simple interaction: push entities away
            state.entities.forEach(entity => {
                const dx = entity.x - localPos.x;
                const dy = entity.y - localPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    entity.vx += (dx / dist) * 5;
                    entity.vy += (dy / dist) * 5;
                }
            });
        }
    });
}

function setupUI() {
    // Zoom Slider
    const zoomSlider = document.getElementById('zoomSlider');
    zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.zoom = val;
        // Zoom towards center
        const cx = state.app.screen.width / 2;
        const cy = state.app.screen.height / 2;

        // Simple scale
        state.container.scale.set(val);

        // This centering logic is simplistic, might need refinement for zoom-to-point
        state.container.position.set(cx - cx * val, cy - cy * val);
    });

    // Light Slider
    const lightSlider = document.getElementById('lightSlider');
    if (lightSlider) {
        lightSlider.addEventListener('input', (e) => {
            state.lightIntensity = parseFloat(e.target.value);
        });
    }

    // Tool selection
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTool = btn.dataset.tool;
        });
    });
}

function updateStats() {
    const bacteriaCount = state.entities.filter(e => e.type === 'bacteria').length;
    const parameciaCount = state.entities.filter(e => e.type === 'paramecium').length;
    const algaeCount = state.entities.filter(e => e.type === 'algae').length;

    const bacEl = document.getElementById('count-bacteria');
    if (bacEl) bacEl.innerText = bacteriaCount;

    const paraEl = document.getElementById('count-paramecia');
    if (paraEl) paraEl.innerText = parameciaCount;

    const algaeEl = document.getElementById('count-algae');
    if (algaeEl) algaeEl.innerText = algaeCount;
}

// Start
init();
