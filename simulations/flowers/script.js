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

// Flower Types Definitions
const FLOWER_TYPES = [
    { name: 'Standard', type: 'cone', color: '#ff69b4' },
    { name: 'Daisy', type: 'daisy', color: '#ffffff', center: '#ffcc00' },
    { name: 'Tulip', type: 'tulip', color: '#ff0055' },
    { name: 'Sunflower', type: 'sunflower', color: '#ffcc00', center: '#3e2723' },
    { name: 'Lavender', type: 'lavender', color: '#9d7bb0' },
    { name: 'Rose', type: 'rose', color: '#d32f2f' },
    { name: 'Bluebell', type: 'bluebell', color: '#3f51b5' },
    { name: 'Dandelion', type: 'dandelion', color: '#ffffff' },
    { name: 'Poppy', type: 'poppy', color: '#f44336', center: '#212121' },
    { name: 'Lily', type: 'lily', color: '#ff9800' }
];

class Flower {
    constructor(scene, x, z) {
        this.scene = scene;
        this.isActive = true;
        this.age = 0;
        this.maxAge = CONFIG.lifeSpan + (Math.random() * 2 - 1); // Variance
        this.scale = 0;

        // Pick a random type
        this.typeData = FLOWER_TYPES[Math.floor(Math.random() * FLOWER_TYPES.length)];

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

        // Flower Head
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = this.height;
        this.buildHead();
        this.mesh.add(this.headGroup);

        scene.add(this.mesh);
    }

    buildHead() {
        const t = this.typeData;
        const mainColor = new THREE.Color(t.color);
        const centerColor = t.center ? new THREE.Color(t.center) : new THREE.Color(0xffff00);

        switch (t.type) {
            case 'cone': // Standard
                {
                    const geo = new THREE.ConeGeometry(0.3, 0.5, 6);
                    geo.translate(0, 0.25, 0);
                    const mat = new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.5 });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = Math.PI;
                    this.headGroup.add(mesh);
                }
                break;

            case 'daisy':
                {
                    // Center
                    const centerGeo = new THREE.SphereGeometry(0.15, 8, 8);
                    const centerMat = new THREE.MeshStandardMaterial({ color: centerColor });
                    this.headGroup.add(new THREE.Mesh(centerGeo, centerMat));

                    // Petals
                    const petalGeo = new THREE.SphereGeometry(0.1, 8, 8);
                    petalGeo.scale(2.5, 0.5, 1);
                    const petalMat = new THREE.MeshStandardMaterial({ color: mainColor });
                    for (let i = 0; i < 8; i++) {
                        const petal = new THREE.Mesh(petalGeo, petalMat);
                        petal.rotation.z = (i / 8) * Math.PI * 2;
                        petal.position.set(Math.cos(petal.rotation.z) * 0.2, Math.sin(petal.rotation.z) * 0.2, 0);
                        this.headGroup.add(petal);
                    }
                    this.headGroup.rotation.x = -Math.PI / 2; // Face up
                }
                break;

            case 'tulip':
                {
                    // Cup shape
                    const geo = new THREE.CylinderGeometry(0.2, 0.1, 0.4, 8, 1, true);
                    geo.translate(0, 0.2, 0);
                    const mat = new THREE.MeshStandardMaterial({ color: mainColor, side: THREE.DoubleSide });
                    const mesh = new THREE.Mesh(geo, mat);
                    this.headGroup.add(mesh);
                }
                break;

            case 'sunflower':
                {
                    this.height *= 1.2; // Taller
                    this.stem.scale.set(1.5, 1.2, 1.5); // Thicker stem

                    // Large Center
                    const centerGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12);
                    centerGeo.rotateX(Math.PI / 2);
                    const centerMat = new THREE.MeshStandardMaterial({ color: centerColor });
                    this.headGroup.add(new THREE.Mesh(centerGeo, centerMat));

