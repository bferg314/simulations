import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pane } from 'tweakpane';

// Configuration
const CONFIG = {
    boidCount: 150,
    perceptionRadius: 2.5,
    maxSpeed: 0.2,
    maxForce: 0.015,
    alignmentWeight: 1.0,
    cohesionWeight: 1.0,
    separationWeight: 1.5,
    boundaryRadius: 15,
    bubbleCount: 50,
};

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1628);
scene.fog = new THREE.FogExp2(0x0a1628, 0.015);

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
controls.autoRotateSpeed = 0.3;

// Lighting
const ambientLight = new THREE.AmbientLight(0x4488aa, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

const spotLight = new THREE.SpotLight(0x00aaff, 3.0);
spotLight.position.set(0, 20, 0);
spotLight.angle = Math.PI / 4;
spotLight.penumbra = 0.5;
scene.add(spotLight);

// Add some colored point lights for atmosphere
const pointLight1 = new THREE.PointLight(0x00ffaa, 1, 20);
pointLight1.position.set(-10, 5, 0);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xff6600, 0.5, 15);
pointLight2.position.set(10, -5, 5);
scene.add(pointLight2);

// --- SCARE SYSTEM ---
let scarePoint = null;
let scareTimer = 0;
const SCARE_DURATION = 2.0; // seconds
const SCARE_RADIUS = 12;
const SCARE_STRENGTH = 0.08;

