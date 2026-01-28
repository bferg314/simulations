import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Tweakpane is loaded via script tag in global scope or via import if using module version
// Specifically for the CDN import map above, we can import from the mapped URL
import { Pane } from 'tweakpane';

// Configuration
const CONFIG = {
    flowerCount: 50,
    growthSpeed: 1.0,
    lifeSpan: 5.0, // Seconds before dying
    windStrength: 0.1,
    groundColor: '#1a472a',
    flowerColor: '#ff69b4',
    stemColor: '#2d5a27',
};

class Flower {
    constructor(scene, x, z) {
        this.scene = scene;
        this.isActive = true;
        this.age = 0;
        this.maxAge = CONFIG.lifeSpan + (Math.random() * 2 - 1); // Variance
        this.scale = 0;

        // Random characteristics
        this.height = 1.5 + Math.random() * 1.5;
        this.bend = (Math.random() - 0.5) * 0.5;

        // Group to hold stem and petals
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.02, 0.05, this.height, 5);
        stemGeo.translate(0, this.height / 2, 0); // Pivot at bottom
        const stemMat = new THREE.MeshStandardMaterial({ color: CONFIG.stemColor, roughness: 0.8 });
        this.stem = new THREE.Mesh(stemGeo, stemMat);
        this.mesh.add(this.stem);

        // Flower Head (simplified)
        const petalGeo = new THREE.ConeGeometry(0.3, 0.5, 6);
        petalGeo.translate(0, 0.25, 0);
        const petalMat = new THREE.MeshStandardMaterial({ color: CONFIG.flowerColor, roughness: 0.5 });
        this.head = new THREE.Mesh(petalGeo, petalMat);
        this.head.position.y = this.height;
        this.head.rotation.x = Math.PI; // Point up
        this.mesh.add(this.head);

        scene.add(this.mesh);
    }

    update(dt, time) {
        if (!this.isActive) return;

        this.age += dt * CONFIG.growthSpeed;

        // Growth Phase
        if (this.age < 1) {
            this.scale = Math.min(this.age, 1);
            this.mesh.scale.set(this.scale, this.scale, this.scale);
        }
        // Wither Phase
        else if (this.age > this.maxAge - 1) {
            const deathProgress = 1 - (this.maxAge - this.age);
            // Shrink and droop
            this.mesh.scale.setScalar(Math.max(0, 1 - deathProgress));
            this.mesh.rotation.z = this.bend + deathProgress;
        }

        // Wind Effect
        this.mesh.rotation.x = Math.sin(time * 2 + this.mesh.position.x) * CONFIG.windStrength;
        this.mesh.rotation.z = this.bend + Math.cos(time * 1.5 + this.mesh.position.z) * CONFIG.windStrength;

        // Reset if dead
        if (this.age >= this.maxAge) {
            this.reset();
        }
    }

    updateColors() {
        this.stem.material.color.set(CONFIG.stemColor);
        this.head.material.color.set(CONFIG.flowerColor);
    }

    reset() {
        this.age = 0;
        this.maxAge = CONFIG.lifeSpan + (Math.random() * 2 - 1);
        this.mesh.scale.set(0, 0, 0);
        this.mesh.rotation.set(0, 0, 0);
        // Maybe move position?
        // this.mesh.position.set(...) 
    }

    dispose() {
        this.scene.remove(this.mesh);
        // Geometry/Material disposal to prevent leaks in a real app
    }
}

// Scene Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x111111, 0.05);
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below ground

// Lighting
const ambientLight = new THREE.AmbientLight(0x444444);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// Ground
const groundGeo = new THREE.PlaneGeometry(50, 50, 64, 64);
const groundMat = new THREE.MeshStandardMaterial({
    color: CONFIG.groundColor,
    roughness: 1,
    displacementScale: 0.5
});
// Simple noise displacement (if we had noise lib, for now just flat is fine or simple bumps)
const posAttribute = groundGeo.attributes.position;
for (let i = 0; i < posAttribute.count; i++) {
    const z = posAttribute.getZ(i);
    // Just a little random height variation
    posAttribute.setZ(i, z + (Math.random() - 0.5) * 0.5);
}
groundGeo.computeVertexNormals();

const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Flowers Array
let flowers = [];

function initFlowers() {
    // Clear existing
    flowers.forEach(f => f.dispose());
    flowers = [];

    for (let i = 0; i < CONFIG.flowerCount; i++) {
        const x = (Math.random() - 0.5) * 20;
        const z = (Math.random() - 0.5) * 20;
        // Stagger starts
        const flower = new Flower(scene, x, z);
        flower.age = -Math.random() * 5; // Start "unborn"
        flowers.push(flower);
    }
}

initFlowers();

// Tweakpane
const pane = new Pane({ title: 'Simulation Settings' });
const tab = pane.addTab({ pages: [{ title: 'General' }, { title: 'Colors' }] });

// General Settings
tab.pages[0].addBinding(CONFIG, 'flowerCount', { min: 10, max: 200, step: 10 }).on('change', initFlowers);
tab.pages[0].addBinding(CONFIG, 'growthSpeed', { min: 0.1, max: 5.0 });
tab.pages[0].addBinding(CONFIG, 'lifeSpan', { min: 2.0, max: 10.0 });
tab.pages[0].addBinding(CONFIG, 'windStrength', { min: 0.0, max: 0.5 });

// Color Settings
tab.pages[1].addBinding(CONFIG, 'groundColor').on('change', () => ground.material.color.set(CONFIG.groundColor));
tab.pages[1].addBinding(CONFIG, 'flowerColor').on('change', () => flowers.forEach(f => f.updateColors()));
tab.pages[1].addBinding(CONFIG, 'stemColor').on('change', () => flowers.forEach(f => f.updateColors()));

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const time = clock.getElapsedTime();

    controls.update();

    flowers.forEach(flower => flower.update(dt, time));

    renderer.render(scene, camera);
}

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