                    // Petals
                    const petalGeo = new THREE.BoxGeometry(0.15, 0.4, 0.02);
                    petalGeo.translate(0, 0.2, 0);
                    const petalMat = new THREE.MeshStandardMaterial({ color: mainColor });
                    for (let i = 0; i < 12; i++) {
                        const petal = new THREE.Mesh(petalGeo, petalMat);
                        petal.rotation.z = (i / 12) * Math.PI * 2;
                        petal.translateY(0.25);
                        this.headGroup.add(petal);
                    }
                    // slightly tilt head
                    this.headGroup.rotation.x = Math.PI * 0.2;
                }
                break;

            case 'lavender':
                {
                    // Stack of spheres
                    const mat = new THREE.MeshStandardMaterial({ color: mainColor });
                    const geo = new THREE.SphereGeometry(0.06, 6, 6);
                    for (let i = 0; i < 10; i++) {
                        const bud = new THREE.Mesh(geo, mat);
                        bud.position.y = -0.4 + i * 0.08;
                        // Randomize slightly x/z
                        bud.position.x = (Math.random() - 0.5) * 0.05;
                        bud.position.z = (Math.random() - 0.5) * 0.05;
                        this.headGroup.add(bud);
                    }
                }
                break;

            case 'rose':
                {
                    // Layers of rotated cubes/shapes
                    const mat = new THREE.MeshStandardMaterial({ color: mainColor });
                    for (let i = 0; i < 3; i++) {
                        const geo = new THREE.DodecahedronGeometry(0.15 - i * 0.04, 0);
                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.rotation.y = i;
                        mesh.rotation.z = i;
                        this.headGroup.add(mesh);
                    }
                }
                break;

            case 'bluebell':
                {
                    // Hanging bells
                    const mat = new THREE.MeshStandardMaterial({ color: mainColor });
                    const bellGeo = new THREE.ConeGeometry(0.1, 0.2, 5, 1, true);

                    // Curved top stem part
                    for (let i = 0; i < 3; i++) {
                        const bell = new THREE.Mesh(bellGeo, mat);
                        bell.position.set(0.1 + i * 0.05, -0.1 - i * 0.1, 0);
                        bell.rotation.z = -Math.PI / 3;
                        this.headGroup.add(bell);
                    }
                }
                break;

            case 'dandelion':
                {
                    // Puff sphere
                    const geo = new THREE.SphereGeometry(0.25, 16, 16);
                    const mat = new THREE.MeshStandardMaterial({
                        color: mainColor,
                        transparent: true,
                        opacity: 0.6,
                        roughness: 1
                    });
                    this.headGroup.add(new THREE.Mesh(geo, mat));
                }
                break;

            case 'poppy':
                {
                    // 4 large petals
                    const centerGeo = new THREE.SphereGeometry(0.08, 8, 8);
                    const centerMat = new THREE.MeshStandardMaterial({ color: centerColor });
                    this.headGroup.add(new THREE.Mesh(centerGeo, centerMat));

                    const petalGeo = new THREE.CircleGeometry(0.2, 8);
                    const petalMat = new THREE.MeshStandardMaterial({ color: mainColor, side: THREE.DoubleSide });

                    for (let i = 0; i < 4; i++) {
                        const petal = new THREE.Mesh(petalGeo, petalMat);
                        // Rotate to form a cup/bowl
                        const angle = (i / 4) * Math.PI * 2;
                        petal.rotation.y = angle;
                        petal.rotation.x = -Math.PI / 4;
                        petal.position.set(Math.sin(angle) * 0.1, 0.1, Math.cos(angle) * 0.1);
                        this.headGroup.add(petal);
                    }
                }
                break;

            case 'lily':
                {
                    // 3 cones pointing out
                    const petalGeo = new THREE.ConeGeometry(0.08, 0.4, 4);
                    petalGeo.translate(0, 0.2, 0);
                    const mat = new THREE.MeshStandardMaterial({ color: mainColor });

                    for (let i = 0; i < 6; i++) {
                        const petal = new THREE.Mesh(petalGeo, mat);
                        petal.rotation.z = Math.PI / 3;
                        petal.rotation.y = (i / 6) * Math.PI * 2;
                        this.headGroup.add(petal);
                    }
                }
                break;
        }
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
            this.prepareReset();
        }
    }

    updateColors() {
        // Only update stem for now, as specific flowers have specific colors
        this.stem.material.color.set(CONFIG.stemColor);
        // We could override flower color but it implies destroying variety
    }

    prepareReset() {
        this.age = 0;
        this.maxAge = CONFIG.lifeSpan + (Math.random() * 2 - 1);
        this.mesh.scale.set(0, 0, 0);
        this.mesh.rotation.set(0, 0, 0);

        // Pick new random type on respawn to keep variety dynamic
        this.mesh.remove(this.headGroup);
        // Clear old head memory? (Mesh disposal handled later or ignored for simple sim)
        // Ideally we dispose geometry/materials of the old head group
        this.cleanupHead();

        this.typeData = FLOWER_TYPES[Math.floor(Math.random() * FLOWER_TYPES.length)];
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = this.height; // Reuse height or randomize?
        // Let's re-randomize height too
        this.height = 1.5 + Math.random() * 1.5;
        this.stem.geometry.dispose(); // Dispose old stem geo
        // Rebuild stem
        const stemGeo = new THREE.CylinderGeometry(0.02, 0.05, this.height, 5);
        stemGeo.translate(0, this.height / 2, 0);
        this.stem.geometry = stemGeo;
        this.headGroup.position.y = this.height;

        this.buildHead();
        this.mesh.add(this.headGroup);
    }

    cleanupHead() {
        // Recursive disposal helper
        this.headGroup.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.cleanupHead();
        if (this.stem.geometry) this.stem.geometry.dispose();
        if (this.stem.material) this.stem.material.dispose();
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
// Flower colors are now type-specific, so we remove the global override
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

// Interaction: Click to Plant
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    // Calculate pointer position in normalized device coordinates
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObject(ground);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        // Spawn a new flower
        const flower = new Flower(scene, point.x, point.z);
        // Start it slightly younger so it pops up
        flower.age = 0;
        flowers.push(flower);
    }
});

animate();
