// Soil Rhizosphere Simulation
// Driven by p5.js

let particles = [];
let rootSystem;
let fungi;
let bacteria = [];
let activeTool = 'observe';

// Sugars the root releases per frame, shared by the bacteria crowding it. This
// sets how many the rhizosphere can feed once the organic matter is gone.
const ROOT_EXUDATE = 4;
let exudateShare = 0;
// Organic mass at the start, the reference for the nutrient reading
let baselineOrganic = 1;

// Zoom and pan state
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

function setup() {
    const canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('canvas-container');

    // Initialize Particles
    initSoil();

    // Initialize Root
    rootSystem = new RootSystem(width / 2, 0);

    // Initialize Fungal Network - attach to root system
    fungi = new FungalNetwork();
    fungi.attachToRoot(rootSystem);

    // UI Events
    setupUI();
}

function draw() {
    // Clear background first
    background(45, 30, 20);

    // Apply zoom and pan transformation
    push();
    translate(panX, panY);
    scale(zoomLevel);

    // Gradient Soil Background
    const c1 = color(45, 30, 20); // Topsoil
    const c2 = color(60, 45, 30); // Subsoil
    const c3 = color(30, 25, 25); // Bedrock

    noFill();
    // Draw gradient lines
    for (let y = 0; y < height / zoomLevel; y++) {
        let inter = map(y, 0, height / zoomLevel, 0, 1);
        let c;
        if (inter < 0.4) {
            c = lerpColor(c1, c2, map(inter, 0, 0.4, 0, 1));
        } else {
            c = lerpColor(c2, c3, map(inter, 0.4, 1, 0, 1));
        }
        stroke(c);
        line(-panX / zoomLevel, y, (width - panX) / zoomLevel, y);
    }

    // Logic (use world coordinates)
    let worldMouseX = (mouseX - panX) / zoomLevel;
    let worldMouseY = (mouseY - panY) / zoomLevel;
    handleInput(worldMouseX, worldMouseY);
    fungi.grow(particles, rootSystem);

    // Update soil particles
    for (let p of particles) {
        p.update();
    }

    // Update bacteria with lifecycle
    let newBacteria = [];
    let nearRoot = 0;
    for (let i = bacteria.length - 1; i >= 0; i--) {
        let b = bacteria[i];
        b.update(particles, rootSystem, exudateShare);
        if (b.nearRoot) nearRoot++;

        let offspring = b.tryReproduce();
        if (offspring) {
            newBacteria.push(offspring);
        }

        if (b.isDead()) {
            bacteria.splice(i, 1);
        }
    }
    for (let nb of newBacteria) {
        if (bacteria.length < 500) {
            bacteria.push(nb);
        }
    }
    // Next frame's exudate is split between everyone at the root now
    exudateShare = nearRoot > 0 ? ROOT_EXUDATE / nearRoot : 0;

    // Organic matter that has been eaten away is gone
    if (particles.some(p => p.consumed)) {
        particles = particles.filter(p => !p.consumed);
    }

    // Rendering
    // 1. Soil
    for (let p of particles) {
        p.display();
    }

    // 2. Fungi
    if (document.getElementById('check-fungi').checked) {
        fungi.display();
    }

    // 3. Roots
    if (document.getElementById('check-roots').checked) {
        rootSystem.display();
    }

    // 4. Bacteria
    if (document.getElementById('check-bacteria').checked) {
        for (let b of bacteria) {
            b.display();
        }
    }

    // 5. Observe mode overlay
    if (activeTool === 'observe') {
        drawObserveInfo(worldMouseX, worldMouseY);
    }

    pop(); // End zoom/pan transform

    // Draw zoom indicator (screen space, not affected by zoom)
    drawZoomIndicator();

    updateStats();
}

function drawZoomIndicator() {
    if (zoomLevel !== 1) {
        push();
        fill(0, 0, 0, 150);
        noStroke();
        rect(width - 90, height - 35, 80, 25, 5);
        fill(255);
        textSize(12);
        textAlign(CENTER, CENTER);
        text(`${(zoomLevel * 100).toFixed(0)}%`, width - 50, height - 22);
        pop();
    }
}

