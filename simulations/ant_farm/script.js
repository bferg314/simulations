import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pane } from 'tweakpane';

// Config
const CONFIG = {
    worldWidth: 400,
    worldHeight: 300,
    initialAnts: 20,
    dirtColor: '#8B5A2B',      // Lighter brown for better contrast
    tunnelColor: '#1a0f0a',    // Darker tunnel for visibility
    skyColor: '#87CEEB',
    antColor: '#1a1a1a',       // Slightly lighter for visibility
    queenColor: '#9932CC',     // Brighter purple
    eggColor: '#fffff0',
    larvaColor: '#FFD700',
    foodColor: '#32CD32',
    simSpeed: 2,
    groundLevel: 80,           // Define ground level as constant
};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0f0a);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 10, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.enableZoom = true;
controls.minDistance = 10;
controls.maxDistance = 300;

// Swap controls: Left-click to pan, Right-click to rotate
controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
};

scene.add(new THREE.AmbientLight(0xffffff, 1.0));

// --- ENGINE ---

const canvas = document.createElement('canvas');
canvas.width = CONFIG.worldWidth;
canvas.height = CONFIG.worldHeight;
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Layers
const TYPE_AIR = 0;
const TYPE_DIRT = 1;

const grid = new Uint8Array(CONFIG.worldWidth * CONFIG.worldHeight);
const pheroHome = new Float32Array(grid.length);
const pheroFood = new Float32Array(grid.length);

const colony = [];
const brood = [];
const food = [];

// Track the queen's chamber location for navigation
let chamberX = CONFIG.worldWidth / 2;
let chamberY = 150;

function initWorld() {
    for (let x = 0; x < CONFIG.worldWidth; x++) {
        // Organic terrain generator (Sine waves)
        const groundLevel = CONFIG.groundLevel + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.07) * 4;

        for (let y = 0; y < CONFIG.worldHeight; y++) {
            const i = y * CONFIG.worldWidth + x;
            grid[i] = y < groundLevel ? TYPE_AIR : TYPE_DIRT;
            pheroHome[i] = 0;
            pheroFood[i] = 0;
        }
    }

    // Clear entrance area at center - make sure ants can exit
    clearEntrance(CONFIG.worldWidth / 2);
}

// Clear a wide entrance at the surface so ants can exit
function clearEntrance(centerX) {
    const width = 15; // Very wide funnel entrance

    for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
        const x = Math.floor(centerX) + dx;
        if (!isValid(x, 0)) continue;

        // Calculate the ACTUAL terrain height at this x position (same formula as initWorld)
        const terrainHeight = CONFIG.groundLevel + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.07) * 4;

        // Clear from y=0 (sky) down THROUGH the terrain
        // Central shaft goes deeper, edges are shallower (creates a funnel)
        const extraDepth = Math.abs(dx) < 4 ? 30 : 5;
        const clearToY = terrainHeight + extraDepth;

        for (let y = 0; y < clearToY; y++) {
            if (isValid(x, y)) {
                grid[getIdx(x, y)] = TYPE_AIR;
            }
        }
    }
}

const isValid = (x, y) => x >= 0 && x < CONFIG.worldWidth && y >= 0 && y < CONFIG.worldHeight;
const getIdx = (x, y) => Math.floor(y) * CONFIG.worldWidth + Math.floor(x);

// Check if a position is at the surface (air above, dirt below or at edge of dirt)
function isSurface(x, y) {
    if (!isValid(x, y)) return false;
    const idx = getIdx(x, y);
    if (grid[idx] !== TYPE_AIR) return false;

    // Check if there's dirt below
    if (isValid(x, y + 1) && grid[getIdx(x, y + 1)] === TYPE_DIRT) return true;
    return false;
}

// --- CLASSES ---

class BiologicalEntity {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.age = 0;
        this.alive = true;
    }
}

class Food extends BiologicalEntity {
    constructor(x, y) {
        super(x, y);
    }
}

