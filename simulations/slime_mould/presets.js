// Starting layouts. No DOM, so the tests and the tuning tools can use them.

// Fraction of habitable cells that get an agent by default. Jones (2010)
// used %p = 3-15 over the whole lattice; a mould confined to a dish or a
// coastline needs a little more to reach every food source.
export const DEFAULT_DENSITY = 0.2;

// The inoculum is packed at this fraction of its area. Much denser and the
// agents jam into a solid sheet that never opens into a network (exclusion
// means an agent can only move into an empty cell).
const INOCULUM_PACKING = 0.4;

export const PRESETS = {
    dish: { label: 'Petri dish' },
    tokyo: { label: 'Tokyo (after Tero et al. 2010, approximate)' },
    agar: { label: 'Bare agar (no food)' },
};

function inoculumRadius(count) {
    return Math.sqrt(count / (INOCULUM_PACKING * Math.PI));
}

function habitableCount(wall) {
    let n = 0;
    for (let i = 0; i < wall.length; i++) if (!wall[i]) n++;
    return n;
}

// Sets walls, lights, food and agents on `model` for the named preset.
// `count` overrides the density-based agent count. Returns the agent count used.
export function applyPreset(model, name, { count = null, density = DEFAULT_DENSITY } = {}) {
    const W = model.width, H = model.height;
    model.trail.fill(0);
    model.foods = [];
    model.lights = [];
    model.areaLight = null;
    const wall = new Uint8Array(W * H);
    let cx = W / 2, cy = H / 2;

    if (name === 'dish') {
        const R = Math.min(W, H) * 0.47;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > R) wall[y * W + x] = 1;
            }
        }
        model.setWalls(wall);
        const foodR = Math.max(2.5, R * 0.018);
        const ring = 10;
        for (let i = 0; i < ring; i++) {
            const a = (i / ring) * Math.PI * 2 - Math.PI / 2;
            model.foods.push({ x: cx + Math.cos(a) * R * 0.78, y: cy + Math.sin(a) * R * 0.78, r: foodR });
        }
        model.dish = { cx, cy, r: R };
    } else if (name === 'tokyo') {
        const map = tokyoMap(W, H);
        model.setWalls(map.wall);
        for (const [x, y, r] of map.lights) model.lights.push({ x, y, r });
        const foodR = Math.max(2, map.scale * 0.012);
        for (const c of TOKYO_CITIES) {
            const [x, y] = map.project(c[1], c[2]);
            model.foods.push({ x, y, r: c[0] === 'Tokyo' ? foodR * 1.6 : foodR, name: c[0] });
        }
        [cx, cy] = map.project(TOKYO_CITIES[0][1], TOKYO_CITIES[0][2]);
        model.dish = null;
        model.map = map;
    } else {
        model.setWalls(wall);
        model.dish = null;
    }
    model.rebuildStimuli();

    const n = count ?? Math.round(habitableCount(model.wall) * density);
    model.spawnBlob(n, cx, cy, inoculumRadius(n));
    model.steps = 0;
    return n;
}

// --- Tokyo ------------------------------------------------------------------
//
// Tero et al. (2010) put 36 oat flakes at the cities around Tokyo inside an
// arena bounded by the Pacific coastline, inoculated at Tokyo, and in some runs
// lit the mountains and lakes to keep the mould off them. The coordinates
// below are city-centre positions from general knowledge (rounded to 0.01 deg),
// not read off the paper's figure, and the coastline is a coarse hand-drawn
// outline. The layout is approximate.

