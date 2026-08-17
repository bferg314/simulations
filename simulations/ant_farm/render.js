import * as THREE from 'three';
import { CONFIG } from './config.js';
import { TYPE_DIRT, TYPE_WATER } from './classes/World.js';
import { CARGO_DIRT, CARGO_FOOD, CARGO_CORPSE } from './classes/Ant.js';
import { Queen } from './classes/Queen.js';
import { Worker, FORAGER, NURSE, DIGGER } from './classes/Worker.js';
import { Egg, Larva, Pupa } from './classes/Brood.js';

const PLANE_W = 40;
const PLANE_H = 24;   // matches the 400x240 world aspect

const hexToRgb = (hex) => {
    const c = new THREE.Color(hex);
    return [c.r * 255, c.g * 255, c.b * 255];
};

// Soil strata. Depth is normalised 0 (surface) → 1 (bedrock); each band tints
// the base dirt colour so the static noise reads as geology rather than as a
// flat brown field.
const STRATA = [
    { at: 0.00, tint: [1.06, 0.98, 0.86] },   // topsoil, warm and organic
    { at: 0.28, tint: [1.00, 0.92, 0.78] },
    { at: 0.55, tint: [0.86, 0.80, 0.72] },   // clay
    { at: 0.80, tint: [0.70, 0.68, 0.68] },   // cold subsoil
    { at: 1.00, tint: [0.55, 0.54, 0.58] },
];

function strataTint(t) {
    for (let i = 1; i < STRATA.length; i++) {
        if (t <= STRATA[i].at) {
            const a = STRATA[i - 1];
            const b = STRATA[i];
            const k = (t - a.at) / (b.at - a.at);
            return [
                a.tint[0] + (b.tint[0] - a.tint[0]) * k,
                a.tint[1] + (b.tint[1] - a.tint[1]) * k,
                a.tint[2] + (b.tint[2] - a.tint[2]) * k,
            ];
        }
    }
    return STRATA[STRATA.length - 1].tint;
}

export class SoilPainter {
    constructor(world) {
        this.world = world;
        this.canvas = document.createElement('canvas');
        this.canvas.width = world.width;
        this.canvas.height = world.height;
        this.ctx = this.canvas.getContext('2d');

        // Allocated once. The old build called getImageData every frame, which
        // forced a full readback before any pixel work could start.
        this.imgData = this.ctx.createImageData(world.width, world.height);

        this.buildPalette();
        this.showPheromones = false;
    }

    // Every colour that depends only on the row is precomputed, so the pixel
    // loop is a couple of array reads plus the baked noise offset.
    buildPalette() {
        const h = this.world.height;
        const dirt = hexToRgb(CONFIG.dirtColor);
        const tunnel = hexToRgb(CONFIG.tunnelColor);
        const water = hexToRgb(CONFIG.waterColor);
        const skyTop = hexToRgb(CONFIG.skyTop);
        const skyBottom = hexToRgb(CONFIG.skyBottom);

        this.dirtR = new Float32Array(h);
        this.dirtG = new Float32Array(h);
        this.dirtB = new Float32Array(h);
        this.tunR = new Float32Array(h);
        this.tunG = new Float32Array(h);
        this.tunB = new Float32Array(h);
        this.watR = new Float32Array(h);
        this.watG = new Float32Array(h);
        this.watB = new Float32Array(h);
        this.skyR = new Float32Array(h);
        this.skyG = new Float32Array(h);
        this.skyB = new Float32Array(h);

        const surface = CONFIG.groundLevel;
        for (let y = 0; y < h; y++) {
            const t = Math.max(0, Math.min(1, (y - surface) / (h - surface)));
            const tint = strataTint(t);
            const shade = 1 - t * 0.24;               // deeper is darker

            this.dirtR[y] = dirt[0] * tint[0] * shade;
            this.dirtG[y] = dirt[1] * tint[1] * shade;
            this.dirtB[y] = dirt[2] * tint[2] * shade;

            const tunShade = 1 - t * 0.20;
            this.tunR[y] = tunnel[0] * tunShade;
            this.tunG[y] = tunnel[1] * tunShade;
            this.tunB[y] = tunnel[2] * tunShade;

            this.watR[y] = water[0] * shade;
            this.watG[y] = water[1] * shade;
            this.watB[y] = water[2] * shade;

            // Vertical sky gradient. In the old build this was painted and then
            // immediately overwritten with a flat colour, so it never showed.
            const k = Math.min(1, y / Math.max(1, surface));
            this.skyR[y] = skyTop[0] + (skyBottom[0] - skyTop[0]) * k;
            this.skyG[y] = skyTop[1] + (skyBottom[1] - skyTop[1]) * k;
            this.skyB[y] = skyTop[2] + (skyBottom[2] - skyTop[2]) * k;
        }
    }