class Egg extends BiologicalEntity {
    constructor(x, y) {
        super(x, y);
        this.hatchTime = 500 + Math.random() * 200;
    }
    update() {
        this.age++;
        if (this.age > this.hatchTime) {
            this.alive = false;
            brood.push(new Larva(this.x, this.y));
        }
    }
}

class Larva extends BiologicalEntity {
    constructor(x, y) {
        super(x, y);
        this.hunger = 0;
        this.pupateTime = 1000 + Math.random() * 500;
        this.fed = false;
    }
    update() {
        this.age++;
        this.hunger++;
        const myIdx = getIdx(this.x, this.y);
        pheroHome[myIdx] = Math.min(1.0, pheroHome[myIdx] + 0.8); // Strong "Feed Me" signal

        if (this.age > this.pupateTime) {
            this.alive = false;
            colony.push(new Worker(this.x, this.y));
        }
    }
    feed() {
        this.hunger = 0;
        this.age += 200;
        this.fed = true;
    }
}

class Ant extends BiologicalEntity {
    constructor(x, y) {
        super(x, y);
        this.dirX = Math.random() > 0.5 ? 1 : -1;
        this.dirY = 0;
        this.holdingDirt = false;
    }

    // Improved gravity check - apply when in air with no support
    applyGravity() {
        const belowIdx = getIdx(this.x, this.y + 1);
        if (isValid(this.x, this.y + 1) && grid[belowIdx] === TYPE_AIR) {
            // No floor below - check if we're floating
            const currentIdx = getIdx(this.x, this.y);
            if (grid[currentIdx] === TYPE_AIR) {
                // Check adjacent cells for support (can cling to walls)
                const leftIdx = getIdx(this.x - 1, this.y);
                const rightIdx = getIdx(this.x + 1, this.y);

                const hasLeftSupport = isValid(this.x - 1, this.y) && grid[leftIdx] === TYPE_DIRT;
                const hasRightSupport = isValid(this.x + 1, this.y) && grid[rightIdx] === TYPE_DIRT;

                if (!hasLeftSupport && !hasRightSupport) {
                    // Fall!
                    this.y++;
                    return true;
                }
            }
        }
        return false;
    }

    moveRandomly() {
        // Apply gravity first
        if (this.applyGravity()) return;

        if (Math.random() < 0.2) this.dirX = Math.random() > 0.5 ? 1 : -1;
        if (Math.random() < 0.2) this.dirY = Math.random() > 0.5 ? 1 : -1;

        this.tryMove(this.x + this.dirX, this.y + this.dirY);
    }

    tryMove(tx, ty) {
        if (!isValid(tx, ty)) return false;

        const idx = getIdx(tx, ty);
        if (grid[idx] === TYPE_DIRT) {
            // Dig logic
            if (this.holdingDirt) {
                // Blocked, can't dig while holding dirt
                return false;
            }

            if (Math.random() < 0.3) {
                grid[idx] = TYPE_AIR;
                this.holdingDirt = true;
                this.x = tx;
                this.y = ty;
                return true;
            }
            return false;
        } else {
            this.x = tx;
            this.y = ty;

            // Small chance to fall if moving into air with nothing below
            const below = getIdx(tx, ty + 1);
            if (isValid(tx, ty + 1) && grid[below] === TYPE_AIR && Math.random() < 0.1) {
                this.y++;
            }
            return true;
        }
    }
}

class Queen extends Ant {
    constructor(x, y) {
        super(x, y);
        this.state = 'DIG_CHAMBER';
        this.eggTimer = 0;
        this.chamberComplete = false;
    }