// --- REALISTIC FISH WITH ANIMATED FINS ---
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

        // Animation phase offsets for variety
        this.wiggleOffset = Math.random() * Math.PI * 2;
        this.wiggleSpeed = 8 + Math.random() * 4;
        this.finOffset = Math.random() * Math.PI * 2;

        // Create fish group
        this.group = new THREE.Group();

        // Random size variation (0.7 to 1.3 scale)
        this.sizeScale = 0.7 + Math.random() * 0.6;

        // Random color variation - tropical fish colors with secondary accent
        const colorChoices = [
            { h: 0.55, s: 1.0, l: 0.5, accent: 0.15 },  // Cyan with yellow accent
            { h: 0.6, s: 0.9, l: 0.4, accent: 0.08 },   // Blue with orange accent
            { h: 0.08, s: 1.0, l: 0.55, accent: 0.0 },  // Orange with red accent
            { h: 0.0, s: 0.9, l: 0.5, accent: 0.15 },   // Red with yellow accent
            { h: 0.15, s: 1.0, l: 0.5, accent: 0.6 },   // Yellow with blue accent
            { h: 0.85, s: 0.8, l: 0.6, accent: 0.55 },  // Pink with cyan accent
            { h: 0.45, s: 0.8, l: 0.4, accent: 0.08 },  // Teal with orange accent
            { h: 0.75, s: 0.9, l: 0.5, accent: 0.15 },  // Purple with yellow accent
        ];
        const colorChoice = colorChoices[Math.floor(Math.random() * colorChoices.length)];
        const fishColor = new THREE.Color().setHSL(colorChoice.h, colorChoice.s, colorChoice.l);
        const accentColor = new THREE.Color().setHSL(colorChoice.accent, 0.9, 0.55);
        const bellyColor = new THREE.Color().setHSL(colorChoice.h, colorChoice.s * 0.3, colorChoice.l + 0.3);

        // ===== FISH BODY =====
        // Create a more fish-like body shape using a custom geometry
        const bodyShape = this.createFishBodyGeometry();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: fishColor,
            roughness: 0.25,
            metalness: 0.5,
            emissive: fishColor,
            emissiveIntensity: 0.08
        });
        this.body = new THREE.Mesh(bodyShape, bodyMat);
        this.body.scale.setScalar(this.sizeScale);
        this.group.add(this.body);

        // ===== TAIL FIN (Caudal Fin) - Forked shape =====
        // Tail pivot is at the rear of the body - tail swings from here
        this.tailPivot = new THREE.Group();
        // Position at the back end (Tail is now at -Z)
        this.tailPivot.position.set(0, 0, -0.25 * this.sizeScale);

        const tailShape = this.createTailFinGeometry();
        const tailMat = new THREE.MeshStandardMaterial({
            color: accentColor,
            roughness: 0.3,
            metalness: 0.4,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        this.tail = new THREE.Mesh(tailShape, tailMat);
        this.tail.scale.setScalar(this.sizeScale);
        this.tailPivot.add(this.tail);
        this.group.add(this.tailPivot);

        // ===== DORSAL FIN (Top fin) =====
        this.dorsalPivot = new THREE.Group();
        this.dorsalPivot.position.set(0, 0.18 * this.sizeScale, 0);

        const dorsalShape = this.createDorsalFinGeometry();
        const dorsalMat = new THREE.MeshStandardMaterial({
            color: fishColor.clone().lerp(accentColor, 0.3),
            roughness: 0.35,
            metalness: 0.3,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
        });
        this.dorsal = new THREE.Mesh(dorsalShape, dorsalMat);
        this.dorsal.scale.setScalar(this.sizeScale);
        this.dorsalPivot.add(this.dorsal);
        this.group.add(this.dorsalPivot);

        // ===== ANAL FIN (Bottom fin) =====
        this.analPivot = new THREE.Group();
        this.analPivot.position.set(0, -0.12 * this.sizeScale, 0.15 * this.sizeScale);

        const analShape = this.createAnalFinGeometry();
        const analMat = new THREE.MeshStandardMaterial({
            color: fishColor.clone().lerp(accentColor, 0.2),
            roughness: 0.35,
            metalness: 0.3,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
        });
        this.anal = new THREE.Mesh(analShape, analMat);
        this.anal.scale.setScalar(this.sizeScale);
        this.analPivot.add(this.anal);
        this.group.add(this.analPivot);

        // ===== PECTORAL FINS (Side fins) =====
        const pectoralShape = this.createPectoralFinGeometry();
        const pectoralMat = new THREE.MeshStandardMaterial({
            color: bellyColor,
            roughness: 0.3,
            metalness: 0.3,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });

        // Left pectoral fin
        this.leftPectoralPivot = new THREE.Group();
        this.leftPectoralPivot.position.set(-0.12 * this.sizeScale, -0.02 * this.sizeScale, -0.15 * this.sizeScale);
        this.leftPectoral = new THREE.Mesh(pectoralShape, pectoralMat);
        this.leftPectoral.scale.setScalar(this.sizeScale);
        this.leftPectoral.rotation.z = -Math.PI / 6;
        this.leftPectoral.rotation.y = -Math.PI / 3;
        this.leftPectoralPivot.add(this.leftPectoral);
        this.group.add(this.leftPectoralPivot);

        // Right pectoral fin
        this.rightPectoralPivot = new THREE.Group();
        this.rightPectoralPivot.position.set(0.12 * this.sizeScale, -0.02 * this.sizeScale, -0.15 * this.sizeScale);
        this.rightPectoral = new THREE.Mesh(pectoralShape.clone(), pectoralMat);
        this.rightPectoral.scale.setScalar(this.sizeScale);
        this.rightPectoral.rotation.z = Math.PI / 6;
        this.rightPectoral.rotation.y = Math.PI / 3;
        this.rightPectoralPivot.add(this.rightPectoral);
        this.group.add(this.rightPectoralPivot);

        // ===== VENTRAL FINS (Small bottom fins near belly) =====
        const ventralShape = this.createVentralFinGeometry();
        const ventralMat = new THREE.MeshStandardMaterial({
            color: bellyColor,
            roughness: 0.35,
            metalness: 0.25,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75
        });

        // Left ventral
        this.leftVentral = new THREE.Mesh(ventralShape, ventralMat);
        this.leftVentral.position.set(-0.06 * this.sizeScale, -0.12 * this.sizeScale, -0.05 * this.sizeScale);
        this.leftVentral.rotation.z = -Math.PI / 4;
        this.leftVentral.scale.setScalar(this.sizeScale * 0.6);
        this.group.add(this.leftVentral);

        // Right ventral
        this.rightVentral = new THREE.Mesh(ventralShape.clone(), ventralMat);
        this.rightVentral.position.set(0.06 * this.sizeScale, -0.12 * this.sizeScale, -0.05 * this.sizeScale);
        this.rightVentral.rotation.z = Math.PI / 4;
        this.rightVentral.scale.setScalar(this.sizeScale * 0.6);
        this.group.add(this.rightVentral);

        // ===== EYES =====
        // Fish eyes should be on the SIDES of the head, flush with body
        // Using hemisphere geometry for more realistic embedded look

        // Eye socket (slight dark indent)
        const eyeSocketGeo = new THREE.CircleGeometry(0.038, 16);
        const eyeSocketMat = new THREE.MeshBasicMaterial({
            color: 0x1a1a2a,
            side: THREE.DoubleSide
        });

        // Eye white (slightly smaller, sits on socket)
        const eyeWhiteGeo = new THREE.CircleGeometry(0.032, 16);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({
            color: 0xf8f8f0,
            side: THREE.DoubleSide
        });

        // Iris - colored ring
        const irisGeo = new THREE.RingGeometry(0.012, 0.024, 16);
        const irisMat = new THREE.MeshBasicMaterial({
            color: 0x2a5a8a, // Nice blue-gray iris color
            side: THREE.DoubleSide
        });

        // Pupil (small black center)
        const pupilGeo = new THREE.CircleGeometry(0.01, 12);
        const pupilMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.DoubleSide
        });

        // Specular highlight (tiny white dot)
        const highlightGeo = new THREE.CircleGeometry(0.004, 8);
        const highlightMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });

        // Left eye - positioned on LEFT side of head, facing outward
        const leftEyeGroup = new THREE.Group();
        // Position: Head is now at +Z (Front), so Eyes are at +Z
        leftEyeGroup.position.set(-0.13 * this.sizeScale, 0.02 * this.sizeScale, 0.18 * this.sizeScale);
        // Rotate to face outward (left side of fish)
        leftEyeGroup.rotation.y = -Math.PI / 2.5;

        const leftSocket = new THREE.Mesh(eyeSocketGeo, eyeSocketMat);
        leftEyeGroup.add(leftSocket);

        const leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        leftEyeWhite.position.z = 0.001;
        leftEyeGroup.add(leftEyeWhite);

        const leftIris = new THREE.Mesh(irisGeo, irisMat);
        leftIris.position.z = 0.002;
        leftEyeGroup.add(leftIris);

        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.z = 0.003;
        leftEyeGroup.add(leftPupil);

        const leftHighlight = new THREE.Mesh(highlightGeo, highlightMat);
        leftHighlight.position.set(0.008, 0.008, 0.004);
        leftEyeGroup.add(leftHighlight);

        leftEyeGroup.scale.setScalar(this.sizeScale);
        this.group.add(leftEyeGroup);

        // Right eye - positioned on RIGHT side of head, facing outward
        const rightEyeGroup = new THREE.Group();
        rightEyeGroup.position.set(0.13 * this.sizeScale, 0.02 * this.sizeScale, 0.18 * this.sizeScale);
        // Rotate to face outward (right side of fish)
        rightEyeGroup.rotation.y = Math.PI / 2.5;

        const rightSocket = new THREE.Mesh(eyeSocketGeo.clone(), eyeSocketMat);
        rightEyeGroup.add(rightSocket);

        const rightEyeWhite = new THREE.Mesh(eyeWhiteGeo.clone(), eyeWhiteMat);
        rightEyeWhite.position.z = 0.001;
        rightEyeGroup.add(rightEyeWhite);

        const rightIris = new THREE.Mesh(irisGeo.clone(), irisMat);
        rightIris.position.z = 0.002;
        rightEyeGroup.add(rightIris);

        const rightPupil = new THREE.Mesh(pupilGeo.clone(), pupilMat);
        rightPupil.position.z = 0.003;
        rightEyeGroup.add(rightPupil);

        const rightHighlight = new THREE.Mesh(highlightGeo.clone(), highlightMat);
        rightHighlight.position.set(-0.008, 0.008, 0.004);
        rightEyeGroup.add(rightHighlight);

        rightEyeGroup.scale.setScalar(this.sizeScale);
        this.group.add(rightEyeGroup);

        // ===== MOUTH =====
        const mouthGeo = new THREE.SphereGeometry(0.025, 8, 8, 0, Math.PI);
        const mouthMat = new THREE.MeshBasicMaterial({
            color: 0x2a1a1a,
            side: THREE.DoubleSide
        });
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.position.set(0, -0.02 * this.sizeScale, -0.42 * this.sizeScale);
        mouth.rotation.x = Math.PI / 2;
        mouth.rotation.z = Math.PI;
        mouth.scale.set(0.8 * this.sizeScale, 0.4 * this.sizeScale, 0.6 * this.sizeScale);
        this.group.add(mouth);

        this.group.castShadow = true;
        scene.add(this.group);
    }

    // Create fish body shape - Distinct TEARDROP shape (Blunt Head, Sharp Tail)
    createFishBodyGeometry() {
        const shape = new THREE.Shape();

        // Length is roughly 0.6 units
        // Head at X=0.3 (will rotate to Front/-Z)
        // Tail at X=-0.3 (will rotate to Back/+Z)

        shape.moveTo(-0.3, 0); // Tail tip

        // Top curve: Tail -> Head
        // Control points create the bulge near the head
        shape.bezierCurveTo(-0.1, 0.1, 0.2, 0.18, 0.3, 0.05); // Nose top

        // Nose/Mouth front curve (Blunt)
        shape.bezierCurveTo(0.32, 0, 0.32, -0.05, 0.3, -0.05); // Nose bottom

        // Bottom curve: Head -> Tail
        shape.bezierCurveTo(0.2, -0.18, -0.1, -0.1, -0.3, 0); // Back to tail

        const extrudeSettings = {
            steps: 8,
            depth: 0.15,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 5
        };

        const bodyGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        bodyGeo.center();
        // Rotate -90 Y: 
        // X+ (Head) -> Z+ (Front)
        // X- (Tail) -> Z- (Back)
        bodyGeo.rotateY(-Math.PI / 2);

        // Scale to flatten it slightly (fish are taller than they are wide)
        bodyGeo.scale(1.0, 1.2, 1.0);

        return bodyGeo;
    }

    // Create forked tail fin - vertical fin behind the fish
    // The fish looks at -Z (forward), so tail should extend in +Z (backward)
    // Tail should be vertical (in XY plane locally) and thin in Z
    createTailFinGeometry() {
        const shape = new THREE.Shape();

        // Forked tail shape - draw in XY plane
        // Origin (0,0) is where it connects to body
        // X extends backward (will become Z), Y is vertical
        shape.moveTo(0, 0);
        // Upper lobe
        shape.bezierCurveTo(0.1, 0.08, 0.2, 0.18, 0.3, 0.25);
        // Notch back inward
        shape.bezierCurveTo(0.22, 0.15, 0.18, 0.05, 0.15, 0);
        // Lower lobe
        shape.bezierCurveTo(0.18, -0.05, 0.22, -0.15, 0.3, -0.25);
        // Back to origin
        shape.bezierCurveTo(0.2, -0.18, 0.1, -0.08, 0, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.02,
            bevelEnabled: true,
            bevelThickness: 0.005,
            bevelSize: 0.005,
            bevelSegments: 2
        };

        const tailGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        tailGeo.center();

        // Rotate so the flat part of the tail is vertical (XY) and extends in Z
        // Shape was drawn in XY with X being "backward" - rotate so X->-Z
        tailGeo.rotateY(Math.PI / 2);

        // Offset so the connection point is at origin (tail extends backward in -Z)
        tailGeo.translate(0, 0, -0.15);

        return tailGeo;
    }

    // Create dorsal fin (sail-like shape on top)
    createDorsalFinGeometry() {
        const shape = new THREE.Shape();

        shape.moveTo(-0.2, 0);
        shape.bezierCurveTo(-0.15, 0.12, 0, 0.2, 0.1, 0.18);
        shape.bezierCurveTo(0.15, 0.12, 0.2, 0.05, 0.2, 0);
        shape.lineTo(-0.2, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.008,
            bevelEnabled: true,
            bevelThickness: 0.005,
            bevelSize: 0.005,
            bevelSegments: 2
        };

        const dorsalGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        dorsalGeo.center();
        dorsalGeo.rotateY(Math.PI / 2);

        return dorsalGeo;
    }

    // Create anal fin (smaller triangular fin on bottom)
    createAnalFinGeometry() {
        const shape = new THREE.Shape();

        shape.moveTo(-0.1, 0);
        shape.bezierCurveTo(-0.06, -0.08, 0.02, -0.1, 0.08, -0.06);
        shape.lineTo(0.1, 0);
        shape.lineTo(-0.1, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.006,
            bevelEnabled: true,
            bevelThickness: 0.003,
            bevelSize: 0.003,
            bevelSegments: 2
        };

        const analGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        analGeo.center();
        analGeo.rotateY(Math.PI / 2);

        return analGeo;
    }

    // Create pectoral fin (side fin - fan-like)
    createPectoralFinGeometry() {
        const shape = new THREE.Shape();

        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.02, 0.04, 0.08, 0.08, 0.14, 0.06);
        shape.bezierCurveTo(0.12, 0.02, 0.1, -0.02, 0.12, -0.05);
        shape.bezierCurveTo(0.06, -0.04, 0.02, -0.02, 0, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.005,
            bevelEnabled: true,
            bevelThickness: 0.003,
            bevelSize: 0.003,
            bevelSegments: 2
        };

        const pectoralGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        return pectoralGeo;
    }

    // Create ventral fin (small lower fins)
    createVentralFinGeometry() {
        const shape = new THREE.Shape();

        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.01, -0.03, 0.04, -0.06, 0.07, -0.05);
        shape.bezierCurveTo(0.05, -0.02, 0.02, 0.01, 0, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.004,
            bevelEnabled: false
        };

        const ventralGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        return ventralGeo;
    }

    update(boids, time) {
        this.flock(boids);
        this.updatePhysics();
        this.checkBoundaries();

        // Update position
        this.group.position.copy(this.position);

        // Face forward
        const target = this.position.clone().add(this.velocity);
        this.group.lookAt(target);

        // Calculate animation intensities based on speed
        const speed = this.velocity.length();
        const speedRatio = speed / CONFIG.maxSpeed;
        const swimPhase = time * this.wiggleSpeed + this.wiggleOffset;
        const finPhase = time * (this.wiggleSpeed * 0.6) + this.finOffset;

        // ===== TAIL FIN ANIMATION =====
        // Tail swings side-to-side with intensity based on speed
        const tailSwing = Math.sin(swimPhase) * 0.5 * speedRatio;
        this.tailPivot.rotation.y = tailSwing;

        // ===== BODY S-CURVE ANIMATION =====
        // Subtle body undulation
        this.body.rotation.y = tailSwing * 0.25;

        // ===== DORSAL FIN ANIMATION =====
        // Slight sway following body motion
        this.dorsalPivot.rotation.z = Math.sin(swimPhase + 0.5) * 0.12 * speedRatio;

        // ===== ANAL FIN ANIMATION =====
        // Mirror dorsal but inverted
        this.analPivot.rotation.z = Math.sin(swimPhase + 0.5) * -0.1 * speedRatio;

        // ===== PECTORAL FINS ANIMATION =====
        // Flap in opposition for swimming motion
        const pectoralFlap = Math.sin(finPhase) * 0.35 * (0.3 + speedRatio * 0.7);
        this.leftPectoralPivot.rotation.z = -Math.PI / 6 + pectoralFlap;
        this.rightPectoralPivot.rotation.z = Math.PI / 6 - pectoralFlap;

        // Also slight forward/back motion
        const pectoralSweep = Math.sin(finPhase + Math.PI / 4) * 0.15 * speedRatio;
        this.leftPectoralPivot.rotation.y = pectoralSweep;
        this.rightPectoralPivot.rotation.y = -pectoralSweep;

        // ===== VENTRAL FINS ANIMATION =====
        // Gentle trailing motion
        this.leftVentral.rotation.z = -Math.PI / 4 + Math.sin(finPhase + 1) * 0.15 * speedRatio;
        this.rightVentral.rotation.z = Math.PI / 4 - Math.sin(finPhase + 1) * 0.15 * speedRatio;
    }

    updatePhysics() {
        this.velocity.add(this.acceleration);
        this.velocity.clampLength(0, CONFIG.maxSpeed);
        this.position.add(this.velocity);
        this.acceleration.set(0, 0, 0);
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
                align.add(other.velocity);
                cohesion.add(other.position);

                let diff = new THREE.Vector3().subVectors(this.position, other.position);
                diff.divideScalar(d * d);
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
            steerCohesion.clampLength(0, CONFIG.maxForce);

            // Separation
            separation.divideScalar(total);
            separation.normalize().multiplyScalar(CONFIG.maxSpeed);
            const steerSeparation = new THREE.Vector3().subVectors(separation, this.velocity);
            steerSeparation.clampLength(0, CONFIG.maxForce * 1.5);

            // Apply Weights
            this.acceleration.add(steerAlign.multiplyScalar(CONFIG.alignmentWeight));
            this.acceleration.add(steerCohesion.multiplyScalar(CONFIG.cohesionWeight));
            this.acceleration.add(steerSeparation.multiplyScalar(CONFIG.separationWeight));
        }

        // Food Attraction
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

                if (minDist < 0.5) {
                    closestFood.alive = false;
                    closestFood.mesh.position.y = -999;
                }
            }
        }

        // Scare behavior - flee from scare point
        if (scarePoint && scareTimer > 0) {
            const distToScare = this.position.distanceTo(scarePoint);
            if (distToScare < SCARE_RADIUS) {
                const fleeDir = new THREE.Vector3().subVectors(this.position, scarePoint);
                fleeDir.normalize();
                const fleeFactor = (1 - distToScare / SCARE_RADIUS) * SCARE_STRENGTH;
                this.acceleration.add(fleeDir.multiplyScalar(fleeFactor));
            }
        }
    }

    checkBoundaries() {
        const d = this.position.length();
        if (d > CONFIG.boundaryRadius) {
            const desired = this.position.clone().multiplyScalar(-1).normalize().multiplyScalar(CONFIG.maxSpeed);
            const steer = new THREE.Vector3().subVectors(desired, this.velocity);
            steer.clampLength(0, CONFIG.maxForce * 2.0);
            this.acceleration.add(steer);
        }
    }

    dispose() {
        scene.remove(this.group);
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}