    paintTerrain() {
        const w = this.world;
        const data = this.imgData.data;
        const grid = w.grid;
        const noise = w.noise;
        const terrain = w.terrainHeight;

        for (let y = 0; y < w.height; y++) {
            const dR = this.dirtR[y], dG = this.dirtG[y], dB = this.dirtB[y];
            const tR = this.tunR[y], tG = this.tunG[y], tB = this.tunB[y];
            const aR = this.watR[y], aG = this.watG[y], aB = this.watB[y];
            const sR = this.skyR[y], sG = this.skyG[y], sB = this.skyB[y];
            let i = y * w.width;

            for (let x = 0; x < w.width; x++, i++) {
                const p = i * 4;
                const type = grid[i];

                if (type === TYPE_DIRT) {
                    const n = noise[i];
                    data[p] = dR + n;
                    data[p + 1] = dG + n;
                    data[p + 2] = dB + n;
                } else if (type === TYPE_WATER) {
                    const n = noise[i] * 0.4;
                    data[p] = aR + n;
                    data[p + 1] = aG + n;
                    data[p + 2] = aB + n;
                } else if (y < terrain[x]) {
                    // Open sky, tested against the real sinusoidal terrain
                    // rather than the flat mean height.
                    data[p] = sR;
                    data[p + 1] = sG;
                    data[p + 2] = sB;
                } else {
                    data[p] = tR;
                    data[p + 1] = tG;
                    data[p + 2] = tB;
                }
                data[p + 3] = 255;
            }
        }

        if (this.showPheromones) this.paintPheromones();
        this.ctx.putImageData(this.imgData, 0, 0);
    }

    // Debug overlay: home trail in blue, food trail in green. Makes it obvious
    // whether the field is a usable gradient or a saturated blob.
    paintPheromones() {
        const w = this.world;
        const data = this.imgData.data;
        for (let i = 0; i < w.len; i++) {
            if (w.grid[i] === TYPE_DIRT) continue;
            const home = w.readIdx(w.home, i);
            const food = w.readIdx(w.foodField, i);
            if (home < 0.01 && food < 0.01) continue;
            const p = i * 4;
            data[p] = data[p] * 0.35 + food * 210;
            data[p + 1] = data[p + 1] * 0.35 + food * 255 + home * 90;
            data[p + 2] = data[p + 2] * 0.35 + home * 255;
        }
    }

