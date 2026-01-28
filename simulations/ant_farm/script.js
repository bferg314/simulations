import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pane } from 'tweakpane';

// Config
const CONFIG = {
    worldWidth: 400,
    worldHeight: 300,
    initialAnts: 20,
    dirtColor: '#5d4037',
    tunnelColor: '#3e2723',
    skyColor: '#87CEEB',
    antColor: '#000000',
    queenColor: '#800080',
    eggColor: '#ffffff',
    larvaColor: '#ffff00',
    foodColor: '#00ff00',
    simSpeed: 2,
};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3e2723);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 10, 60); // Zoomed in closer for details

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;  // Enable Panning
controls.enableZoom = true; // Enable Zooming
controls.minDistance = 10;  // Close up view
controls.maxDistance = 300; // Far view

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

function initWorld() {
    for (let x = 0; x < CONFIG.worldWidth; x++) {
        // Organic terrain generator (Sine waves)
        const groundLevel = 80 + Math.sin(x * 0.02) * 12 + Math.sin(x * 0.07) * 4;

        for (let y = 0; y < CONFIG.worldHeight; y++) {
            const i = y * CONFIG.worldWidth + x;
            grid[i] = y < groundLevel ? TYPE_AIR : TYPE_DIRT;
            pheroHome[i] = 0;
            pheroFood[i] = 0;
        }
    }
}

const isValid = (x, y) => x >= 0 && x < CONFIG.worldWidth && y >= 0 && y < CONFIG.worldHeight;
const getIdx = (x, y) => Math.floor(y) * CONFIG.worldWidth + Math.floor(x);

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
    }
    update() {
        this.age++;
        this.hunger++;
        const myIdx = getIdx(this.x, this.y);
        pheroHome[myIdx] += 0.5; // Signal "Feed Me"

        if (this.age > this.pupateTime) {
            this.alive = false;
            colony.push(new Worker(this.x, this.y));
        }
    }
    feed() {
        this.hunger = 0;
        this.age += 200;
    }
}

class Ant extends BiologicalEntity {
    constructor(x, y) {
        super(x, y);
        this.dirX = Math.random() > 0.5 ? 1 : -1;
        this.dirY = 0;
        this.holdingDirt = false; // New property
    }

