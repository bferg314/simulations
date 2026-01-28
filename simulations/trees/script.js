import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pane } from 'tweakpane';

// Config
const CONFIG = {
    dayDuration: 20.0, // Seconds for a full cycle
    windSpeed: 1.0,
    treeCount: 30,
    paused: false,
    timeOfDay: 0, // 0-1 (0 = Noon, 0.5 = Midnight)
    autoCycle: true
};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue start
scene.fog = new THREE.Fog(0x87CEEB, 10, 50);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

// Environment (Sky, Sun, Moon)
const sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
sunLight.position.set(0, 50, 0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 100;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

// Hemisphere Light for natural gradient
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

// Ground
const groundGeo = new THREE.PlaneGeometry(100, 100, 32, 32);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x3a5a40,
    roughness: 1,
    flatShading: true
});
// Perturb vertices
const pos = groundGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    // Add bumps
    pos.setZ(i, z + Math.random() * 1.5);
}
groundGeo.computeVertexNormals();

const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Trees (InstancedMesh with custom material for wind)
// We use a custom shader to bend the trees based on height (y) and time
const treeVertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    uniform float time;
    uniform float windStrength;
    
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        
        vec3 transformed = position;
        
        // Simple bend based on Y height
        float heightFactor = max(0.0, transformed.y);
        float bend = sin(time * 2.0 + transformed.x * 0.5 + transformed.z * 0.5) * windStrength * 0.1 * heightFactor;
        
        transformed.x += bend;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
`;

const treeFragmentShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    uniform vec3 color;
    
    void main() {
        // Simple directional lighting simulation (since ShaderMaterial doesn't support lights automatically unless we use OnBeforeCompile or MeshStandardNodeMaterial, but let's keep it simple flat color with normals)
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float diff = max(dot(vNormal, lightDir), 0.0);
        
        vec3 finalColor = color * (0.3 + 0.7 * diff);
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// However, for correct lighting and shadows easily, let's use MeshStandardMaterial and modify it via onBeforeCompile
const treeMat = new THREE.MeshStandardMaterial({
    color: 0x2d4c1e,
    roughness: 0.9,
});

treeMat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.uniforms.windStrength = { value: CONFIG.windSpeed };

    // Add uniform declarations
    shader.vertexShader = `
        uniform float time;
        uniform float windStrength;
    ` + shader.vertexShader;

    // Inject bending logic before project_vertex
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // transformed is the position variable in this chunk
        float heightFactor = max(0.0, transformed.y);
        // Wind wave
        float wave = sin(time * 2.0 + instanceMatrix[3][0] + instanceMatrix[3][2]); 
        
        transformed.x += wave * windStrength * 0.2 * heightFactor * heightFactor; // Quadratric bend
        `
    );

    treeMat.userData.shader = shader;
};

// Tree Geometry (Group merged)
const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 1.5, 6);
trunkGeo.translate(0, 0.75, 0);
const leavesGeo = new THREE.ConeGeometry(1.2, 3, 6);
leavesGeo.translate(0, 3, 0);

// Merge for Instancing (Simplification: Just use cones for trees to save complexity of merging geometries manually without BufferGeometryUtils loaded)
// Let's just use Cone trees.
const simpleTreeGeo = new THREE.ConeGeometry(1, 4, 7);
simpleTreeGeo.translate(0, 2, 0); // Pivot at bottom

const treeMesh = new THREE.InstancedMesh(simpleTreeGeo, treeMat, CONFIG.treeCount);
treeMesh.castShadow = true;
treeMesh.receiveShadow = true;

const dummy = new THREE.Object3D();
for (let i = 0; i < CONFIG.treeCount; i++) {
    dummy.position.set(
        (Math.random() - 0.5) * 60,
        0,
        (Math.random() - 0.5) * 60
    );
    const scale = 0.8 + Math.random() * 0.6;
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    treeMesh.setMatrixAt(i, dummy.matrix);
}
scene.add(treeMesh);


// Tweakpane
const pane = new Pane({ title: 'Environment' });
pane.addBinding(CONFIG, 'dayDuration', { min: 5, max: 60 });
pane.addBinding(CONFIG, 'windSpeed', { min: 0.0, max: 5.0 });
pane.addBinding(CONFIG, 'autoCycle');
pane.addBinding(CONFIG, 'timeOfDay', { min: 0, max: 1, label: 'Time (Manual)' });


// Day/Night Logic
function updateDayNightCycle(dt, time) {
    if (CONFIG.autoCycle) {
        CONFIG.timeOfDay = (time % CONFIG.dayDuration) / CONFIG.dayDuration;
        pane.refresh(); // Keep UI updated
    }

    const t = CONFIG.timeOfDay;

    // Sun Position (Simple arc)
    // 0 = Noon, 0.5 = Midnight (Let's shift: 0 = Sunrise, 0.25 = Noon, 0.5 = Sunset, 0.75 = Midnight)
    // Actually, let's map: 0->0.5 is Day, 0.5->1 is Night
    const angle = (t - 0.25) * Math.PI * 2; // -PI/2 at t=0 (Sunrise-ish)

    const radius = 50;
    sunLight.position.x = Math.cos(angle) * radius;
    sunLight.position.y = Math.sin(angle) * radius;
    sunLight.position.z = 0;

    // Colors
    const dayColor = new THREE.Color(0x87CEEB);
    const nightColor = new THREE.Color(0x0a0a20);
    const sunsetColor = new THREE.Color(0xff9900);

    let skyColor = new THREE.Color();
    let sunIntensity = 0;

    if (t < 0.1) { // Sunrise
        skyColor.lerpColors(nightColor, sunsetColor, t * 10);
        sunIntensity = t * 10;
    } else if (t < 0.2) { // Daybreak
        skyColor.lerpColors(sunsetColor, dayColor, (t - 0.1) * 10);
        sunIntensity = 1;
    } else if (t < 0.4) { // Day
        skyColor.copy(dayColor);
        sunIntensity = 1;
    } else if (t < 0.5) { // Sunset
        skyColor.lerpColors(dayColor, sunsetColor, (t - 0.4) * 10);
        sunIntensity = 1 - (t - 0.4) * 10;
    } else { // Night
        skyColor.copy(nightColor);
        sunIntensity = 0;
    }

    scene.background = skyColor;
    scene.fog.color = skyColor;
    sunLight.intensity = sunIntensity * 1.5;
    ambientLight.intensity = 0.1 + sunIntensity * 0.4;
}


// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const time = clock.getElapsedTime();

    controls.update();
    updateDayNightCycle(dt, time);

    // Update Shader Uniforms
    if (treeMat.userData.shader) {
        treeMat.userData.shader.uniforms.time.value = time;
        treeMat.userData.shader.uniforms.windStrength.value = CONFIG.windSpeed;
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