function initSoil() {
    particles = [];
    fillSoil(0, 0, width, height);

    baselineOrganic = Math.max(1, organicMass());

    // Init Bacteria
    bacteria = [];
    for (let i = 0; i < 100; i++) {
        bacteria.push(new Bacteria(random(width), random(height)));
    }
}

function organicMass() {
    let mass = 0;
    for (let p of particles) {
        if (p.type === 1) mass += p.size;
    }
    return mass;
}

// Scatter soil over a region at the standard density
function fillSoil(x0, y0, x1, y1) {
    const count = ((x1 - x0) * (y1 - y0)) / 2000;
    for (let i = 0; i < count; i++) {
        particles.push(new SoilParticle(random(x0, x1), random(y0, y1), random(4, 12)));
    }
}

function drawBacteria() {
    noStroke();
    fill(100, 255, 100, 150); // Greenish
    for (let i = 0; i < 50; i++) {
        // Just random "activity" clouds near roots for now
        let rx = width / 2 + random(-40, 40) + sin(frameCount * 0.01 + i) * 20;
        let ry = height / 2 + random(-200, 200);
        ellipse(rx, ry, 3, 3);
    }
}

function handleInput(worldX, worldY) {
    // Handle panning with shift+drag or middle mouse
    if (mouseIsPressed && (keyIsDown(SHIFT) || mouseButton === CENTER)) {
        if (!isPanning) {
            isPanning = true;
            lastMouseX = mouseX;
            lastMouseY = mouseY;
        }
        panX += mouseX - lastMouseX;
        panY += mouseY - lastMouseY;
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        return; // Don't process other tools while panning
    } else {
        isPanning = false;
    }

    if (mouseIsPressed && activeTool === 'water') {
        // Add water to nearby particles with visual droplet effect
        for (let p of particles) {
            let d = dist(worldX, worldY, p.pos.x, p.pos.y);
            if (d < 60) {
                p.moisture = min(p.moisture + 0.1, 1);
            }
        }
        // Water ripple visual (in world space)
        push();
        noFill();
        stroke(64, 196, 255, 100);
        strokeWeight(2);
        let ripple = (frameCount % 30) / 30;
        ellipse(worldX, worldY, 60 * ripple, 60 * ripple);
        pop();
    }

    // Add organic matter
    if (mouseIsPressed && activeTool === 'organic') {
        // Spawn organic particles near the mouse (world coords)
        for (let i = 0; i < 2; i++) {
            let p = new SoilParticle(
                worldX + random(-20, 20),
                worldY + random(-20, 20),
                random(4, 10)
            );
            p.type = 1; // Organic
            p.moisture = 0.5; // Starts moist
            particles.push(p);
        }
        // Limit particle count for performance
        if (particles.length > 2000) particles.shift();
    }
}

function drawObserveInfo(worldX, worldY) {
    // Find what's under the cursor (using world coordinates)
    let info = null;

    // Check bacteria first (on top)
    for (let b of bacteria) {
        if (dist(worldX, worldY, b.pos.x, b.pos.y) < 10) {
            info = {
                type: 'Bacteria',
                details: `Energy: ${b.energy.toFixed(0)}`,
                color: color(100, 255, 100)
            };
            break;
        }
    }

    // Check soil particles
    if (!info) {
        for (let p of particles) {
            if (dist(worldX, worldY, p.pos.x, p.pos.y) < p.size) {
                let typeName = ['Sand', 'Organic', 'Clay'][p.type];
                info = {
                    type: typeName,
                    details: `Moisture: ${(p.moisture * 100).toFixed(0)}%`,
                    color: p.type === 0 ? color(141, 110, 99) :
                        p.type === 1 ? color(80, 60, 40) : color(150, 80, 70)
                };
                break;
            }
        }
    }

    // Draw magnifying glass cursor (in world space, so it zooms with content)
    push();
    noFill();
    stroke(255, 255, 255, 150);
    strokeWeight(2 / zoomLevel); // Keep line weight consistent
    let glassSize = 30 / zoomLevel;
    ellipse(worldX, worldY, glassSize, glassSize);
    line(worldX + glassSize * 0.35, worldY + glassSize * 0.35,
        worldX + glassSize * 0.6, worldY + glassSize * 0.6);
    pop();

    // Draw info tooltip (screen space - after pop() in draw)
    // We need to draw this OUTSIDE the transform, so we save the info
    // and let draw() handle it. For now, draw in world space but adjust.
    if (info) {
        push();
        // Offset for tooltip in world space
        let tooltipX = worldX + 25 / zoomLevel;
        let tooltipY = worldY - 10 / zoomLevel;

        // Scale-adjusted sizes
        let boxW = 110 / zoomLevel;
        let boxH = 40 / zoomLevel;

        // Background
        fill(0, 0, 0, 180);
        stroke(info.color);
        strokeWeight(1 / zoomLevel);
        rect(tooltipX, tooltipY, boxW, boxH, 5 / zoomLevel);

        // Text
        noStroke();
        fill(255);
        textSize(12 / zoomLevel);
        textAlign(LEFT, TOP);
        text(info.type, tooltipX + 8 / zoomLevel, tooltipY + 6 / zoomLevel);
        fill(200);
        textSize(10 / zoomLevel);
        text(info.details, tooltipX + 8 / zoomLevel, tooltipY + 22 / zoomLevel);

        pop();
    }
}