    moveRandomly() {
        // Gravity in Sky
        if (this.y < 30) {
            // Cannot fly! Fall down
            this.tryMove(this.x, this.y + 1);
            return;
        }

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
                this.holdingDirt = true; // Pick it up!
                this.x = tx;
                this.y = ty;
                return true;
            }
            return false;
        } else {
            // Check for dropping dirt?
            // If holding dirt, and we step into AIR.
            // Do we drop it? NO, we carry it.
            // We only drop it if we decide to.

            this.x = tx;
            this.y = ty;

            const below = getIdx(tx, ty + 1);
            if (isValid(tx, ty + 1) && grid[below] === TYPE_AIR && Math.random() < 0.05) {
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
    }

    update() {
        const idx = getIdx(this.x, this.y);
        pheroHome[idx] = 1.0;

        // Queen destroys dirt (eating/clearing) to make initial space
        // She is exempt from conservation of mass for the royal chamber

        if (this.state === 'DIG_CHAMBER') {
            if (this.y < 150) {
                this.dirY = 1;
                // Widen shaft as we go
                const idx = getIdx(this.x, this.y);
                if (Math.random() < 0.5) grid[idx - 1] = TYPE_AIR;
                if (Math.random() < 0.5) grid[idx + 1] = TYPE_AIR;

                this.tryMove(this.x, this.y + 1);
            } else {
                this.clearChamber();
                this.state = 'LAY_EGGS';
            }
        } else if (this.state === 'LAY_EGGS') {
            this.eggTimer++;
            if (this.eggTimer > 200) {
                brood.push(new Egg(this.x + (Math.random() - 0.5) * 4, this.y));
                this.eggTimer = 0;
            }
            if (Math.random() < 0.1) {
                this.moveRandomly();
                if (this.y < 90) this.y = 90; // Allow moving up to near surface
            }
        }
    }

    tryMove(tx, ty) {
        if (!isValid(tx, ty)) return false;
        const idx = getIdx(tx, ty);
        if (grid[idx] === TYPE_DIRT) grid[idx] = TYPE_AIR; // Queen deletes dirt
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
    }

    update() {
        const idx = getIdx(this.x, this.y);

        // Pheromones
        if (this.hasFood) pheroFood[idx] = Math.min(1.0, pheroFood[idx] + 0.5);
        else pheroHome[idx] = Math.min(1.0, pheroHome[idx] + 0.1);

        // State Machine
        if (this.holdingDirt) {
            this.doDumpDir();
        } else if (this.hasFood) {
            this.doReturn();
        } else {
            this.doForage();
        }
    }

    doDumpDir() {
        // Goal: Go Up until we find air above dirt (Surface)
        // Then drop it to build a hll

        const idx = getIdx(this.x, this.y);
        const belowIdx = getIdx(this.x, this.y + 1);

        // If we are standing on dirt (or a hill)
        if (isValid(this.x, this.y + 1) && grid[belowIdx] === TYPE_DIRT) {
            // And current spot is AIR
            if (grid[idx] === TYPE_AIR) {
                // Drop it!
                // Random chance to keep moving up to make pile higher?
                // No, just drop it to form a pile "angle of repose" naturally happens if they move randomly
                if (Math.random() < 0.8) {
                    grid[idx] = TYPE_DIRT;
                    this.holdingDirt = false;
                    this.y--; // Jump on top of new pile
                    return;
                }
            }
        }

        // Otherwise keep moving Up/Randomly
        // Bias Upwards to find surface
        if (Math.random() < 0.9) {
            // Try move up
            if (!this.tryMove(this.x, this.y - 1)) {
                this.moveRandomly(); // Blocked moving up, wander
            }
        } else {
            this.moveRandomly();
        }
    }

    doForage() {
        const nearbyFoodIdx = food.findIndex(f => Math.abs(f.x - this.x) < 2 && Math.abs(f.y - this.y) < 2);
        if (nearbyFoodIdx !== -1) {
            food.splice(nearbyFoodIdx, 1);
            this.hasFood = true;
            this.dirY = -1;
            return;
        }

        if (Math.random() < 0.8) this.followPheromone(pheroFood);
        else this.moveRandomly();
    }

    doReturn() {
        if (this.y > 90) { // Consider "Home" higher up
            const larva = brood.find(b => b instanceof Larva && Math.abs(b.x - this.x) < 5 && Math.abs(b.y - this.y) < 5);
            if (larva) larva.feed();
            this.hasFood = false;
            return;
        }

        if (Math.random() < 0.8) {
            const moved = this.followPheromone(pheroHome);
            if (!moved && Math.random() < 0.5) this.tryMove(this.x, this.y + 1);
        } else {
            this.moveRandomly();
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
const queen = new Queen(CONFIG.worldWidth / 2, 80);
colony.push(queen);
for (let i = 0; i < CONFIG.initialAnts; i++) {
    colony.push(new Worker(CONFIG.worldWidth / 2 + (Math.random() - 0.5) * 10, 80));
}

// Surface Food Spawner
setInterval(() => {
    if (food.length < 50) {
        food.push(new Food(Math.random() * CONFIG.worldWidth, 80));
    }
}, 500);


// 3D Rendering Setup
const texture = new THREE.CanvasTexture(canvas);
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.colorSpace = THREE.SRGBColorSpace;
const geometry = new THREE.PlaneGeometry(400, 300); // 1:1 pixel to unit? No, scale it down.
// 400x300 pixels. Let's make the plane 40x30 units.
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
    for (let i = 0; i < pheroHome.length; i++) {
        // Fast decay in air
        pheroHome[i] *= 0.99;
        pheroFood[i] *= 0.99;
    }

    // Draw directly
    ctx.fillStyle = CONFIG.tunnelColor;
    ctx.fillRect(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);

    // Sky
    ctx.fillStyle = CONFIG.skyColor;
    ctx.fillRect(0, 0, CONFIG.worldWidth, 80);

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
        if (type === TYPE_DIRT) {
            const idx = i * 4;
            data[idx] = cDirt[0];
            data[idx + 1] = cDirt[1];
            data[idx + 2] = cDirt[2];
            data[idx + 3] = 255;
        } else if (type === TYPE_AIR && Math.floor(i / CONFIG.worldWidth) < 80) {
            const idx = i * 4;
            data[idx] = cSky[0];
            data[idx + 1] = cSky[1];
            data[idx + 2] = cSky[2];
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Entities
    ctx.fillStyle = CONFIG.eggColor;
    brood.forEach(b => { if (b instanceof Egg && b.alive) ctx.fillRect(b.x, b.y, 1, 1); });

    ctx.fillStyle = CONFIG.larvaColor;
    brood.forEach(b => { if (b instanceof Larva && b.alive) ctx.fillRect(b.x, b.y, 2, 2); });

    ctx.fillStyle = CONFIG.foodColor;
    food.forEach(f => ctx.fillRect(f.x, f.y, 2, 2));

    colony.forEach(ant => {
        if (!ant.alive) return;
        if (ant instanceof Queen) {
            ctx.fillStyle = CONFIG.queenColor;
            ctx.fillRect(ant.x - 1, ant.y - 1, 3, 3);
        } else {
            if (ant.holdingDirt) ctx.fillStyle = CONFIG.dirtColor;
            else if (ant.hasFood) ctx.fillStyle = '#00ff00';
            else ctx.fillStyle = CONFIG.antColor;

            ctx.fillRect(ant.x, ant.y, 1, 1);
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
pane.addBinding(CONFIG, 'simSpeed', { min: 1, max: 20 });
const btn = pane.addButton({ title: 'Spawn Food' });
btn.on('click', () => {
    food.push(new Food(CONFIG.worldWidth / 2, 80));
});

// Interaction: Drop Sugar
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const planeMesh = scene.children.find(c => c.geometry.type === 'PlaneGeometry' && c.geometry.parameters.width === 40);

window.addEventListener('pointerdown', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(planeMesh);

    if (intersects.length > 0) {
        const uv = intersects[0].uv;
        // Convert UV to World Grid Coordinates
        // UV (0,0) is bottom-left
        // Grid (0,0) is top-left
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