    update() {
        const idx = getIdx(this.x, this.y);
        pheroHome[idx] = 1.0;

        if (this.state === 'DIG_CHAMBER') {
            if (this.y < 150) {
                this.dirY = 1;
                // Widen shaft MORE as we go - make it 5 wide to prevent blockages
                for (let dx = -2; dx <= 2; dx++) {
                    const idx = getIdx(this.x + dx, this.y);
                    if (isValid(this.x + dx, this.y)) {
                        grid[idx] = TYPE_AIR;
                    }
                }

                this.queenMove(this.x, this.y + 1);
            } else {
                this.clearChamber();
                chamberX = this.x;
                chamberY = this.y;
                this.state = 'LAY_EGGS';
                this.chamberComplete = true;
            }
        } else if (this.state === 'LAY_EGGS') {
            this.eggTimer++;
            if (this.eggTimer > 200) {
                brood.push(new Egg(this.x + (Math.random() - 0.5) * 4, this.y));
                this.eggTimer = 0;
            }
            // Queen stays mostly in place, just wiggles slightly
            if (Math.random() < 0.05) {
                // FIXED: Queen no longer destroys dirt when moving
                // She only moves within air spaces
                const newX = this.x + (Math.random() > 0.5 ? 1 : -1);
                const newY = this.y + (Math.random() > 0.5 ? 1 : -1);

                // Only move if destination is air and within chamber area
                if (isValid(newX, newY)) {
                    const destIdx = getIdx(newX, newY);
                    if (grid[destIdx] === TYPE_AIR &&
                        Math.abs(newX - chamberX) < 10 &&
                        Math.abs(newY - chamberY) < 10) {
                        this.x = newX;
                        this.y = newY;
                    }
                }
            }
        }
    }

    // Special queen movement that destroys dirt (only used during digging)
    queenMove(tx, ty) {
        if (!isValid(tx, ty)) return false;
        const idx = getIdx(tx, ty);
        if (grid[idx] === TYPE_DIRT) grid[idx] = TYPE_AIR;
        this.x = tx;
        this.y = ty;
        return true;
    }

    clearChamber() {
        const r = 8;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const tx = Math.floor(this.x + dx);
                const ty = Math.floor(this.y + dy);
                if (isValid(tx, ty)) grid[getIdx(tx, ty)] = TYPE_AIR;
            }
        }
    }
}

class Worker extends Ant {
    constructor(x, y) {
        super(x, y);
        this.hasFood = false;
        this.state = 'FORAGE';
        this.targetLarva = null;
    }

    update() {
        const idx = getIdx(this.x, this.y);

        // FIXED: Pheromone logic - only lay trail when going TO destination
        // When returning with food, lay food pheromone so others can follow TO food
        if (this.hasFood) {
            pheroFood[idx] = Math.min(1.0, pheroFood[idx] + 0.3);
        }
        // When foraging (without food), lay home pheromone for return trip
        else if (!this.holdingDirt) {
            pheroHome[idx] = Math.min(1.0, pheroHome[idx] + 0.1);
        }

        // State Machine
        if (this.holdingDirt) {
            this.doDumpDirt();
        } else if (this.hasFood) {
            this.doReturn();
        } else {
            this.doForage();
        }
    }

    doDumpDirt() {
        // FIXED: Walk AWAY from entrance before dumping dirt
        // This prevents blocking the tunnel entrance with dirt walls

        const entranceX = chamberX; // The tunnel entrance is roughly above the chamber
        const distFromEntrance = Math.abs(this.x - entranceX);

        // Only dump dirt if:
        // 1. We're at the surface (above ground level)
        // 2. We're far enough from the entrance (at least 30 pixels away!)
        if (this.y < CONFIG.groundLevel + 5 && distFromEntrance > 30) {
            if (isSurface(this.x, this.y)) {
                const idx = getIdx(this.x, this.y);
                if (grid[idx] === TYPE_AIR && Math.random() < 0.8) {
                    grid[idx] = TYPE_DIRT;
                    this.holdingDirt = false;
                    // Jump up on top
                    if (this.y > 10) this.y--;
                    return;
                }
            }
        }

        // If at surface but too close to entrance, walk away first
        if (this.y < CONFIG.groundLevel + 5 && distFromEntrance <= 30) {
            // Move AWAY from entrance
            const awayDir = this.x < entranceX ? -1 : 1;
            if (!this.tryMoveWithoutDigging(this.x + awayDir, this.y)) {
                // If blocked horizontally, try diagonal up-away
                this.tryMoveWithoutDigging(this.x + awayDir, this.y - 1);
            }
            return;
        }

        // Move toward surface (bias heavily upward)
        if (Math.random() < 0.95) {
            // Try to go up, or sideways if blocked
            if (!this.tryMoveWithoutDigging(this.x, this.y - 1)) {
                // Can't go straight up, try diagonal
                const dir = Math.random() > 0.5 ? 1 : -1;
                if (!this.tryMoveWithoutDigging(this.x + dir, this.y - 1)) {
                    // Try horizontal
                    this.tryMoveWithoutDigging(this.x + dir, this.y);
                }
            }
        } else {
            this.moveRandomly();
        }
    }

