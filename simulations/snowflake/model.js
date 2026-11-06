// Reiter's local cellular model for snow crystal growth (Reiter 2005).
//
// No DOM here, so the rule can be tested under Node.
//
// Each cell of a hexagonal grid holds a real value s, "an amount of water".
// A cell is ice when s >= 1. One step:
//
//   1. Receptive cells are ice cells and cells with an ice neighbour.
//   2. Split the field in two:
//        v = s + gamma at receptive cells, 0 elsewhere   (mass that stays put)
//        u = s at non-receptive cells, 0 at receptive ones (mass free to move)
//   3. Diffuse u everywhere (receptive cells included, where u is 0):
//        u' = u + (alpha / 12) * (sum of the six neighbours' u - 6u)
//      With alpha = 1 that is the paper's "average of the cell with the
//      average of its neighbours": centre weight 1/2, each neighbour 1/12.
//   4. s' = u' + v.
//
// Cells at Euclidean distance >= R from the seed are held at the background
// level beta. The start is one ice cell (s = 1) in a sea of beta.
//
// Storage is "offset rows": row y, column x, cell centre at
// (x + (y & 1) / 2, y * sqrt(3) / 2). Odd rows are shifted half a cell right.

export const SQRT3_2 = Math.sqrt(3) / 2;

export class SnowModel {
    constructor({ radius = 200, alpha = 1, beta = 0.4, gamma = 0.001 } = {}) {
        this.radius = radius;
        // Room for the disc plus a ring of fixed cells, so every updated cell
        // has all six neighbours inside the array.
        this.width = 2 * radius + 5;
        this.height = 2 * Math.ceil(radius / SQRT3_2) + 5;
        if ((this.height & 1) === 0) this.height += 1; // odd, so the centre row is even
        this.cx = (this.width - 1) >> 1;
        this.cy = (this.height - 1) >> 1;
        if (this.cy & 1) { this.cy -= 1; } // centre on an even row: offsets below assume it

        const n = this.width * this.height;
        this.s = new Float64Array(n);
        this.next = new Float64Array(n);
        this.u = new Float64Array(n);
        this.receptive = new Uint8Array(n);
        this.frozen = new Uint8Array(n);

        // Per row, the column span [lo, hi] of cells strictly inside the disc
        // (those get updated); everything else stays at beta.
        this.rowLo = new Int32Array(this.height);
        this.rowHi = new Int32Array(this.height);
        this.buildSpans();

        this.alpha = alpha;
        this.beta = beta;
        this.gamma = gamma;
        this.reset();
    }

    buildSpans() {
        const { width, height, cx, cy, radius } = this;
        const ox = cx; // centre cell's x coordinate (even row, no shift)
        for (let y = 0; y < height; y++) {
            const py = (y - cy) * SQRT3_2;
            let lo = width, hi = -1;
            for (let x = 1; x < width - 1; x++) {
                const px = x + (y & 1) * 0.5 - ox;
                if (px * px + py * py < radius * radius) {
                    if (x < lo) lo = x;
                    hi = x;
                }
            }
            if (y === 0 || y === height - 1) { lo = width; hi = -1; }
            this.rowLo[y] = lo;
            this.rowHi[y] = hi;
        }
    }

    reset() {
        this.s.fill(this.beta);
        this.next.fill(this.beta);
        this.receptive.fill(0);
        this.s[this.index(this.cx, this.cy)] = 1;
        this.steps = 0;
        this.iceCount = 1;
        this.iceRadius = 0;   // furthest ice cell from the seed, in cell widths
        this.done = false;    // ice has reached the fixed boundary
        this.updateFrozen();
    }

    index(x, y) { return y * this.width + x; }

    // Centre of cell i relative to the seed, in cell widths
    position(i) {
        const y = (i / this.width) | 0;
        const x = i - y * this.width;
        return [x + (y & 1) * 0.5 - this.cx, (y - this.cy) * SQRT3_2];
    }