// Init Boids
const boids = [];
function initBoids() {
    boids.forEach(b => b.dispose());
    boids.length = 0;

    for (let i = 0; i < CONFIG.boidCount; i++) {
        boids.push(new Boid());
    }
}
initBoids();

// --- BUBBLE SYSTEM ---
class Bubble {
    constructor(x, z) {
        this.startX = x;
        this.startZ = z;

        // Random size
        const size = 0.05 + Math.random() * 0.15;
        const geo = new THREE.SphereGeometry(size, 8, 8);
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3 + Math.random() * 0.3,
            roughness: 0,
            metalness: 0,
            transmission: 0.9,
            thickness: 0.5,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(
            x + (Math.random() - 0.5) * 2,
            -CONFIG.boundaryRadius + Math.random() * 5,
            z + (Math.random() - 0.5) * 2
        );

        // Movement properties
        this.speed = 0.02 + Math.random() * 0.03;
        this.wobbleSpeed = 2 + Math.random() * 2;
        this.wobbleAmount = 0.02 + Math.random() * 0.02;
        this.phase = Math.random() * Math.PI * 2;

        scene.add(this.mesh);
    }

    update(time) {
        // Rise up
        this.mesh.position.y += this.speed;

        // Wobble side to side
        this.mesh.position.x = this.startX + Math.sin(time * this.wobbleSpeed + this.phase) * this.wobbleAmount * 10;
        this.mesh.position.z = this.startZ + Math.cos(time * this.wobbleSpeed * 0.7 + this.phase) * this.wobbleAmount * 10;

        // Reset when reaching top
        if (this.mesh.position.y > CONFIG.boundaryRadius - 1) {
            this.mesh.position.y = -CONFIG.boundaryRadius + Math.random() * 3;
            this.mesh.position.x = this.startX + (Math.random() - 0.5) * 2;
            this.mesh.position.z = this.startZ + (Math.random() - 0.5) * 2;
        }
    }