    // Move only through air (no digging)
    tryMoveWithoutDigging(tx, ty) {
        if (!isValid(tx, ty)) return false;
        const idx = getIdx(tx, ty);
        if (grid[idx] === TYPE_AIR) {
            this.x = tx;
            this.y = ty;
            return true;
        }
        return false;
    }

    doForage() {
        // Check for nearby food
        const nearbyFoodIdx = food.findIndex(f => Math.abs(f.x - this.x) < 3 && Math.abs(f.y - this.y) < 3);
        if (nearbyFoodIdx !== -1) {
            food.splice(nearbyFoodIdx, 1);
            this.hasFood = true;
            this.dirY = 1; // Head down toward colony
            return;
        }

        // DEEP underground? Just climb up unconditionally
        if (this.y > CONFIG.groundLevel + 30) {
            this.climbTowardSurface();
            return;
        }

        // Near surface - check if we're ACTUALLY in open space
        const canMoveLeft = isValid(this.x - 1, this.y) && grid[getIdx(this.x - 1, this.y)] === TYPE_AIR;
        const canMoveRight = isValid(this.x + 1, this.y) && grid[getIdx(this.x + 1, this.y)] === TYPE_AIR;
        const hasOpenSpace = canMoveLeft && canMoveRight;

        // Still in tunnel? Keep climbing
        if (!hasOpenSpace) {
            this.climbTowardSurface();
        } else {
            // Actually on surface with open space - spread out to find food!
            if (Math.random() < 0.3) {
                this.followPheromone(pheroFood);
            } else {
                // Wander horizontally on surface to find food
                const dir = Math.random() > 0.5 ? 1 : -1;

                // Move horizontally, climb up slopes if needed
                if (!this.tryMoveWithoutDigging(this.x + dir, this.y)) {
                    if (!this.tryMoveWithoutDigging(this.x + dir, this.y - 1)) {
                        // Try other direction
                        this.tryMoveWithoutDigging(this.x - dir, this.y);
                    }
                }
            }
        }
    }

    climbTowardSurface() {
        // Try to move up through tunnels
        // Priority: up > diagonal up > horizontal
        if (this.tryMoveWithoutDigging(this.x, this.y - 1)) return;

        const dir = Math.random() > 0.5 ? 1 : -1;
        if (this.tryMoveWithoutDigging(this.x + dir, this.y - 1)) return;
        if (this.tryMoveWithoutDigging(this.x - dir, this.y - 1)) return;

        // Can't go up - try sideways to find another route
        if (this.tryMoveWithoutDigging(this.x + dir, this.y)) return;
        if (this.tryMoveWithoutDigging(this.x - dir, this.y)) return;

        // STILL stuck? If we're near surface, DIG through!
        // This prevents permanent entrance blockages
        if (this.y < CONFIG.groundLevel + 30 && !this.holdingDirt) {
            // Try to dig upward
            if (this.tryMove(this.x, this.y - 1)) return;
            if (this.tryMove(this.x + dir, this.y - 1)) return;
        }
    }