function setupUI() {
    const buttons = document.querySelectorAll('.tool-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTool = btn.dataset.tool;
        });
    });
}

function updateStats() {
    const netNodeCount = fungi.nodes.length;
    document.getElementById('val-network').innerText = `${netNodeCount} nodes`;

    // Average moisture
    let totalM = 0;
    for (let p of particles) {
        totalM += p.moisture;
    }

    let avg = particles.length > 0 ? (totalM / particles.length) * 100 : 0;
    document.getElementById('val-moisture').innerText = `${avg.toFixed(1)}%`;

    // Nutrient level: organic matter left, against what the soil started with
    let nutrientLevel = "Low";
    const organicRatio = organicMass() / baselineOrganic;
    if (organicRatio > 0.66) nutrientLevel = "High";
    else if (organicRatio > 0.33) nutrientLevel = "Medium";

    const nutrientEl = document.getElementById('val-nutrients');
    nutrientEl.innerText = nutrientLevel;
    nutrientEl.style.color =
        nutrientLevel === "High" ? "#81C784" :
            nutrientLevel === "Medium" ? "#FFB74D" : "#E57373";

    // Bacteria count
    const bacteriaEl = document.getElementById('val-bacteria');
    if (bacteriaEl) {
        bacteriaEl.innerText = bacteria.length;
        // Color based on population health
        bacteriaEl.style.color =
            bacteria.length > 200 ? "#81C784" :
                bacteria.length > 50 ? "#FFB74D" : "#E57373";
    }
}

function windowResized() {
    // Keep the world; only fill soil into area the bigger window newly shows
    const oldW = width;
    const oldH = height;
    resizeCanvas(windowWidth, windowHeight);
    if (width > oldW) fillSoil(oldW, 0, width, height);
    if (height > oldH) fillSoil(0, oldH, Math.min(oldW, width), height);
}

// Mouse wheel zoom - zoom centered on cursor position
function mouseWheel(event) {
    // Prevent default page scroll
    event.preventDefault();

    // Calculate world position before zoom
    let worldXBefore = (mouseX - panX) / zoomLevel;
    let worldYBefore = (mouseY - panY) / zoomLevel;

    // Adjust zoom level
    let zoomDelta = -event.delta * 0.001;
    zoomLevel = constrain(zoomLevel + zoomDelta, 0.25, 5); // Min 25%, Max 500%

    // Calculate world position after zoom
    let worldXAfter = (mouseX - panX) / zoomLevel;
    let worldYAfter = (mouseY - panY) / zoomLevel;

    // Adjust pan to keep cursor over the same world point
    panX += (worldXAfter - worldXBefore) * zoomLevel;
    panY += (worldYAfter - worldYBefore) * zoomLevel;

    return false; // Prevent default
}

// Double-click to reset zoom
function doubleClicked() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
}
