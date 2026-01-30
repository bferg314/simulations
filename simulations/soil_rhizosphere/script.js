// Soil Rhizosphere Simulation
// Driven by p5.js

let particles = [];
let rootSystem;
let fungi;
let bacteria = [];
let activeTool = 'observe';

function setup() {
    const canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('canvas-container');

    // Initialize Particles
    initSoil();

    // Initialize Root
    rootSystem = new RootSystem(width / 2, 0);

    // Initialize Fungal Network
    fungi = new FungalNetwork();
    fungi.start(width / 2, 100); // Start near root

    // UI Events
    setupUI();
}

function draw() {
    // Gradient Soil Background
    // Create a gradient from Topsoil (Darker) to Bedrock (Rocky)
    const c1 = color(45, 30, 20); // Topsoil
    const c2 = color(60, 45, 30); // Subsoil
    const c3 = color(30, 25, 25); // Bedrock

    noFill();
    // Draw gradient lines
    for (let y = 0; y < height; y++) {
        let inter = map(y, 0, height, 0, 1);
        let c;
        if (inter < 0.4) {
            // Blend top -> sub
            c = lerpColor(c1, c2, map(inter, 0, 0.4, 0, 1));
        } else {
            // Blend sub -> bedrock
            c = lerpColor(c2, c3, map(inter, 0.4, 1, 0, 1));
        }
        stroke(c);
        line(0, y, width, y);
    }

    // Logic
    handleInput();
    fungi.grow(particles);

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

    // 4. Bacteria (Simple dots for now)
    if (document.getElementById('check-bacteria').checked) {
        for (let b of bacteria) {
            b.update();
            b.display();
        }
    }

    updateStats();
}

function initSoil() {
    particles = [];
    const count = (width * height) / 2000;
    for (let i = 0; i < count; i++) {
        particles.push(new SoilParticle(random(width), random(height), random(4, 12)));
    }

    // Init Bacteria
    bacteria = [];
    for (let i = 0; i < 100; i++) {
        bacteria.push(new Bacteria(random(width), random(height)));
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

function handleInput() {
    if (mouseIsPressed && activeTool === 'water') {
        // Add water to nearby particles
        for (let p of particles) {
            let d = dist(mouseX, mouseY, p.pos.x, p.pos.y);
            if (d < 60) {
                p.moisture = min(p.moisture + 0.1, 1);
            }
        }
    }

    // Add organic matter
    if (mouseIsPressed && activeTool === 'organic') {
        // Spawn 2-3 new organic particles near the mouse
        for (let i = 0; i < 2; i++) {
            let p = new SoilParticle(
                mouseX + random(-20, 20),
                mouseY + random(-20, 20),
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
    let organicCount = 0;
    for (let p of particles) {
        totalM += p.moisture;
        if (p.type === 1) organicCount++;
    }

    let avg = (totalM / particles.length) * 100;
    document.getElementById('val-moisture').innerText = `${avg.toFixed(1)}%`;

    // Nutrient level based on organic particle count
    let nutrientLevel = "Low";
    const organicRatio = organicCount / particles.length;
    // Base organic is roughly 1/3 (0.33)
    if (organicRatio > 0.45) nutrientLevel = "High";
    else if (organicRatio > 0.35) nutrientLevel = "Medium";

    const nutrientEl = document.getElementById('val-nutrients');
    nutrientEl.innerText = nutrientLevel;
    nutrientEl.style.color =
        nutrientLevel === "High" ? "#81C784" :
            nutrientLevel === "Medium" ? "#FFB74D" : "#E57373";
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    initSoil();
    rootSystem = new RootSystem(width / 2, 0);
    fungi = new FungalNetwork();
    fungi.start(width / 2, 100);
}
