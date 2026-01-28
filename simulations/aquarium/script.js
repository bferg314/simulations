import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pane } from 'tweakpane';

// Configuration
const CONFIG = {
    boidCount: 150,
    perceptionRadius: 2.5,
    maxSpeed: 0.2, // Reduced speed for better visibility
    maxForce: 0.015, // Reduced steering force for smoother movement
    alignmentWeight: 1.0,
    cohesionWeight: 1.0,
    separationWeight: 1.5,
    boundaryRadius: 15,
};

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101015);
scene.fog = new THREE.FogExp2(0x101015, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 5, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

const spotLight = new THREE.SpotLight(0x00aaff, 5.0);
spotLight.position.set(0, 20, 0);
spotLight.angle = Math.PI / 4;
spotLight.penumbra = 0.5;
scene.add(spotLight);


// --- BOIDS ---

// Reuse geometry and material
const fishGeo = new THREE.ConeGeometry(0.2, 0.8, 8);
fishGeo.rotateX(Math.PI / 2); // Point forward
const fishMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    roughness: 0.4,
    metalness: 0.6
});

class Boid {
    constructor() {
        this.position = new THREE.Vector3(
            (Math.random() - 0.5) * CONFIG.boundaryRadius,
            (Math.random() - 0.5) * CONFIG.boundaryRadius,
            (Math.random() - 0.5) * CONFIG.boundaryRadius
        );
        this.velocity = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize().multiplyScalar(CONFIG.maxSpeed);
        this.acceleration = new THREE.Vector3();

        // Random color variation
        const mat = fishMat.clone();
        const hue = 0.5 + Math.random() * 0.2; // Blues and Cyans
        mat.color.setHSL(hue, 1.0, 0.5);

        this.mesh = new THREE.Mesh(fishGeo, mat);
        this.mesh.castShadow = true;
        scene.add(this.mesh);
    }

    update(boids) {
        this.flock(boids);
        this.updatePhysics();
        this.checkBoundaries();

        // Update Mesh
        this.mesh.position.copy(this.position);

        // Face forward
        const target = this.position.clone().add(this.velocity);
        this.mesh.lookAt(target);
    }

    updatePhysics() {
        this.velocity.add(this.acceleration);
        this.velocity.clampLength(0, CONFIG.maxSpeed);
        this.position.add(this.velocity);
        this.acceleration.set(0, 0, 0); // Reset acceleration
    }

    flock(boids) {
        let align = new THREE.Vector3();
        let cohesion = new THREE.Vector3();
        let separation = new THREE.Vector3();
        let total = 0;

        for (let other of boids) {
            if (other === this) continue;

            const d = this.position.distanceTo(other.position);

            if (d < CONFIG.perceptionRadius) {
                // Alignment
                align.add(other.velocity);

                // Cohesion
                cohesion.add(other.position);

                // Separation
                let diff = new THREE.Vector3().subVectors(this.position, other.position);
                diff.divideScalar(d * d); // Weight by distance squared
                separation.add(diff);

                total++;
            }
        }

        if (total > 0) {
            // Alignment
            align.divideScalar(total);
            align.normalize().multiplyScalar(CONFIG.maxSpeed);
            const steerAlign = new THREE.Vector3().subVectors(align, this.velocity);
            steerAlign.clampLength(0, CONFIG.maxForce);

            // Cohesion
            cohesion.divideScalar(total);
            const vecToCenter = new THREE.Vector3().subVectors(cohesion, this.position);
            vecToCenter.normalize().multiplyScalar(CONFIG.maxSpeed);
            const steerCohesion = new THREE.Vector3().subVectors(vecToCenter, this.velocity);
            steerCohesion.clampLength(0, CONFIG.maxForce); // Weaker steering for smooth cohesion

            // Separation
            separation.divideScalar(total);
            separation.normalize().multiplyScalar(CONFIG.maxSpeed); // Escape fast
            const steerSeparation = new THREE.Vector3().subVectors(separation, this.velocity);
            steerSeparation.clampLength(0, CONFIG.maxForce * 1.5); // Stronger separation

            // Apply Weights
            this.acceleration.add(steerAlign.multiplyScalar(CONFIG.alignmentWeight));
            this.acceleration.add(steerCohesion.multiplyScalar(CONFIG.cohesionWeight));
            this.acceleration.add(steerSeparation.multiplyScalar(CONFIG.separationWeight));
        }

        // Food Attraction (Strong)
        if (foods.length > 0) {
            let closestFood = null;
            let minDist = 999;
            for (let f of foods) {
                const d = this.position.distanceTo(f.mesh.position);
                if (d < 10 && d < minDist) { minDist = d; closestFood = f; }
            }
            if (closestFood) {
                const vec = new THREE.Vector3().subVectors(closestFood.mesh.position, this.position);
                vec.normalize().multiplyScalar(CONFIG.maxSpeed);
                const steer = new THREE.Vector3().subVectors(vec, this.velocity);
                steer.clampLength(0, CONFIG.maxForce * 4.0);
                this.acceleration.add(steer);

                // Eat
                if (minDist < 0.5) {
                    closestFood.alive = false;
                    closestFood.mesh.position.y = -999; // Haxy remove
                }
            }
        }
    }

