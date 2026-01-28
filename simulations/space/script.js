import * as THREE from 'three';
import { Pane } from 'tweakpane';

// Config
const CONFIG = {
    warpSpeed: 0.5,
    starCount: 5000,
    starSize: 0.1,
    galaxyFrequency: 0.005, // Chance per frame to spawn a galaxy
    fogDensity: 0.0005,
    cameraShake: 0.0,
    color: { r: 0.4, g: 0.6, b: 1.0 } // Base galaxy color
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

// Stars Background (Starfield that moves past)
// We use a cylinder of stars that we reuse/wrap
const starGeo = new THREE.BufferGeometry();
const starPos = [];
const starVelo = []; // Not used directly, we move the whole system or positions

// Create a tunnel of stars
const tunnelRadius = 50;
const tunnelLength = 1000;

for (let i = 0; i < CONFIG.starCount; i++) {
    const r = tunnelRadius + Math.random() * 200; // Radius from center
    const theta = Math.random() * Math.PI * 2;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = (Math.random() - 0.5) * tunnelLength;

    starPos.push(x, y, z);
}

starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: CONFIG.starSize,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
});
const starSystem = new THREE.Points(starGeo, starMat);
scene.add(starSystem);

// Galaxies (Procedural Objects)
const galaxies = [];

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
const pane = new Pane({ title: 'Flight Console' });
pane.addBinding(CONFIG, 'warpSpeed', { min: 0.1, max: 10.0 });
pane.addBinding(CONFIG, 'galaxyFrequency', { min: 0.001, max: 0.05 });
pane.addBinding(CONFIG, 'starSize', { min: 0.05, max: 0.5 }).on('change', () => {
    starMat.size = CONFIG.starSize;
});
pane.addBinding(CONFIG, 'color', { color: { type: 'float' } });


// Loop
const clock = new THREE.Clock();
let speedMultiplier = 1.0;
let targetMultiplier = 1.0;

window.addEventListener('mousedown', () => targetMultiplier = 8.0);
window.addEventListener('mouseup', () => targetMultiplier = 1.0);
window.addEventListener('touchstart', () => targetMultiplier = 8.0);
window.addEventListener('touchend', () => targetMultiplier = 1.0);

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Smoothly transition speed
    speedMultiplier += (targetMultiplier - speedMultiplier) * 5 * delta;

    const speed = CONFIG.warpSpeed * 200 * delta * speedMultiplier; // Speed tuning

    // Move Stars
    const positions = starGeo.attributes.position.array;
    for (let i = 0; i < CONFIG.starCount; i++) {
        // Move z toward camera (increasing Z)
        positions[i * 3 + 2] += speed * 0.5; // Stars move slower for parallax? Or faster?
        // Let's reset if they pass camera
        if (positions[i * 3 + 2] > 10) {
            positions[i * 3 + 2] -= tunnelLength;
        }
    }
    starGeo.attributes.position.needsUpdate = true;

    // Spawn Galaxies
    if (Math.random() < CONFIG.galaxyFrequency) {
        // Spawn far away (-Z)
        galaxies.push(new Galaxy(-500));
    }

    // Update Galaxies & Cleanup
    for (let i = galaxies.length - 1; i >= 0; i--) {
        const g = galaxies[i];
        g.update(speed);

        // If passed camera
        if (g.group.position.z > 50) {
            g.dispose();
            galaxies.splice(i, 1);
        }
    }

    // Camera shake (optional)
    if (CONFIG.cameraShake > 0) {
        camera.position.x = (Math.random() - 0.5) * CONFIG.cameraShake;
        camera.position.y = (Math.random() - 0.5) * CONFIG.cameraShake;
    }

    renderer.render(scene, camera);
}

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