    dispose() {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// Bubble sources (like air stones at bottom)
const bubbles = [];
const bubbleSources = [
    { x: -8, z: -5 },
    { x: 6, z: 3 },
    { x: -3, z: 8 },
];

function initBubbles() {
    bubbles.forEach(b => b.dispose());
    bubbles.length = 0;

    for (const source of bubbleSources) {
        const count = Math.floor(CONFIG.bubbleCount / bubbleSources.length);
        for (let i = 0; i < count; i++) {
            bubbles.push(new Bubble(source.x, source.z));
        }
    }
}
initBubbles();

// --- FOOD SYSTEM ---
class FishFood {
    constructor(scene, x, z) {
        this.scene = scene;
        this.alive = true;

        // Random flutter offset
        this.flutterOffset = Math.random() * 100;
        this.flutterSpeed = 2 + Math.random() * 3;

        // Thin flake geometry (hexagon) - Increased size for visibility
        const geo = new THREE.CylinderGeometry(0.2, 0.2, 0.01, 6);

        // Random food colors (Brighter for better visibility)
        const colors = [0xFFA07A, 0xFFD700, 0xFF6347, 0x98FB98, 0xD2691E];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const mat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide,
            emissive: color,
            emissiveIntensity: 0.3
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, CONFIG.boundaryRadius, z);

        // Random initial rotation
        this.mesh.rotation.x = Math.random() * Math.PI;
        this.mesh.rotation.z = Math.random() * Math.PI;

        scene.add(this.mesh);
    }

    update() {
        // Sink slowly
        this.mesh.position.y -= 0.03;

        // Flutter effect
        const time = performance.now() / 1000;
        this.mesh.rotation.x += Math.sin(time * this.flutterSpeed + this.flutterOffset) * 0.05;
        this.mesh.rotation.z += Math.cos(time * this.flutterSpeed * 0.8 + this.flutterOffset) * 0.05;
        this.mesh.position.x += Math.sin(time * 2 + this.flutterOffset) * 0.005; // Drift X
        this.mesh.position.z += Math.cos(time * 1.5 + this.flutterOffset) * 0.005; // Drift Z

        if (this.mesh.position.y < -CONFIG.boundaryRadius) {
            this.alive = false;
            this.scene.remove(this.mesh);
        }
    }
}
const foods = [];

// --- INTERACTION ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Invisible water surface plane for raycasting
const waterSurfaceGeo = new THREE.PlaneGeometry(CONFIG.boundaryRadius * 3, CONFIG.boundaryRadius * 3);
const waterSurfaceMat = new THREE.MeshBasicMaterial({ visible: false });
const waterSurface = new THREE.Mesh(waterSurfaceGeo, waterSurfaceMat);
waterSurface.rotation.x = -Math.PI / 2;
waterSurface.position.y = CONFIG.boundaryRadius - 1;
scene.add(waterSurface);

// Function to drop food at a position
// Function to drop food at a position
function dropFoodAt(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(waterSurface);

    let targetX, targetZ;

    if (intersects.length > 0) {
        const point = intersects[0].point;
        targetX = point.x;
        targetZ = point.z;
    } else {
        // Fallback: drop at approximate position
        const target = new THREE.Vector3();
        raycaster.ray.at(20, target);
        targetX = target.x * 0.5;
        targetZ = target.z * 0.5;
    }

    // Determine amount of food based on fish count (more fish = more food)
    // At least 5 flakes, or roughly 1 flake per 8 fish
    const foodCount = Math.max(5, Math.ceil(CONFIG.boidCount / 8));
    const spread = 4.0; // Spread radius

    for (let i = 0; i < foodCount; i++) {
        // Random spread
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * spread;
        const offsetX = Math.cos(angle) * radius;
        const offsetZ = Math.sin(angle) * radius;

        // Clamp to tank bounds
        const finalX = Math.max(-CONFIG.boundaryRadius + 1, Math.min(CONFIG.boundaryRadius - 1, targetX + offsetX));
        const finalZ = Math.max(-CONFIG.boundaryRadius + 1, Math.min(CONFIG.boundaryRadius - 1, targetZ + offsetZ));

        foods.push(new FishFood(scene, finalX, finalZ));
    }
}

// Double-click = drop food (avoids conflict with OrbitControls)
window.addEventListener('dblclick', (e) => {
    dropFoodAt(e.clientX, e.clientY);
});

// 'F' key = drop food at center of screen
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f') {
        dropFoodAt(window.innerWidth / 2, window.innerHeight / 2);
    }
});