    doReturn() {
        // FIXED: Better larva targeting - find ANY hungry larva and go to it
        const larva = brood.find(b => b instanceof Larva && !b.fed);

        if (larva) {
            // Move toward the larva
            const dx = Math.sign(larva.x - this.x);
            const dy = Math.sign(larva.y - this.y);

            // Check if we're close enough to feed
            if (Math.abs(larva.x - this.x) < 3 && Math.abs(larva.y - this.y) < 3) {
                larva.feed();
                this.hasFood = false;
                return;
            }

            // Move toward larva
            if (Math.random() < 0.8) {
                this.tryMove(this.x + dx, this.y + dy);
            } else {
                this.moveRandomly();
            }
        } else {
            // No hungry larvae - follow home pheromone to queen's chamber
            if (this.y < chamberY - 5) {
                // Need to go down
                if (Math.random() < 0.8) {
                    if (!this.tryMove(this.x, this.y + 1)) {
                        this.followPheromone(pheroHome);
                    }
                } else {
                    this.moveRandomly();
                }
            } else if (Math.random() < 0.7) {
                this.followPheromone(pheroHome);
            } else {
                this.moveRandomly();
            }

            // If we're in the chamber area, drop the food
            if (Math.abs(this.x - chamberX) < 10 && Math.abs(this.y - chamberY) < 10) {
                this.hasFood = false;
            }
        }
    }

    followPheromone(map) {
        let bestX = this.x;
        let bestY = this.y;
        let maxVal = -1;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const tx = Math.floor(this.x + dx);
                const ty = Math.floor(this.y + dy);
                if (isValid(tx, ty) && grid[getIdx(tx, ty)] === TYPE_AIR) {
                    const val = map[getIdx(tx, ty)];
                    if (val > maxVal) {
                        maxVal = val;
                        bestX = tx;
                        bestY = ty;
                    }
                }
            }
        }

        if (maxVal > 0.01) {
            this.x = bestX;
            this.y = bestY;
            return true;
        }
        this.moveRandomly();
        return false;
    }
}


// Setup
initWorld();
const queen = new Queen(CONFIG.worldWidth / 2, CONFIG.groundLevel);
colony.push(queen);
for (let i = 0; i < CONFIG.initialAnts; i++) {
    colony.push(new Worker(CONFIG.worldWidth / 2 + (Math.random() - 0.5) * 10, CONFIG.groundLevel));
}

// Surface Food Spawner - spawn food near surface
setInterval(() => {
    if (food.length < 50) {
        const x = Math.random() * CONFIG.worldWidth;
        // Find surface level at this x
        let surfaceY = 0;
        for (let y = 0; y < CONFIG.worldHeight; y++) {
            if (grid[getIdx(x, y)] === TYPE_DIRT) {
                surfaceY = y - 1;
                break;
            }
        }
        food.push(new Food(x, Math.max(5, surfaceY)));
    }
}, 500);


// 3D Rendering Setup
const texture = new THREE.CanvasTexture(canvas);
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.colorSpace = THREE.SRGBColorSpace;
const planeGeo = new THREE.PlaneGeometry(40, 30);
const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
scene.add(new THREE.Mesh(planeGeo, material));

// Frame
const frameGeo = new THREE.BoxGeometry(42, 32, 2);
const frameMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
const frame = new THREE.Mesh(frameGeo, frameMat);
frame.position.z = -1.1;
scene.add(frame);