    paintEntities(colony) {
        const ctx = this.ctx;

        ctx.fillStyle = CONFIG.foodColor;
        for (const f of colony.food) {
            ctx.beginPath();
            ctx.arc(f.x, f.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = CONFIG.corpseColor;
        for (const c of colony.corpses) ctx.fillRect(c.x - 1, c.y - 1, 2, 2);

        for (const b of colony.brood) {
            if (b instanceof Egg) {
                ctx.fillStyle = CONFIG.eggColor;
                ctx.beginPath();
                ctx.arc(b.x, b.y, 1.4, 0, Math.PI * 2);
                ctx.fill();
            } else if (b instanceof Larva) {
                // Starving larvae blanch, so famine is visible in the nursery.
                ctx.fillStyle = b.starving ? '#c9b27a' : CONFIG.larvaColor;
                ctx.fillRect(b.x - 1, b.y - 1, 3, 2);
            } else if (b instanceof Pupa) {
                ctx.fillStyle = CONFIG.pupaColor;
                ctx.fillRect(b.x - 1, b.y - 2, 3, 4);
            }
        }

        for (const p of colony.predators) {
            ctx.fillStyle = p.lungeTimer > 0 ? '#c0562f' : CONFIG.antlionColor;
            ctx.fillRect(p.x - 2, p.bottomY - 2, 5, 3);
            ctx.fillRect(p.x - 3, p.bottomY - 3, 1, 2);
            ctx.fillRect(p.x + 3, p.bottomY - 3, 1, 2);
        }

        for (const ant of colony.ants) {
            if (!ant.alive) continue;
            if (ant instanceof Queen) {
                ctx.fillStyle = 'rgba(153, 50, 204, 0.28)';
                ctx.beginPath();
                ctx.arc(ant.x, ant.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = CONFIG.queenColor;
                ctx.fillRect(ant.x - 2, ant.y - 2, 4, 5);
                continue;
            }

            ctx.fillStyle = this.antColor(ant);
            ctx.fillRect(ant.x - 1, ant.y - 1, 2, 2);
        }
    }

    antColor(ant) {
        if (ant.cargo === CARGO_DIRT) return '#CD853F';
        if (ant.cargo === CARGO_FOOD) return CONFIG.foodColor;
        if (ant.cargo === CARGO_CORPSE) return CONFIG.corpseColor;
        if (!(ant instanceof Worker)) return CONFIG.antColor;
        if (ant.role === FORAGER) return CONFIG.foragerColor;
        if (ant.role === NURSE) return CONFIG.nurseColor;
        if (ant.role === DIGGER) return CONFIG.diggerColor;
        return CONFIG.antColor;
    }

    render(colony) {
        this.paintTerrain();
        this.paintEntities(colony);
    }
}

// --- The physical object -----------------------------------------------

function sheenTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);

    const grad = g.createLinearGradient(0, c.height, c.width, 0);
    grad.addColorStop(0.00, 'rgba(255,255,255,0)');
    grad.addColorStop(0.40, 'rgba(255,255,255,0)');
    grad.addColorStop(0.445, 'rgba(255,255,255,0.16)');
    grad.addColorStop(0.475, 'rgba(255,255,255,0.02)');
    grad.addColorStop(0.515, 'rgba(255,255,255,0.07)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function vignetteTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(256, 192, 60, 256, 192, 300);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.20)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    return new THREE.CanvasTexture(c);
}

// Builds the ant farm as an object on a desk: soil pane, glass, wooden bezel.
export function buildEnclosure(scene, painter) {
    const texture = new THREE.CanvasTexture(painter.canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const planeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(PLANE_W, PLANE_H),
        new THREE.MeshBasicMaterial({ map: texture })
    );
    scene.add(planeMesh);

    const vignette = new THREE.Mesh(
        new THREE.PlaneGeometry(PLANE_W, PLANE_H),
        new THREE.MeshBasicMaterial({
            map: vignetteTexture(), transparent: true, depthWrite: false,
        })
    );
    vignette.position.z = 0.4;
    scene.add(vignette);

    const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(PLANE_W, PLANE_H),
        new THREE.MeshBasicMaterial({
            map: sheenTexture(),
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    glass.position.z = 0.5;
    scene.add(glass);

    // Four-piece bezel, sitting in front so it crops the soil edges cleanly.
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.85 });
    const bar = (w, h, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), woodMat);
        m.position.set(x, y, 0.7);
        scene.add(m);
        return m;
    };
    bar(PLANE_W + 5, 2.6, 0, PLANE_H / 2 + 0.75);
    bar(PLANE_W + 5, 2.6, 0, -PLANE_H / 2 - 0.75);
    bar(2.6, PLANE_H + 5, -PLANE_W / 2 - 0.75, 0);
    bar(2.6, PLANE_H + 5, PLANE_W / 2 + 0.75, 0);

    return { planeMesh, texture };
}

export { PLANE_W, PLANE_H };
