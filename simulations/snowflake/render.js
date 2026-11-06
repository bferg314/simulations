// Draws a SnowModel into an ImageData.
//
// Each pixel finds the lattice triangle it sits in and interpolates s from
// the three cell centres, so the hex grid never shows and the ice edge (where
// s crosses 1) comes out anti-aliased. A second pass shades by the gradient
// of that interpolated field, a fake relief that makes ridges catch the light.

import { SQRT3_2 } from './model.js';

// Page background (#0b1830); the field at level beta matches it
export const BG = [11, 24, 48];
const HEIGHT_CAP = 2;

const LIGHT = normalize([-0.55, -0.65, 0.75]);

function normalize(v) {
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
}

export class CrystalRenderer {
    constructor(model, scale = 2) {
        this.setModel(model, scale);
    }

    setModel(model, scale = this.scale) {
        this.model = model;
        this.scale = scale;
        this.size = Math.ceil(2 * (model.radius + 1) * scale);
        this.field = new Float32Array(this.size * this.size);
        this.image = new ImageData(this.size, this.size);
    }

    // Interpolated s at every pixel; -1 marks pixels outside the disc
    sample() {
        const { model: m, size, scale, field } = this;
        const { s, width: w, cx, cy } = m;
        const half = size / 2;
        const rMax2 = (m.radius - 1) * (m.radius - 1);
        for (let py = 0; py < size; py++) {
            const Y = (py + 0.5 - half) / scale;
            const r = Y / SQRT3_2;
            const r0 = Math.floor(r);
            const fr = r - r0;
            for (let px = 0; px < size; px++) {
                const X = (px + 0.5 - half) / scale;
                const o = py * size + px;
                if (X * X + Y * Y > rMax2) { field[o] = -1; continue; }
                const q = X - r / 2;
                const q0 = Math.floor(q);
                const fq = q - q0;
                // Triangle corners in axial coordinates, and their weights
                let a, b, c, wa, wb, wc;
                if (fq + fr < 1) {
                    a = idx(q0, r0); b = idx(q0 + 1, r0); c = idx(q0, r0 + 1);
                    wa = 1 - fq - fr; wb = fq; wc = fr;
                } else {
                    a = idx(q0 + 1, r0 + 1); b = idx(q0 + 1, r0); c = idx(q0, r0 + 1);
                    wa = fq + fr - 1; wb = 1 - fr; wc = 1 - fq;
                }
                field[o] = wa * s[a] + wb * s[b] + wc * s[c];
            }
        }

        // axial (q, r) relative to the seed -> array index (offset rows)
        function idx(q, r) {
            return (r + cy) * w + q + ((r - (r & 1)) >> 1) + cx;
        }
    }

    draw() {
        this.sample();
        const { size, field, image, model } = this;
        const height = this.height ??= new Float32Array(size * size);
        const data = image.data;
        const beta = Math.max(model.beta, 0.05);
        const relief = 2.2 * this.scale;
        const [lx, ly, lz] = LIGHT;
        // Blinn-Phong half vector, viewer straight above
        const hl = Math.sqrt(lx * lx + ly * ly + (lz + 1) * (lz + 1));
        const hx = lx / hl, hy = ly / hl, hz = (lz + 1) / hl;

        // Height for the relief: log of the stored mass in ice, so thin new
        // ice and thicker ridges differ. It is squashed toward a ceiling, or a plate (whose
        // mass climbs steadily toward its centre) turns into a pyramid. A
        // gentle ramp below 1 gives the ice edge a bevel.
        for (let o = 0; o < field.length; o++) {
            const f = field[o];
            height[o] = f >= 1 ? HEIGHT_CAP * Math.tanh(Math.log(f) / HEIGHT_CAP) : (f > 0 ? (f - 1) * 0.6 : -0.6);
        }

        for (let py = 0; py < size; py++) {
            const rowUp = py > 0 ? -size : 0, rowDown = py < size - 1 ? size : 0;
            for (let px = 0; px < size; px++) {
                const o = py * size + px;
                const p = o * 4;
                const v = field[o];
                if (v < 0) { data[p] = BG[0]; data[p + 1] = BG[1]; data[p + 2] = BG[2]; data[p + 3] = 255; continue; }

                // Background: the vapour field. At the background level it is
                // the page colour; it darkens where the crystal has drawn the
                // vapour down
                const vap = v < 1.3 * beta ? v / beta : 1.3;
                let r = 3 + (BG[0] - 3) * vap, g = 6 + (BG[1] - 6) * vap, b = 14 + (BG[2] - 14) * vap;

                if (v > 0.93) {
                    let ice = (v - 0.93) / 0.07;
                    if (ice > 1) ice = 1;
                    ice = ice * ice * (3 - 2 * ice);

                    const left = px > 0 ? o - 1 : o, right = px < size - 1 ? o + 1 : o;
                    const gx = (height[right] - height[left]) * relief;
                    const gy = (height[o + rowDown] - height[o + rowUp]) * relief;
                    const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
                    const nx = -gx * inv, ny = -gy * inv, nz = inv;
                    let diffuse = nx * lx + ny * ly + nz * lz;
                    if (diffuse < 0) diffuse = 0;
                    let sp = nx * hx + ny * hy + nz * hz;
                    if (sp < 0) sp = 0;
                    sp = sp * sp * sp; sp *= sp; sp *= sp; sp *= sp; // ^24
                    sp *= 200;

                    // Thin new ice is bright; thick old ice is clearer, so
                    // more of the dark sky shows through it
                    const t = 1 - Math.exp(-Math.log(v) * 1.2);
                    const shade = 0.62 + 0.5 * diffuse;
                    const ir = (228 - 150 * t) * shade + sp;
                    const ig = (242 - 120 * t) * shade + sp;
                    const ib = (255 - 60 * t) * shade + sp;
                    r += (ir - r) * ice; g += (ig - g) * ice; b += (ib - b) * ice;
                }
                data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
            }
        }
        return image;
    }
}
