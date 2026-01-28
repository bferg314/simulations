import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pane } from 'tweakpane';

// Config
const CONFIG = {
    count: 15,
    speed: 1.0,
    tentacleLength: 15,
    color: '#00ffff',
    bgColor: '#000510'
};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.bgColor);
scene.fog = new THREE.FogExp2(CONFIG.bgColor, 0.035);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Post Processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.1);
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotate = true; // Gentle panning around
controls.autoRotateSpeed = 0.5; // Slow and steady
controls.minDistance = 5;
controls.maxDistance = 30;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(0, 10, 5);
scene.add(dirLight);

// --- Jellyfish Class ---
class Jellyfish {
    constructor(scene, x, y, z) {
        this.scene = scene;
        this.pivot = new THREE.Object3D();
        this.pivot.position.set(x, y, z);
        this.scene.add(this.pivot);
        this.impulse = new THREE.Vector3(); // For sonar push

        // Movement properties
        this.baseY = y;
        this.phase = Math.random() * Math.PI * 2;
        this.swimSpeed = 0.5 + Math.random() * 0.5;

        // 1. BELL (Procedural Shader)
        const bellGeo = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
        // Custom shader for pulsing
        const bellMat = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(CONFIG.color) }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                uniform float time;
                
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vec3 pos = position;
                    
                    // Pulse effect
                    // Contract radius at the bottom (y=0) more than top (y=1)
                    float rim = 1.0 - pos.y; // 0 at top, 1 at bottom
                    float contraction = sin(time * 3.0) * 0.2 * rim;
                    
                    pos.x += pos.x * contraction;
                    pos.z += pos.z * contraction;
                    // Move up/down slightly
                    pos.y += sin(time * 3.0 - 0.5) * 0.1;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                uniform vec3 color;
                
                void main() {
                    // Rim Lighting
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(vViewPosition);
                    float rim = 1.0 - max(dot(viewDir, normal), 0.0);
                    rim = pow(rim, 2.0);
                    
                    // Transparency gradient
                    float alpha = 0.3 + 0.7 * rim;
                    
                    gl_FragColor = vec4(color + rim * 0.5, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false, // For transparency sorting
            blending: THREE.AdditiveBlending
        });

        this.bell = new THREE.Mesh(bellGeo, bellMat);
        this.pivot.add(this.bell);

        // 2. TENTACLES
        this.tentacles = [];
        const tentacleCount = 8;