// Render Loop
function draw() {
    // Pheromone decay
    for (let i = 0; i < pheroHome.length; i++) {
        pheroHome[i] *= 0.995;
        pheroFood[i] *= 0.995;
    }

    // Draw directly
    ctx.fillStyle = CONFIG.tunnelColor;
    ctx.fillRect(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);

    // Sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, CONFIG.groundLevel);
    skyGradient.addColorStop(0, '#5BA3D9');
    skyGradient.addColorStop(1, '#87CEEB');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, CONFIG.worldWidth, CONFIG.groundLevel);

    const imgData = ctx.getImageData(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);
    const data = imgData.data;
    const cvt = (hex) => {
        const c = new THREE.Color(hex);
        return [c.r * 255, c.g * 255, c.b * 255];
    }
    const cDirt = cvt(CONFIG.dirtColor);
    const cSky = cvt(CONFIG.skyColor);

    for (let i = 0; i < grid.length; i++) {
        const type = grid[i];
        const y = Math.floor(i / CONFIG.worldWidth);

        if (type === TYPE_DIRT) {
            const idx = i * 4;
            // Add slight variation for texture
            const variation = Math.random() * 15 - 7;
            data[idx] = Math.min(255, Math.max(0, cDirt[0] + variation));
            data[idx + 1] = Math.min(255, Math.max(0, cDirt[1] + variation));
            data[idx + 2] = Math.min(255, Math.max(0, cDirt[2] + variation));
            data[idx + 3] = 255;
        } else if (type === TYPE_AIR && y < CONFIG.groundLevel) {
            const idx = i * 4;
            data[idx] = cSky[0];
            data[idx + 1] = cSky[1];
            data[idx + 2] = cSky[2];
            data[idx + 3] = 255;
        }
        // Tunnels stay as the dark tunnel color (already filled)
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw entities (larger for visibility)
    ctx.fillStyle = CONFIG.eggColor;
    brood.forEach(b => {
        if (b instanceof Egg && b.alive) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    ctx.fillStyle = CONFIG.larvaColor;
    brood.forEach(b => {
        if (b instanceof Larva && b.alive) {
            ctx.fillRect(b.x - 1, b.y - 1, 3, 3);
        }
    });

    ctx.fillStyle = CONFIG.foodColor;
    food.forEach(f => {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2, 0, Math.PI * 2);
        ctx.fill();
    });

    colony.forEach(ant => {
        if (!ant.alive) return;
        if (ant instanceof Queen) {
            // Draw queen with glow
            ctx.fillStyle = 'rgba(153, 50, 204, 0.3)';
            ctx.beginPath();
            ctx.arc(ant.x, ant.y, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = CONFIG.queenColor;
            ctx.fillRect(ant.x - 2, ant.y - 2, 4, 4);
        } else {
            // Workers - larger and more visible
            if (ant.holdingDirt) {
                ctx.fillStyle = '#CD853F'; // Tan color for dirt
            } else if (ant.hasFood) {
                ctx.fillStyle = CONFIG.foodColor;
            } else {
                ctx.fillStyle = CONFIG.antColor;
            }

            ctx.fillRect(ant.x - 0.5, ant.y - 0.5, 2, 2);
        }
    });

    texture.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);

    for (let i = 0; i < CONFIG.simSpeed; i++) {
        colony.forEach(a => a.update());
        brood.forEach(b => b.update());

        for (let j = brood.length - 1; j >= 0; j--) {
            if (!brood[j].alive) brood.splice(j, 1);
        }
    }

    draw();
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Tweakpane
const pane = new Pane();
pane.addBinding(CONFIG, 'simSpeed', { min: 1, max: 20, label: 'Speed' });
const btn = pane.addButton({ title: 'Drop Food' });
btn.on('click', () => {
    for (let i = 0; i < 5; i++) {
        food.push(new Food(CONFIG.worldWidth / 2 + (Math.random() - 0.5) * 20, CONFIG.groundLevel - 5));
    }
});

// Interaction: Drop Sugar (middle-click to place food)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const planeMesh = scene.children.find(c => c.geometry.type === 'PlaneGeometry' && c.geometry.parameters.width === 40);

window.addEventListener('pointerdown', (e) => {
    // Only respond to middle-click (button 1) for food placement
    // Left-click (button 0) is reserved for OrbitControls rotation
    // Right-click (button 2) is reserved for OrbitControls panning
    if (e.button !== 1) return;

    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(planeMesh);

    if (intersects.length > 0) {
        const uv = intersects[0].uv;
        const x = Math.floor(uv.x * CONFIG.worldWidth);
        const y = Math.floor((1 - uv.y) * CONFIG.worldHeight);

        // Spawn cluster of food
        for (let i = 0; i < 10; i++) {
            food.push(new Food(
                x + (Math.random() - 0.5) * 10,
                y + (Math.random() - 0.5) * 10
            ));
        }
    }
});
