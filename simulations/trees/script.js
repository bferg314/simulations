import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Pane } from 'tweakpane';

// Configuration
const CONFIG = {
    dayDuration: 30.0,
    windSpeed: 1.5,
    treeCount: 50,
    grassCount: 4000,
    rockCount: 60,
    butterflyCount: 15,
    shrubCount: 40,
    timeOfDay: 0, // 0..1
    autoCycle: true,
    bloomStrength: 0.4,
    bloomRadius: 0.5,
    bloomThreshold: 0.7,
};

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 2;
controls.maxDistance = 40;

// Post-Processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloomStrength,
    CONFIG.bloomRadius,
    CONFIG.bloomThreshold
);
composer.addPass(bloomPass);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.1); // Very low base
scene.add(ambientLight);

// Hemisphere Light for better fill
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffaed, 2.0);
sunLight.position.set(20, 50, 20);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
sunLight.shadow.bias = -0.0005;
const d = 30;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

const moonLight = new THREE.DirectionalLight(0x6688ff, 1.0);
moonLight.position.set(-20, -50, -20);
moonLight.castShadow = true; // Moon also casts shadows!
Object.assign(moonLight.shadow, sunLight.shadow); // Share shadow props
scene.add(moonLight);

// Stars
const starsGeo = new THREE.BufferGeometry();
const starsCount = 2000;
const starsPos = new Float32Array(starsCount * 3);
for (let i = 0; i < starsCount * 3; i++) {
    starsPos[i] = (Math.random() - 0.5) * 200;
}
starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0 });
const stars = new THREE.Points(starsGeo, starsMat);
scene.add(stars);

// Ground
const groundGeo = new THREE.PlaneGeometry(100, 100, 96, 96);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a2e1a,
    roughness: 1,
    flatShading: true
});

// Helper for height
function getGroundHeight(x, z) {
    const dist = Math.sqrt(x * x + z * z);
    let y = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 1.5;
    // Add some noise-like variation
    y += Math.sin(x * 0.5 + z * 0.3) * 0.2;
    // Edge mountains
    y += Math.pow(Math.max(0, dist - 25) * 0.15, 2);
    return y;
}