// Right click = scare fish (tap the glass!)
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const target = new THREE.Vector3();
    raycaster.ray.at(20, target);

    scarePoint = target;
    scareTimer = SCARE_DURATION;

    // Visual feedback - ripple effect at scare point
    createScareRipple(target);
});

// Scare ripple visual effect
function createScareRipple(position) {
    const rippleGeo = new THREE.RingGeometry(0.1, 0.3, 32);
    const rippleMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const ripple = new THREE.Mesh(rippleGeo, rippleMat);
    ripple.position.copy(position);
    ripple.lookAt(camera.position);
    scene.add(ripple);

    // Animate ripple
    const startTime = performance.now();
    function animateRipple() {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.5) {
            scene.remove(ripple);
            rippleGeo.dispose();
            rippleMat.dispose();
            return;
        }

        const scale = 1 + elapsed * 20;
        ripple.scale.set(scale, scale, scale);
        rippleMat.opacity = 0.6 * (1 - elapsed * 2);

        requestAnimationFrame(animateRipple);
    }
    animateRipple();
}

// TANK (Glass Box)
const tankGeo = new THREE.BoxGeometry(CONFIG.boundaryRadius * 2, CONFIG.boundaryRadius * 2, CONFIG.boundaryRadius * 2);
const tankMat = new THREE.MeshPhysicalMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.08,
    roughness: 0,
    metalness: 0,
    thickness: 1,
    transmission: 0.15,
    side: THREE.BackSide
});
const tank = new THREE.Mesh(tankGeo, tankMat);
scene.add(tank);