    // Change the background level. Like Reiter's Fig. 7, the free (non-ice)
    // vapour is rescaled in proportion so it meets the new boundary at once.
    setBeta(beta) {
        if (beta === this.beta) return;
        const ratio = this.beta > 0 ? beta / this.beta : 0;
        const { s } = this;
        for (let i = 0; i < s.length; i++) {
            if (this.receptive[i]) continue;
            s[i] = this.beta > 0 ? s[i] * ratio : beta;
        }
        this.next.fill(beta); // interior is rewritten next step; the fixed ring must read beta
        this.beta = beta;
    }

    updateFrozen() {
        const { s, frozen } = this;
        for (let i = 0; i < s.length; i++) frozen[i] = s[i] >= 1 ? 1 : 0;
    }

    step() {
        if (this.done) return false;
        const { width: w, height: h, s, u, next, receptive, frozen, rowLo, rowHi, alpha, gamma, beta } = this;

        // 1. Receptive set. Only rows near the ice can contain receptive cells.
        const reach = Math.ceil(this.iceRadius / SQRT3_2) + 2;
        const yMin = Math.max(1, this.cy - reach), yMax = Math.min(h - 2, this.cy + reach);
        receptive.fill(0, (yMin - 1) * w, (yMax + 2) * w);
        for (let y = yMin; y <= yMax; y++) {
            const odd = y & 1;
            const lo = rowLo[y], hi = rowHi[y];
            for (let x = lo; x <= hi; x++) {
                const i = y * w + x;
                if (frozen[i]) { receptive[i] = 1; continue; }
                const a = odd ? i - w : i - w - 1; // upper-left
                const b = odd ? i + w : i + w - 1; // lower-left
                if (frozen[i - 1] || frozen[i + 1] || frozen[a] || frozen[a + 1] || frozen[b] || frozen[b + 1]) {
                    receptive[i] = 1;
                }
            }
        }

        // 2. Free vapour field
        for (let i = 0; i < s.length; i++) u[i] = receptive[i] ? 0 : s[i];

        // 3 and 4. Diffuse the free field, add back the fixed mass plus gamma
        const k = alpha / 12;
        let iceCount = 0, iceR2 = this.iceRadius * this.iceRadius;
        for (let y = 1; y < h - 1; y++) {
            const lo = rowLo[y], hi = rowHi[y];
            if (lo > hi) continue;
            const odd = y & 1;
            const py = (y - this.cy) * SQRT3_2;
            for (let x = lo; x <= hi; x++) {
                const i = y * w + x;
                const a = odd ? i - w : i - w - 1;
                const b = odd ? i + w : i + w - 1;
                const ui = u[i];
                const sum = u[i - 1] + u[i + 1] + u[a] + u[a + 1] + u[b] + u[b + 1];
                let v = ui + k * (sum - 6 * ui);
                if (receptive[i]) v += s[i] + gamma;
                next[i] = v;
                if (v >= 1) {
                    iceCount++;
                    if (!frozen[i]) {
                        const px = x + odd * 0.5 - this.cx;
                        const r2 = px * px + py * py;
                        if (r2 > iceR2) iceR2 = r2;
                    }
                }
            }
        }

        // Swap. Fixed cells are never written, so both buffers keep beta there.
        this.s = next;
        this.next = s;
        this.steps++;
        this.iceCount = iceCount;
        this.iceRadius = Math.sqrt(iceR2);
        this.updateFrozenNear();

        // Stop when the ice gets within two cells of the fixed boundary
        if (this.iceRadius >= this.radius - 2) this.done = true;
        return true;
    }

    updateFrozenNear() {
        const { width: w, height: h, s, frozen } = this;
        const reach = Math.ceil(this.iceRadius / SQRT3_2) + 3;
        const yMin = Math.max(0, this.cy - reach), yMax = Math.min(h - 1, this.cy + reach);
        for (let i = yMin * w, end = (yMax + 1) * w; i < end; i++) frozen[i] = s[i] >= 1 ? 1 : 0;
    }

    // Frozen area over the area of the smallest regular hexagon centred on
    // the seed that encloses it (circumradius = furthest ice cell). Each cell
    // has area sqrt(3)/2 in these units. Near 1 for a plate, small for a
    // dendrite.
    fillRatio() {
        const r = this.iceRadius + 0.5;
        const hexArea = 1.5 * Math.sqrt(3) * r * r;
        return (this.iceCount * SQRT3_2) / hexArea;
    }
}