const posAttribute = groundGeo.attributes.position;
for (let i = 0; i < posAttribute.count; i++) {
    const x = posAttribute.getX(i);
    const z = posAttribute.getZ(i);
    posAttribute.setY(i, getGroundHeight(x, z));
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- FIREFLIES (Interactive) ---
class Firefly {
    constructor(scene, pos) {
        this.scene = scene;
        this.alive = true;
        this.age = 0;
        this.maxAge = 5 + Math.random() * 5;
        this.basePos = pos.clone();

        // Light
        this.light = new THREE.PointLight(0xffff00, 2, 5);
        this.light.position.copy(pos);

        // Mesh (Visible dot)
        const geo = new THREE.SphereGeometry(0.05, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);

        scene.add(this.light);
        scene.add(this.mesh);

        // Random motion offsets
        this.offsets = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    }

    update(dt, time) {
        this.age += dt;
        if (this.age > this.maxAge) {
            this.alive = false;
            this.dispose();
            return;
        }

        // Float around
        this.light.position.x = this.basePos.x + Math.sin(time + this.offsets.x) * 1.5;
        this.light.position.y = this.basePos.y + Math.sin(time * 1.3 + this.offsets.y) * 1.5;
        this.light.position.z = this.basePos.z + Math.cos(time * 0.8 + this.offsets.z) * 1.5;
        this.mesh.position.copy(this.light.position);

        // Flicker
        this.light.intensity = 1.0 + Math.sin(time * 10) * 0.5;
    }

    dispose() {
        this.scene.remove(this.light);
        this.scene.remove(this.mesh);
    }
}

const fireflies = [];

// --- MAGIC BURST SYSTEM ---
class MagicBurst {
    constructor(scene) {
        this.maxParticles = 500;
        this.particles = [];
        this.geometry = new THREE.IcosahedronGeometry(0.05, 0);
        this.material = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 2,
            transparent: true,
            opacity: 1
        });
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.maxParticles);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(this.mesh);

        this.dummy = new THREE.Object3D();
        this.light = new THREE.PointLight(0x00ffff, 0, 10);
        scene.add(this.light);

        this.ripplePos = new THREE.Vector3();
        this.rippleTime = -100;
    }

    spawn(pos) {
        this.ripplePos.copy(pos);
        this.rippleTime = clock.getElapsedTime();

        this.light.position.copy(pos);
        this.light.intensity = 10;

        for (let i = 0; i < 50; i++) {
            const p = {
                pos: pos.clone(),
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 5,
                    Math.random() * 5 + 2,
                    (Math.random() - 0.5) * 5
                ),
                scale: 1 + Math.random() * 2,
                life: 1.0,
                decay: 0.5 + Math.random() * 0.5
            };
            this.particles.push(p);
            if (this.particles.length > this.maxParticles) this.particles.shift();
        }
    }

    update(dt) {
        this.light.intensity *= 0.95;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            p.vel.y -= 9.8 * dt * 0.5; // Gravity
            p.pos.addScaledVector(p.vel, dt);
        }

        // Update InstancedMesh
        for (let i = 0; i < this.maxParticles; i++) {
            if (i < this.particles.length) {
                const p = this.particles[i];
                this.dummy.position.copy(p.pos);
                const s = p.life * p.scale;
                this.dummy.scale.set(s, s, s);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
            } else {
                this.dummy.scale.set(0, 0, 0);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(i, this.dummy.matrix);
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

const magicSystem = new MagicBurst(scene);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObject(ground);
    if (intersects.length > 0) {
        magicSystem.spawn(intersects[0].point);
    }
});

// --- BUTTERFLIES ---
class Butterfly {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        // Wings
        const wingGeo = new THREE.PlaneGeometry(0.2, 0.2);
        const wingMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.2
        });

        this.leftWing = new THREE.Mesh(wingGeo, wingMat);
        this.leftWing.position.x = -0.1;
        this.group.add(this.leftWing);

        this.rightWing = new THREE.Mesh(wingGeo, wingMat);
        this.rightWing.position.x = 0.1;
        this.group.add(this.rightWing);

        // Position
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 30;
        this.group.position.set(
            Math.cos(angle) * r,
            2 + Math.random() * 5,
            Math.sin(angle) * r
        );

        scene.add(this.group);
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 1,
            (Math.random() - 0.5) * 2
        );
        this.flapSpeed = 10 + Math.random() * 10;
        this.timeOffset = Math.random() * 100;
    }

    update(dt, time) {
        // Flap
        const flap = Math.sin(time * this.flapSpeed) * 1.2;
        this.leftWing.rotation.y = flap;
        this.rightWing.rotation.y = -flap;

        // Wander
        this.velocity.x += Math.sin(time + this.timeOffset) * 0.1;
        this.velocity.z += Math.cos(time + this.timeOffset) * 0.1;
        this.velocity.y += Math.sin(time * 0.5 + this.timeOffset) * 0.05;

        // Speed limit
        this.velocity.clampLength(0, 2);

        this.group.position.addScaledVector(this.velocity, dt);

        // Orient towards movement
        this.group.lookAt(this.group.position.clone().add(this.velocity));

        // Boundary check (keep them within reasonable area)
        const dist = this.group.position.length();
        if (dist > 45) {
            this.velocity.addScaledVector(this.group.position, -0.01);
        }
        if (this.group.position.y < 1) this.velocity.y += 0.1;
        if (this.group.position.y > 10) this.velocity.y -= 0.1;
    }
}

const butterflies = [];
for (let i = 0; i < CONFIG.butterflyCount; i++) {
    butterflies.push(new Butterfly(scene));
}