// Sand floor
const sandGeo = new THREE.PlaneGeometry(CONFIG.boundaryRadius * 2, CONFIG.boundaryRadius * 2);
const sandMat = new THREE.MeshStandardMaterial({
    color: 0xC2B280,
    roughness: 1,
    metalness: 0
});
const sand = new THREE.Mesh(sandGeo, sandMat);
sand.rotation.x = -Math.PI / 2;
sand.position.y = -CONFIG.boundaryRadius + 0.1;
scene.add(sand);

// Decor (Rocks)
const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true });
for (let i = 0; i < 15; i++) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const r = CONFIG.boundaryRadius;
    rock.position.set(
        (Math.random() - 0.5) * r * 1.5,
        -r + Math.random() * 2,
        (Math.random() - 0.5) * r * 1.5
    );
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.setScalar(0.3 + Math.random() * 0.7);
    scene.add(rock);
}

// Air stone decorations (where bubbles come from)
for (const source of bubbleSources) {
    const stoneGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 });
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.set(source.x, -CONFIG.boundaryRadius + 0.2, source.z);
    scene.add(stone);
}

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();

    // Update scare timer
    if (scareTimer > 0) {
        scareTimer -= 0.016; // ~60fps
    }

    // Update fish
    for (let i = 0; i < boids.length; i++) {
        boids[i].update(boids, time);
    }

    // Update Food
    for (let i = foods.length - 1; i >= 0; i--) {
        foods[i].update();
        if (!foods[i].alive) {
            scene.remove(foods[i].mesh);
            foods.splice(i, 1);
        }
    }

    // Update bubbles
    for (const bubble of bubbles) {
        bubble.update(time);
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

// Instructions
const instructions = document.createElement('div');
instructions.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 20px;
    color: rgba(255, 255, 255, 0.7);
    font-family: 'Inter', sans-serif;
    font-size: 0.85rem;
    background: rgba(0, 0, 0, 0.5);
    padding: 12px 16px;
    border-radius: 10px;
    backdrop-filter: blur(5px);
    line-height: 1.6;
`;
instructions.innerHTML = `
    <strong>🐠 Aquarium Controls</strong><br>
    Double-Click: Drop food<br>
    Press F: Drop food at center<br>
    Right Click: Tap the glass (scare fish!)
`;
document.body.appendChild(instructions);