// [name, longitude, latitude]
export const TOKYO_CITIES = [
    ['Tokyo', 139.77, 35.68],
    ['Yokohama', 139.60, 35.47],
    ['Kawasaki', 139.70, 35.53],
    ['Saitama', 139.62, 35.91],
    ['Chiba', 140.12, 35.61],
    ['Funabashi', 139.98, 35.71],
    ['Kashiwa', 139.97, 35.86],
    ['Matsudo', 139.90, 35.79],
    ['Hachioji', 139.32, 35.66],
    ['Tachikawa', 139.41, 35.70],
    ['Machida', 139.44, 35.55],
    ['Sagamihara', 139.37, 35.57],
    ['Atsugi', 139.36, 35.44],
    ['Hiratsuka', 139.35, 35.34],
    ['Fujisawa', 139.49, 35.35],
    ['Odawara', 139.15, 35.27],
    ['Yokosuka', 139.65, 35.27],
    ['Kawagoe', 139.49, 35.92],
    ['Tokorozawa', 139.47, 35.80],
    ['Ome', 139.28, 35.79],
    ['Kumagaya', 139.39, 36.15],
    ['Kuki', 139.67, 36.06],
    ['Koga', 139.80, 36.18],
    ['Tsukuba', 140.10, 36.08],
    ['Tsuchiura', 140.20, 36.08],
    ['Toride', 140.05, 35.91],
    ['Narita', 140.32, 35.78],
    ['Sakura', 140.22, 35.72],
    ['Togane', 140.37, 35.56],
    ['Mobara', 140.29, 35.43],
    ['Ichihara', 140.12, 35.50],
    ['Kisarazu', 139.95, 35.38],
    ['Kimitsu', 139.92, 35.32],
    ['Yamato', 139.46, 35.49],
    ['Choshi', 140.80, 35.73],
    ['Mito', 140.47, 36.37],
];

// Land outline, clockwise from the north-west corner of the map window.
const KANTO_LAND = [
    [139.00, 36.45], [140.62, 36.45], [140.58, 36.31], [140.68, 35.95],
    [140.87, 35.72], [140.70, 35.70], [140.45, 35.50], [140.41, 35.30],
    [140.30, 35.14], [140.10, 35.10], [139.88, 34.90], [139.83, 34.98],
    [139.80, 35.30], [139.90, 35.38], [140.08, 35.58], [139.98, 35.68],
    [139.80, 35.63], [139.78, 35.54], [139.65, 35.44], [139.68, 35.28],
    [139.75, 35.25], [139.62, 35.13], [139.57, 35.27], [139.55, 35.31],
    [139.40, 35.32], [139.30, 35.30], [139.16, 35.24], [139.14, 35.15],
    [139.07, 35.09], [139.10, 34.90], [139.00, 34.90],
];

// Lit areas (lon, lat, radius in degrees of latitude): Lake Kasumigaura and the
// Tanzawa and Okutama-Chichibu mountains, after the paper's illumination mask
// idea. Placement is rough.
const KANTO_LIGHTS = [
    [140.40, 36.04, 0.07],
    [139.13, 35.47, 0.10],
    [139.05, 35.88, 0.14],
];

const LON0 = 139.0, LON1 = 140.9, LAT0 = 34.9, LAT1 = 36.45;

export function tokyoMap(W, H) {
    const kx = Math.cos((35.7 * Math.PI) / 180);
    const mapW = (LON1 - LON0) * kx, mapH = LAT1 - LAT0;
    const scale = Math.min(W / mapW, H / mapH) * 0.96;  // cells per degree of latitude
    const ox = (W - mapW * scale) / 2, oy = (H - mapH * scale) / 2;
    const project = (lon, lat) => [ox + (lon - LON0) * kx * scale, oy + (LAT1 - lat) * scale];
    const poly = KANTO_LAND.map(([lon, lat]) => project(lon, lat));
    const x0 = ox, x1 = ox + mapW * scale, y0 = oy, y1 = oy + mapH * scale;

    const wall = new Uint8Array(W * H);
    const lights = KANTO_LIGHTS.map(([lon, lat, r]) => { const [x, y] = project(lon, lat); return [x, y, r * scale]; });
    for (let y = 0; y < H; y++) {
        const py = y + 0.5;
        // Scanline crossings of the polygon for this row
        const xs = [];
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [ax, ay] = poly[i], [bx, by] = poly[j];
            if ((ay > py) !== (by > py)) xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax));
        }
        xs.sort((a, b) => a - b);
        for (let x = 0; x < W; x++) {
            const px = x + 0.5;
            const c = y * W + x;
            let inside = false;
            for (const cx of xs) { if (cx < px) inside = !inside; else break; }
            if (!inside || px < x0 || px > x1 || py < y0 || py > y1) wall[c] = 1;
        }
    }
    return { wall, lights, project, scale, poly, bounds: [x0, y0, x1, y1] };
}