// Utility to scatter objects
function scatterObjects(geometry, material, count, scaleRange) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    for (let i = 0; i < count; i++) {
        const r = Math.random() * 45; // Radius
        const theta = Math.random() * Math.PI * 2;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const y = getGroundHeight(x, z);

        dummy.position.set(x, y, z);

        // Random Rotation
        dummy.rotation.y = Math.random() * Math.PI * 2;
        // Slight random tilt
        dummy.rotation.x = (Math.random() - 0.5) * 0.2;
        dummy.rotation.z = (Math.random() - 0.5) * 0.2;

        // Scale
        const s = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
        dummy.scale.set(s, s, s);

        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(mesh);
    return mesh;
}

// 1. Rocks
const rockGeo = new THREE.DodecahedronGeometry(1, 0); // Low poly
const rockMat = new THREE.MeshStandardMaterial({
    color: 0x555555,
    roughness: 0.9,
    flatShading: true
});
scatterObjects(rockGeo, rockMat, CONFIG.rockCount, [0.3, 0.8]);

// 1.5 Shrubs
function createShrubGeometry() {
    const geometries = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
        const size = 0.4 + Math.random() * 0.4;
        const geo = new THREE.IcosahedronGeometry(size, 0);
        geo.translate(
            (Math.random() - 0.5) * 0.5,
            size * 0.5,
            (Math.random() - 0.5) * 0.5
        );
        geometries.push(geo);
    }
    return BufferGeometryUtils.mergeGeometries(geometries);
}
const shrubGeo = createShrubGeometry();
const shrubMat = new THREE.MeshStandardMaterial({
    color: 0x3d5a2d,
    roughness: 0.9,
    flatShading: true
});
scatterObjects(shrubGeo, shrubMat, CONFIG.shrubCount, [0.8, 1.5]);

// 2. Grass
// Simple blade geometry
const bladeGeo = new THREE.BufferGeometry();
// A simple triangle standing up
const bladeVerts = new Float32Array([
    -0.1, 0, 0,
    0.1, 0, 0,
    0, 1, 0
]);
bladeGeo.setAttribute('position', new THREE.BufferAttribute(bladeVerts, 3));
bladeGeo.computeVertexNormals();

const grassMat = new THREE.MeshStandardMaterial({
    color: 0x4a6e3a,
    roughness: 1,
    side: THREE.DoubleSide
});