        for (let i = 0; i < tentacleCount; i++) {
            const angle = (i / tentacleCount) * Math.PI * 2;
            const radius = 0.6;
            const tx = Math.cos(angle) * radius;
            const tz = Math.sin(angle) * radius;

            // Points for the line
            const points = [];
            for (let j = 0; j < CONFIG.tentacleLength; j++) {
                points.push(new THREE.Vector3(tx, -j * 0.3, tz));
            }

            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeo = new THREE.TubeGeometry(curve, 10, 0.02, 4, false);
            const tubeMat = new THREE.MeshBasicMaterial({
                color: CONFIG.color,
                transparent: true,
                opacity: 0.4,
                blending: THREE.AdditiveBlending
            });

            const tentacleMesh = new THREE.Mesh(tubeGeo, tubeMat);
            this.pivot.add(tentacleMesh);

            // Store physics nodes
            const nodes = points.map(p => ({
                pos: p.clone(),     // Current pos (global space logic)
                restPos: p.clone()  // Local offset from bell
            }));

            this.tentacles.push({ mesh: tentacleMesh, nodes: nodes, geo: tubeGeo });
        }
    }

    update(time, dt) {
        // Swim Movement
        this.phase += dt * this.swimSpeed;

        // IMPULSE PHYSICS
        this.impulse.multiplyScalar(0.9); // Drag
        this.pivot.position.add(this.impulse);

        // Bobbing & Moving forward
        // For this demo, they just bob in place with slight drift
        const pulse = Math.sin(time * 3.0 + this.phase);

        // Move entire jellyfish
        this.pivot.position.y = this.baseY + Math.sin(time * 0.5 + this.phase) * 1.5;
        this.pivot.rotation.y = Math.sin(time * 0.2 + this.phase) * 0.2;

        // Update Bell Shader
        this.bell.material.uniforms.time.value = time + this.phase;

        // Update Tentacles (Physics)
        // Tentacle nodes follow the bell with lag/drag

        const worldPos = this.pivot.position;
        const worldRot = this.pivot.rotation.y;

        this.tentacles.forEach((t, tIndex) => {
            // Reconstruct path
            const curvePoints = [];

            t.nodes.forEach((node, i) => {
                if (i === 0) {
                    // Head node is attached to bell
                    // Rotate offset restPos by worldRot
                    const x = node.restPos.x * Math.cos(worldRot) - node.restPos.z * Math.sin(worldRot);
                    const z = node.restPos.x * Math.sin(worldRot) + node.restPos.z * Math.cos(worldRot);

                    node.pos.set(
                        worldPos.x + x,
                        worldPos.y + node.restPos.y + pulse * 0.2, // Pulse connection point
                        worldPos.z + z
                    );
                } else {
                    // Follow previous node
                    const parent = t.nodes[i - 1].pos;
                    const target = node.pos.clone();

                    // Simple spring/drag
                    const dist = 0.3; // Segment length
                    const vec = new THREE.Vector3().subVectors(parent, node.pos);
                    const len = vec.length();

                    // Drag towards parent
                    if (len > dist) {
                        const correction = vec.normalize().multiplyScalar(len - dist);
                        node.pos.add(correction.multiplyScalar(0.1)); // Stiffness
                    }

                    // Gravity / Buoyancy (drift down)
                    node.pos.y -= 0.005;

                    // Fluid drag (lag behind movement)
                    node.pos.x += (parent.x - node.pos.x) * 0.05;
                    node.pos.z += (parent.z - node.pos.z) * 0.05;
                }

                // Convert world back to local for TubeGeometry? 
                // Creating new geometry is expensive. 
                // Actually TubeGeometry is hard to update dynamically without rebuilding.
                // Let's use Line for performance OR update Tube if we accept the cost.
                // For 'Premium' feel, let's try updating the curve and getting points.

                // Better approach for smooth tentacles in ThreeJS:
                // Use the calculated points to update geometry vertices? 
                // TubeGeometry curve update is tricky.
                // Let's just push world points to curvePoints to visualize

                // To keep it simple and performant: 
                // Convert back to local space relative to pivot to update mesh geometry?
                // Or just detach meshes from pivot and keep them in world space.
            });

            // To render: We need to convert the calculated WORLD positions of nodes 
            // back into the LOCAL space of the tentacle mesh (which is a child of pivot).
            const inverseMatrix = new THREE.Matrix4().copy(this.pivot.matrixWorld).invert();

            const localPoints = t.nodes.map(n => n.pos.clone().applyMatrix4(inverseMatrix));

            // Update Curve
            t.geo.dispose(); // Cleanup old
            const newCurve = new THREE.CatmullRomCurve3(localPoints);
            t.geo = new THREE.TubeGeometry(newCurve, 10, 0.02, 4, false);
            t.mesh.geometry = t.geo;
        });
    }
}

// Spawn Jellyfish
const jellies = [];
for (let i = 0; i < CONFIG.count; i++) {
    const x = (Math.random() - 0.5) * 20;
    const y = (Math.random() - 0.5) * 10;
    const z = (Math.random() - 0.5) * 10;
    jellies.push(new Jellyfish(scene, x, y, z));
}

// Interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Assume depth of 15
    const clickPoint = new THREE.Vector3();
    raycaster.ray.at(15, clickPoint);

    // Apply force to all jellies
    jellies.forEach(j => {
        const dir = new THREE.Vector3().subVectors(j.pivot.position, clickPoint);
        const dist = dir.length();
        if (dist < 10) { // Radius of effect
            dir.normalize();
            const force = (10 - dist) * 0.05; // Stronger when closer
            j.impulse.add(dir.multiplyScalar(force));
        }
    });
});

// Marine Snow (Particles)
const snowGeo = new THREE.BufferGeometry();
const snowCount = 2000;
const snowPos = new Float32Array(snowCount * 3);
for (let i = 0; i < snowCount * 3; i++) {
    snowPos[i] = (Math.random() - 0.5) * 40;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.05,
    transparent: true,
    opacity: 0.6
});
const snow = new THREE.Points(snowGeo, snowMat);
scene.add(snow);

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const dt = clock.getDelta();

    jellies.forEach(j => j.update(time, dt));

    // Animate Snow
    const positions = snow.geometry.attributes.position.array;
    for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= 0.01; // Fall down
        if (positions[i] < -20) positions[i] = 20; // Reset
    }
    snow.geometry.attributes.position.needsUpdate = true;

    controls.update();
    composer.render();
}

animate();

// Resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Tweakpane
const pane = new Pane();
pane.addBinding(CONFIG, 'count', { min: 1, max: 30, step: 1 }); // Requires restart logic, skip for now
pane.addBinding(CONFIG, 'color').on('change', (v) => {
    jellies.forEach(j => {
        j.bell.material.uniforms.color.value.set(v.value);
    });
});