    checkBoundaries() {
        // Soft boundary (steer back)
        const d = this.position.length();
        if (d > CONFIG.boundaryRadius) {
            const desired = this.position.clone().multiplyScalar(-1).normalize().multiplyScalar(CONFIG.maxSpeed);
            const steer = new THREE.Vector3().subVectors(desired, this.velocity);
            steer.clampLength(0, CONFIG.maxForce * 2.0);
            this.acceleration.add(steer);
        }
    }
}

// Init Boids
const boids = [];
function initBoids() {
    // Clear old
    boids.forEach(b => {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
    });
    boids.length = 0;

    for (let i = 0; i < CONFIG.boidCount; i++) {
        boids.push(new Boid());
    }
}
initBoids();

// --- FOOD SYSTEM ---
class FishFood {
    constructor(scene, x, z) {
        this.scene = scene;
        this.alive = true;
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0x8B4513 })
        );
        this.mesh.position.set(x, CONFIG.boundaryRadius, z); // Start at top
        scene.add(this.mesh);
    }

    update() {
        this.mesh.position.y -= 0.05; // Sink
        if (this.mesh.position.y < -CONFIG.boundaryRadius) {
            this.alive = false;
            this.scene.remove(this.mesh);
        }
    }
}
const foods = [];

// Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener('pointerdown', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const target = new THREE.Vector3();
    raycaster.ray.at(25, target); // Drop in front of camera at Z=0 plane-ish intersection
    foods.push(new FishFood(scene, target.x, target.z));
});

// TANK (Glass Box)
const tankGeo = new THREE.BoxGeometry(CONFIG.boundaryRadius * 2, CONFIG.boundaryRadius * 2, CONFIG.boundaryRadius * 2);
const tankMat = new THREE.MeshPhysicalMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.1,
    roughness: 0,
    metalness: 0,
    thickness: 1,
    transmission: 0.2, // Tiny bit of refraction
    side: THREE.BackSide // Render inside
});
const tank = new THREE.Mesh(tankGeo, tankMat);
scene.add(tank);

// Decor (Rocks)
const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
for (let i = 0; i < 20; i++) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const r = CONFIG.boundaryRadius;
    rock.position.set(
        (Math.random() - 0.5) * r * 1.5,
        -r + Math.random() * 2, // Near bottom
        (Math.random() - 0.5) * r * 1.5
    );
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.setScalar(0.5 + Math.random());
    scene.add(rock);
}


// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    // boids.forEach(b => b.update(boids)); // N^2 complexity! Fine for 150 boids.
    // Optimization: Octree could be used for larger flocks
    for (let i = 0; i < boids.length; i++) {
        boids[i].update(boids);
    }

    // Update Food
    for (let i = foods.length - 1; i >= 0; i--) {
        foods[i].update();
        if (!foods[i].alive) {
            scene.remove(foods[i].mesh); // Ensure removed
            foods.splice(i, 1);
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();

// Resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Tweakpane
const pane = new Pane();
const f1 = pane.addFolder({ title: 'Flocking Behavior' });
f1.addBinding(CONFIG, 'alignmentWeight', { min: 0, max: 5 });
f1.addBinding(CONFIG, 'cohesionWeight', { min: 0, max: 5 });
f1.addBinding(CONFIG, 'separationWeight', { min: 0, max: 5 });
f1.addBinding(CONFIG, 'perceptionRadius', { min: 1, max: 10 });
f1.addBinding(CONFIG, 'maxSpeed', { min: 0.1, max: 1 });

pane.addBinding(CONFIG, 'boidCount', { min: 10, max: 300, step: 10 }).on('change', initBoids);