// We need a lot of grass, but let's keep it reasonable for performance
const grassMesh = scatterObjects(bladeGeo, grassMat, CONFIG.grassCount, [0.5, 1.2]);
// Add custom shader to grass for wind?
grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.windStrength = { value: CONFIG.windSpeed };
    shader.uniforms.ripplePos = { value: magicSystem.ripplePos };
    shader.uniforms.rippleTime = { value: magicSystem.rippleTime };
    shader.vertexShader = `
        uniform float time;
        uniform float windStrength;
        uniform vec3 ripplePos;
        uniform float rippleTime;
        ${shader.vertexShader}
    `;
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float grassBend = transformed.y * 0.5; // Top bends more
        transformed.x += sin(time * 3.0 + instanceMatrix[3][0]*2.0) * windStrength * 0.3 * grassBend;
        
        // Ripple effect
        float dist = distance(instanceMatrix[3].xyz, ripplePos);
        float rAge = time - rippleTime;
        if (rAge < 2.0) {
            float wave = sin(dist * 2.0 - rAge * 10.0);
            float mask = exp(-dist * 0.2) * (1.0 - rAge * 0.5);
            transformed.y += wave * mask * 1.5 * grassBend;
            transformed.xz += wave * mask * 0.5 * grassBend;
        }
        `
    );
    grassMat.userData.shader = shader;
};


// Trees
function createPineTreeGeometry() {
    const geometries = [];

    // Trunk
    const trunk = new THREE.CylinderGeometry(0.15, 0.3, 1.5, 7);
    trunk.translate(0, 0.75, 0);
    geometries.push(trunk);

    // Foliage Layers
    const layers = 3;
    for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1); // 0 to 1
        const s = 1.0 - t * 0.4; // Scale shrinks near top
        const y = 1.2 + i * 1.2;

        const cone = new THREE.ConeGeometry(1.2 * s, 2.0, 7);
        cone.translate(0, y, 0);
        geometries.push(cone);
    }

    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    return merged;
}

// Shader Injection for Wind
const treeMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d4c1e,
    roughness: 0.9,
});

treeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.windStrength = { value: CONFIG.windSpeed };
    shader.uniforms.ripplePos = { value: magicSystem.ripplePos };
    shader.uniforms.rippleTime = { value: magicSystem.rippleTime };

    shader.vertexShader = `
        uniform float time;
        uniform float windStrength;
        uniform vec3 ripplePos;
        uniform float rippleTime;
        ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        float heightFactor = max(0.0, transformed.y - 1.0); // Don't bend roots
        float wave = sin(time * 1.5 + instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.5);
        
        // Quadratic bend
        transformed.x += wave * windStrength * 0.05 * heightFactor * heightFactor;
        transformed.z += cos(time * 1.2) * windStrength * 0.02 * heightFactor;

        // Ripple reaction
        float dist = distance(instanceMatrix[3].xyz, ripplePos);
        float rAge = time - rippleTime;
        if (rAge < 2.0) {
            float rWave = sin(dist * 1.5 - rAge * 8.0);
            float rMask = exp(-dist * 0.1) * (1.0 - rAge * 0.5) * heightFactor * 0.5;
            transformed.x += rWave * rMask * 2.0;
            transformed.z += rWave * rMask * 2.0;
        }
        `
    );

    treeMaterial.userData.shader = shader;
};

const treeGeo = createPineTreeGeometry();
const treeMesh = new THREE.InstancedMesh(treeGeo, treeMaterial, CONFIG.treeCount);
treeMesh.castShadow = true;
treeMesh.receiveShadow = true;

const dummy = new THREE.Object3D();

for (let i = 0; i < CONFIG.treeCount; i++) {
    // Random position within radius
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 40;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    const y = getGroundHeight(x, z);

    dummy.position.set(x, y, z);

    const scale = 0.8 + Math.random() * 0.6;
    dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.2), scale);
    dummy.rotation.y = Math.random() * Math.PI * 2;

    dummy.updateMatrix();
    treeMesh.setMatrixAt(i, dummy.matrix);
}
scene.add(treeMesh);


// Tweakpane
const pane = new Pane({ title: 'Atmosphere & Config' });
const tapPhy = pane.addTab({ pages: [{ title: 'World' }, { title: 'Post-Process' }] });

tapPhy.pages[0].addBinding(CONFIG, 'dayDuration', { min: 10, max: 120 });
tapPhy.pages[0].addBinding(CONFIG, 'windSpeed', { min: 0, max: 5 });
tapPhy.pages[0].addBinding(CONFIG, 'butterflyCount', { min: 0, max: 100, step: 1 });
tapPhy.pages[0].addBinding(CONFIG, 'shrubCount', { min: 0, max: 200, step: 1 });
tapPhy.pages[0].addBinding(CONFIG, 'autoCycle');
tapPhy.pages[0].addBinding(CONFIG, 'timeOfDay', { min: 0, max: 1, label: 'Time (0-1)' });

tapPhy.pages[1].addBinding(CONFIG, 'bloomStrength', { min: 0, max: 3 }).on('change', v => bloomPass.strength = v.value);
tapPhy.pages[1].addBinding(CONFIG, 'bloomRadius', { min: 0, max: 1 }).on('change', v => bloomPass.radius = v.value);
tapPhy.pages[1].addBinding(CONFIG, 'bloomThreshold', { min: 0, max: 1 }).on('change', v => bloomPass.threshold = v.value);


// Cycle Logic
function updateEnvironment(time) {
    if (CONFIG.autoCycle) {
        CONFIG.timeOfDay = (time % CONFIG.dayDuration) / CONFIG.dayDuration;
        pane.refresh();
    }

    const angle = (CONFIG.timeOfDay * Math.PI * 2) + (Math.PI / 2);
    const radius = 60;

    // Sun Position
    sunLight.position.x = Math.cos(angle) * radius;
    sunLight.position.y = Math.sin(angle) * radius;

    // Moon Position (Opposite)
    moonLight.position.x = Math.cos(angle + Math.PI) * radius;
    moonLight.position.y = Math.sin(angle + Math.PI) * radius;

    const sunHeight = Math.sin(angle);

    // Background & Fog Color
    const cSky = new THREE.Color(0x87CEEB);
    const cSunset = new THREE.Color(0xFD5E53);
    const cNight = new THREE.Color(0x1a1a40); // Much lighter navy blue

    let targetColor = new THREE.Color();
    let sunInt = 0;
    let moonInt = 0;
    let hemiInt = 0;

    if (sunHeight > 0.2) {
        // Day
        targetColor.copy(cSky);
        sunInt = 2.0;
        moonInt = 0;
        hemiInt = 0.6;
        hemiLight.color.setHSL(0.6, 0.1, 0.6); // White-ish
        hemiLight.groundColor.setHSL(0.095, 1, 0.75);
        starsMat.opacity = 0;
    } else if (sunHeight > -0.2) {
        // Transition (Sunset/Sunrise)
        const t = (sunHeight + 0.2) / 0.4; // 0..1
        targetColor.lerpColors(cNight, cSunset, Math.sin(t * Math.PI)); // Pass through sunset
        if (t > 0.5) targetColor.lerp(cSky, (t - 0.5) * 2);

        sunInt = Math.max(0, sunHeight * 10);
        moonInt = 0;
        hemiInt = 0.3; // Dim during sunset
        starsMat.opacity = 1.0 - t;
    } else {
        // Night
        targetColor.copy(cNight);
        sunInt = 0;
        moonInt = 1.2; // Strong moonlight
        hemiInt = 0.8; // High fill to see details
        hemiLight.color.setHSL(0.6, 1, 0.7); // Bright Blue
        hemiLight.groundColor.setHSL(0.095, 1, 0.75);
        starsMat.opacity = Math.min(1, starsMat.opacity + 0.01);
    }

    scene.background.lerp(targetColor, 0.1);
    scene.fog.color.copy(scene.background);

    sunLight.intensity = THREE.MathUtils.lerp(sunLight.intensity, sunInt, 0.1);
    moonLight.intensity = THREE.MathUtils.lerp(moonLight.intensity, moonInt, 0.1);
    hemiLight.intensity = THREE.MathUtils.lerp(hemiLight.intensity, hemiInt, 0.05);
}


// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    controls.update();

    updateEnvironment(time);

    // Update system effects
    magicSystem.update(delta);

    // Update Shaders
    if (treeMaterial.userData.shader) {
        treeMaterial.userData.shader.uniforms.time.value = time;
        treeMaterial.userData.shader.uniforms.windStrength.value = CONFIG.windSpeed;
        treeMaterial.userData.shader.uniforms.rippleTime.value = magicSystem.rippleTime;
    }

    if (grassMat.userData.shader) {
        grassMat.userData.shader.uniforms.time.value = time;
        grassMat.userData.shader.uniforms.windStrength.value = CONFIG.windSpeed;
        grassMat.userData.shader.uniforms.rippleTime.value = magicSystem.rippleTime;
    }

    fireflies.forEach(f => f.update(delta, time));
    for (let i = fireflies.length - 1; i >= 0; i--) {
        if (!fireflies[i].alive) fireflies.splice(i, 1);
    }

    // Update Butterflies
    butterflies.forEach(b => b.update(delta, time));

    composer.render();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();
