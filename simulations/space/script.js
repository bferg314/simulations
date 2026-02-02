import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const ChromaticAberrationShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "amount": { value: 0.005 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUv;
        void main() {
            vec4 col;
            col.r = texture2D(tDiffuse, vUv + vec2(amount, 0.0)).r;
            col.g = texture2D(tDiffuse, vUv).g;
            col.b = texture2D(tDiffuse, vUv - vec2(amount, 0.0)).b;
            col.a = 1.0;
            gl_FragColor = col;
        }
    `
};

// Config
const CONFIG = {
    warpSpeed: 0.5,
    starCount: 10000,
    starSize: 0.1,
    galaxyFrequency: 0.005,
    nebulaFrequency: 0.002,
    asteroidFrequency: 0.01,
    planetFrequency: 0.0005,
    blackHoleFrequency: 0.0002,
    stationFrequency: 0.0003,
    fogDensity: 0.0005,
    cameraShake: 0.0,
    hyperspace: true,
    color: { r: 0.4, g: 0.6, b: 1.0 }
};

// Scene
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, CONFIG.fogDensity);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.z = 0;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const sunLight = new THREE.PointLight(0xffffff, 3, 2000);
sunLight.position.set(0, 0, -500);
scene.add(sunLight);

// Sun Object
const sunGeom = new THREE.SphereGeometry(20, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
const sun = new THREE.Mesh(sunGeom, sunMat);
sun.position.set(0, 0, -500);
scene.add(sun);

// Post Processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0;
bloomPass.strength = 1.0;
bloomPass.radius = 0.5;

const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(chromaticAberrationPass);

// Stars Background (Starfield that moves past)
// We use a cylinder of stars that we reuse/wrap
// Stars Background (LineSegments for stretching)
const starGeo = new THREE.BufferGeometry();
const starPos = [];

const tunnelRadius = 50;
const tunnelLength = 1000;

for (let i = 0; i < CONFIG.starCount; i++) {
    const r = tunnelRadius + Math.random() * 200;
    const theta = Math.random() * Math.PI * 2;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = (Math.random() - 0.5) * tunnelLength;

    // Start point
    starPos.push(x, y, z);
    // End point (initially same, will stretch)
    starPos.push(x, y, z);
}

starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});
const starSystem = new THREE.LineSegments(starGeo, starMat);
scene.add(starSystem);

// Textures
const textureLoader = new THREE.TextureLoader();
const nebulaTexture = textureLoader.load('./assets/nebula.png');

// Objects
const galaxies = [];
const nebulas = [];
const asteroids = [];
const planets = [];
const blackHoles = [];
const stations = [];

class BlackHole {
    constructor(zPos) {
        this.group = new THREE.Group();
        this.group.position.set((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, zPos);

        // Event Horizon
        const coreGeom = new THREE.SphereGeometry(10, 32, 32);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.core = new THREE.Mesh(coreGeom, coreMat);
        this.group.add(this.core);

        // Accretion Disk
        const diskGeom = new THREE.TorusGeometry(18, 5, 2, 100);
        const diskMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            emissive: 0xff5500,
            emissiveIntensity: 5,
            transparent: true,
            opacity: 0.8
        });
        this.disk = new THREE.Mesh(diskGeom, diskMat);
        this.disk.rotation.x = Math.PI / 2.2;
        this.group.add(this.disk);

        // Photon Sphere (Glow shell)
        const photonGeom = new THREE.SphereGeometry(12, 32, 32);
        const photonMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending
        });
        this.photonSphere = new THREE.Mesh(photonGeom, photonMat);
        this.group.add(this.photonSphere);

        // Relativistic Jets (Polar Beams)
        const jetGeom = new THREE.CylinderGeometry(0.5, 3, 300, 16, 1, true);
        const jetMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });

        this.jetTop = new THREE.Mesh(jetGeom, jetMat);
        this.jetTop.position.y = 150;
        this.group.add(this.jetTop);

        this.jetBottom = this.jetTop.clone();
        this.jetBottom.position.y = -150;
        this.jetBottom.rotation.z = Math.PI;
        this.group.add(this.jetBottom);

        scene.add(this.group);
    }

    update(speed) {
        this.group.position.z += speed;
        this.disk.rotation.z += 0.05;
        this.photonSphere.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.1);

        // Tilt slightly towards camera
        this.group.lookAt(camera.position);
    }

    dispose() {
        scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}

class SpaceStation {
    constructor(zPos) {
        this.group = new THREE.Group();
        this.group.position.set((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, zPos);

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 10, 8),
            new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 })
        );
        body.rotation.z = Math.PI / 2;
        this.group.add(body);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(6, 0.5, 8, 32),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        this.group.add(ring);

        // Blinking lights
        this.lights = [];
        for (let i = 0; i < 4; i++) {
            const light = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 8, 8),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
            );
            light.position.set(Math.cos(i * Math.PI / 2) * 6, Math.sin(i * Math.PI / 2) * 6, 0);
            this.group.add(light);
            this.lights.push(light);
        }

        scene.add(this.group);
    }

    update(speed) {
        this.group.position.z += speed;
        this.group.rotation.z += 0.01;
        this.lights.forEach(l => l.material.opacity = Math.sin(Date.now() * 0.01) > 0 ? 1 : 0);
    }

    dispose() {
        scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}

class Nebula {
    constructor(zPos) {
        this.group = new THREE.Group();
        this.group.position.set(
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 100,
            zPos
        );

        const particleCount = 20;
        const geom = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];

        const colorBase = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);

        for (let i = 0; i < particleCount; i++) {
            positions.push(
                (Math.random() - 0.5) * 50,
                (Math.random() - 0.5) * 50,
                (Math.random() - 0.5) * 50
            );

            const c = colorBase.clone().multiplyScalar(0.5 + Math.random() * 0.5);
            colors.push(c.r, c.g, c.b);
            sizes.push(20 + Math.random() * 40);
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geom.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: 40,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.15,
            map: nebulaTexture
        });

        this.mesh = new THREE.Points(geom, mat);
        this.group.add(this.mesh);
        scene.add(this.group);
    }

    update(speed) {
        this.group.position.z += speed;
    }

    dispose() {
        scene.remove(this.group);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

class Asteroid {
    constructor(zPos) {
        this.mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(Math.random() * 2, 1),
            new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true })
        );

        this.mesh.position.set(
            (Math.random() - 0.5) * 150,
            (Math.random() - 0.5) * 150,
            zPos
        );

        this.rotationSpeed = {
            x: (Math.random() - 0.5) * 0.05,
            y: (Math.random() - 0.5) * 0.05,
            z: (Math.random() - 0.5) * 0.05
        };

        scene.add(this.mesh);
    }

    update(speed) {
        this.mesh.position.z += speed;
        this.mesh.rotation.x += this.rotationSpeed.x;
        this.mesh.rotation.y += this.rotationSpeed.y;
        this.mesh.rotation.z += this.rotationSpeed.z;
    }

    dispose() {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// Planet Class
class Planet {
    constructor(zPos) {
        this.group = new THREE.Group();

        const radius = 5 + Math.random() * 10;
        const geom = new THREE.SphereGeometry(radius, 32, 32);

        // Procedural color
        const color = new THREE.Color().setHSL(Math.random(), 0.5, 0.4);
        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: 0.2
        });

        this.mesh = new THREE.Mesh(geom, mat);
        this.group.add(this.mesh);

        // Optional Rings
        if (Math.random() > 0.7) {
            const ringGeom = new THREE.RingGeometry(radius + 2, radius + 8, 64);
            const ringMat = new THREE.MeshStandardMaterial({
                color: color.clone().multiplyScalar(1.2),
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6
            });
            const ring = new THREE.Mesh(ringGeom, ringMat);
            ring.rotation.x = Math.PI / 2;
            this.group.add(ring);
        }

        this.group.position.set(
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 200,
            zPos
        );

        scene.add(this.group);
    }

    update(speed) {
        this.group.position.z += speed;
        this.group.rotation.y += 0.005;
    }

    dispose() {
        scene.remove(this.group);
        this.group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}

// Planets are already declared in the main objects section

class Galaxy {
    constructor(zPos) {
        this.group = new THREE.Group();
        this.group.position.set(
            (Math.random() - 0.5) * 60, // Random X offset
            (Math.random() - 0.5) * 60, // Random Y offset
            zPos // Start far ahead
        );

        // Randomly choose galaxy type: Spiral, Elliptical (Cloud)
        const type = Math.random() > 0.5 ? 'spiral' : 'cloud';

        const particleCount = type === 'spiral' ? 1000 : 500;
        const geom = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const colorBase = new THREE.Color(Math.random(), Math.random(), Math.random());
        // Mix with config color
        colorBase.lerp(new THREE.Color(CONFIG.color.r, CONFIG.color.g, CONFIG.color.b), 0.5);

        for (let i = 0; i < particleCount; i++) {
            let x, y, z;

            if (type === 'spiral') {
                const angle = i * 0.1;
                const radius = i * 0.02;
                // Add some noise
                x = Math.cos(angle) * radius + (Math.random() - 0.5);
                y = (Math.random() - 0.5) * 2; // Flat
                z = Math.sin(angle) * radius + (Math.random() - 0.5);
            } else {
                // Cloud
                const r = 10 * Math.random();
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                x = r * Math.sin(phi) * Math.cos(theta);
                y = r * Math.sin(phi) * Math.sin(theta);
                z = r * Math.cos(phi);
            }

            positions.push(x, y, z);

            const c = colorBase.clone();
            // Vary brightness
            c.multiplyScalar(0.5 + Math.random() * 0.5);
            colors.push(c.r, c.g, c.b);
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            map: getGradientTexture() // Helper function for soft particles
        });

        this.mesh = new THREE.Points(geom, mat);

        // Random rotation
        this.mesh.rotation.x = Math.random() * Math.PI;
        this.mesh.rotation.z = Math.random() * Math.PI;

        this.group.add(this.mesh);
        scene.add(this.group);
    }

    update(speed) {
        this.group.position.z += speed;
        this.mesh.rotation.y += 0.001; // Slow spin
    }

    dispose() {
        scene.remove(this.group);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// Generate simple circle texture for particles
function getGradientTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}


// Tweakpane
// Tweakpane with Draggable Logic
const consoleContainer = document.getElementById('console-container');
const pane = new Pane({
    container: consoleContainer,
    title: 'Flight Console',
    expanded: true
});

// Dragging Logic
const handle = document.getElementById('console-handle');
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

handle.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', dragEnd);

function dragStart(e) {
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    if (e.target === handle) isDragging = true;
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        consoleContainer.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
}

function dragEnd() {
    isDragging = false;
}

pane.addBinding(CONFIG, 'warpSpeed', { min: 0.1, max: 10.0 });
pane.addBinding(CONFIG, 'galaxyFrequency', { min: 0.001, max: 0.05 });
pane.addBinding(CONFIG, 'nebulaFrequency', { min: 0.001, max: 0.05 });
pane.addBinding(CONFIG, 'asteroidFrequency', { min: 0.001, max: 0.05 });
pane.addBinding(CONFIG, 'planetFrequency', { min: 0.0001, max: 0.005 });
pane.addBinding(CONFIG, 'blackHoleFrequency', { min: 0.0001, max: 0.002 });
pane.addBinding(CONFIG, 'stationFrequency', { min: 0.0001, max: 0.002 });
pane.addBinding(CONFIG, 'fogDensity', { min: 0.0, max: 0.005 }).on('change', () => {
    scene.fog.density = CONFIG.fogDensity;
});
pane.addBinding(CONFIG, 'hyperspace');
pane.addBinding(CONFIG, 'color', { color: { type: 'float' } }).on('change', () => {
    const c = CONFIG.color;
    ambientLight.color.setRGB(c.r, c.g, c.b);
    // Make stars take on a hint of the galaxy color
    starMat.color.setRGB(0.6 + c.r * 0.4, 0.6 + c.g * 0.4, 0.6 + c.b * 0.4);
});
pane.addBinding(CONFIG, 'starSize', { min: 0.01, max: 1.0 }).on('change', () => {
    // For LineSegments, we'll map "size" to opacity for a shimmering effect
    starMat.opacity = 0.2 + CONFIG.starSize * 0.8;
});

pane.addBlade({ view: 'separator' });

pane.addButton({
    title: '🎲 RANDOMIZE ADVENTURE',
}).on('click', () => {
    // Randomize all frequencies
    const freqs = ['galaxyFrequency', 'nebulaFrequency', 'asteroidFrequency', 'planetFrequency', 'blackHoleFrequency', 'stationFrequency'];
    freqs.forEach(f => {
        CONFIG[f] = Math.random() * 0.02; // Give them a decent range
    });

    // Randomize visuals
    CONFIG.warpSpeed = 0.1 + Math.random() * 2.0;
    CONFIG.fogDensity = Math.random() * 0.002;
    CONFIG.color = { r: Math.random(), g: Math.random(), b: Math.random() };

    // Update Scene
    scene.fog.density = CONFIG.fogDensity;
    ambientLight.color.setRGB(CONFIG.color.r, CONFIG.color.g, CONFIG.color.b);

    pane.refresh();
});


// Loop
const clock = new THREE.Clock();
let speedMultiplier = 1.0;
let targetMultiplier = 1.0;

// HUD Elements
const velocityUI = document.getElementById('velocity-ui');
const scannerUI = document.querySelector('.hud-bottom div:last-child');
const hud = document.getElementById('hud');
const warpWarning = document.getElementById('warp-warning');

window.addEventListener('mousedown', (e) => {
    if (consoleContainer.contains(e.target)) return;
    targetMultiplier = 12.0; // More drama!
    hud.classList.add('scanner-active');
    scannerUI.innerText = 'SCANNER: SCANNING...';
    if (CONFIG.hyperspace) warpWarning.style.display = 'flex';
});
window.addEventListener('mouseup', () => {
    targetMultiplier = 1.0;
    hud.classList.remove('scanner-active');
    scannerUI.innerText = 'SCANNER: IDLE';
    warpWarning.style.display = 'none';
});
window.addEventListener('touchstart', (e) => {
    if (consoleContainer.contains(e.target)) return;
    targetMultiplier = 12.0;
    hud.classList.add('scanner-active');
    if (CONFIG.hyperspace) warpWarning.style.display = 'flex';
});
window.addEventListener('touchend', () => {
    targetMultiplier = 1.0;
    hud.classList.remove('scanner-active');
    warpWarning.style.display = 'none';
});

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Smoothly transition speed
    speedMultiplier += (targetMultiplier - speedMultiplier) * 3 * delta;

    // Warp FX: FOV change & Heartbeat Pulse
    let baseFov = 60 + (speedMultiplier - 1) * 3;
    let heartbeat = 0;
    if (speedMultiplier > 5) {
        heartbeat = Math.sin(Date.now() * 0.01) * (speedMultiplier - 5) * 0.5;
    }
    camera.fov = baseFov + heartbeat;
    camera.updateProjectionMatrix();

    // Chromatic Aberration Intensity
    chromaticAberrationPass.uniforms.amount.value = (speedMultiplier - 1) * 0.002;

    const speed = CONFIG.warpSpeed * 200 * delta * speedMultiplier;

    // Update HUD
    if (velocityUI) {
        velocityUI.innerText = (CONFIG.warpSpeed * speedMultiplier).toFixed(2);
    }

    // Move Stars & Handle Streaks
    const positions = starGeo.attributes.position.array;
    const isWarping = CONFIG.hyperspace && speedMultiplier > 2;

    for (let i = 0; i < CONFIG.starCount; i++) {
        const idx = i * 6; // Two points per star (6 floats)

        let zMove = speed * 0.5;

        // Move both points together
        positions[idx + 2] += zMove;
        positions[idx + 5] += zMove;

        // Reset if passed camera
        if (positions[idx + 2] > 10) {
            positions[idx + 2] -= tunnelLength;
            positions[idx + 5] -= tunnelLength;
        }

        // Apply Streaking
        const isWarping = CONFIG.hyperspace && speedMultiplier > 2;
        const minStreak = 0.5; // Ensure stars are visible as points

        if (isWarping) {
            const streakLength = minStreak + (speedMultiplier - 1) * 2.0;
            positions[idx + 5] = positions[idx + 2] - streakLength;
        } else {
            // Static streak for visibility
            positions[idx + 5] = positions[idx + 2] - minStreak;
        }
    }
    starGeo.attributes.position.needsUpdate = true;

    // Spawn Galaxies
    if (Math.random() < CONFIG.galaxyFrequency) {
        galaxies.push(new Galaxy(-1000));
    }

    // Spawn Nebulas
    if (Math.random() < CONFIG.nebulaFrequency) {
        nebulas.push(new Nebula(-1500));
    }

    // Spawn Asteroids
    if (Math.random() < CONFIG.asteroidFrequency) {
        asteroids.push(new Asteroid(-1000));
    }

    // Spawn Planets
    if (Math.random() < CONFIG.planetFrequency) {
        planets.push(new Planet(-2000));
    }

    // Spawn Black Holes
    if (Math.random() < CONFIG.blackHoleFrequency) {
        blackHoles.push(new BlackHole(-2500));
    }

    // Spawn Stations
    if (Math.random() < CONFIG.stationFrequency) {
        stations.push(new SpaceStation(-1500));
    }

    // Update Galaxies & Cleanup
    for (let i = galaxies.length - 1; i >= 0; i--) {
        const g = galaxies[i];
        g.update(speed);

        if (g.group.position.z > 50) {
            g.dispose();
            galaxies.splice(i, 1);
        }
    }

    // Update Nebulas
    for (let i = nebulas.length - 1; i >= 0; i--) {
        const n = nebulas[i];
        n.update(speed);

        if (n.group.position.z > 200) {
            n.dispose();
            nebulas.splice(i, 1);
        }
    }

    // Update Asteroids
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        a.update(speed);

        if (a.mesh.position.z > 50) {
            a.dispose();
            asteroids.splice(i, 1);
        }
    }

    // Update Planets
    for (let i = planets.length - 1; i >= 0; i--) {
        const p = planets[i];
        p.update(speed);

        if (p.group.position.z > 100) {
            p.dispose();
            planets.splice(i, 1);
        }
    }

    // Update Black Holes
    for (let i = blackHoles.length - 1; i >= 0; i--) {
        const bh = blackHoles[i];
        bh.update(speed);

        if (bh.group.position.z > 100) {
            bh.dispose();
            blackHoles.splice(i, 1);
        }
    }

    // Update Stations
    for (let i = stations.length - 1; i >= 0; i--) {
        const s = stations[i];
        s.update(speed);

        if (s.group.position.z > 100) {
            s.dispose();
            stations.splice(i, 1);
        }
    }

    // Proximity Drama: Check distance to black holes
    let proximityDrama = 0;
    for (const bh of blackHoles) {
        const dist = bh.group.position.length();
        if (dist < 300) {
            proximityDrama = Math.max(proximityDrama, (1 - dist / 300));
        }
    }

    // Camera shake (optional)
    const shakeAmount = CONFIG.cameraShake + (speedMultiplier - 1) * 0.05 + proximityDrama * 0.2;
    if (shakeAmount > 0) {
        camera.position.x = (Math.random() - 0.5) * shakeAmount;
        camera.position.y = (Math.random() - 0.5) * shakeAmount;
    } else {
        camera.position.x = 0;
        camera.position.y = 0;
    }

    // Proximity Chromatic Aberration
    chromaticAberrationPass.uniforms.amount.value = (speedMultiplier - 1) * 0.002 + proximityDrama * 0.01;

    // HUD Interference
    if (proximityDrama > 0.5) {
        hud.style.opacity = 0.5 + Math.random() * 0.5;
        scannerUI.innerText = '⚠️ GRAVITY ANOMALY DETECTED';
    } else if (targetMultiplier === 1.0) {
        hud.style.opacity = 1.0;
    }

    composer.render();
}

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Pre-spawn some objects for an immediate "full" feeling
for (let i = 0; i < 5; i++) {
    galaxies.push(new Galaxy(-Math.random() * 800));
}
for (let i = 0; i < 3; i++) {
    nebulas.push(new Nebula(-Math.random() * 1000));
}
for (let i = 0; i < 20; i++) {
    asteroids.push(new Asteroid(-Math.random() * 500));
}

animate();
