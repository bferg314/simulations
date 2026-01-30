class FungalNetwork {
    constructor() {
        this.nodes = []; // {pos: p5.Vector, parent: index}
        this.grown = false;
    }

    start(startX, startY) {
        this.nodes.push({
            pos: createVector(startX, startY),
            parent: -1,
            age: 0
        });
    }

    grow(soilParticles) {
        // Growth speed based on network size (slower as it gets bigger, but faster if moist)
        if (frameCount % 2 !== 0) return;

        // Limit total size
        if (this.nodes.length >= 1500) return;

        // Try to branch from adequate nodes
        // We'll pick a few random nodes to try branching from
        const attempts = 5;
        for (let k = 0; k < attempts; k++) {
            let parentIndex = floor(random(this.nodes.length));
            let parent = this.nodes[parentIndex];

            // Bias: prefer newer nodes (tips) slightly? 
            // Or just purely random exploration.

            // Simple L-system-like branching
            let angle = random(PI / 4, PI * 3 / 4);
            if (parent.parent !== -1) {
                let grandParent = this.nodes[parent.parent];
                let prevDir = p5.Vector.sub(parent.pos, grandParent.pos).heading();
                angle = prevDir + random(-PI / 4, PI / 4);
            }

            let len = random(8, 15);
            let newPos = p5.Vector.fromAngle(angle).mult(len).add(parent.pos);

            // MOISTURE CHECK
            // Find if there is a particle nearby with moisture
            // Brute force check on subset? No, let's just use the global mouse position or "cheat"
            // For now, let's just make growth faster if deep

            // Actually, let's rely on passed soilParticles. 
            // Finding the nearest particle is expensive O(N).
            // But we can check just a random sample?
            let moisture = 0;
            // Sample 5 random particles - if any are close and wet, good!
            // This is a probabilistic approximation
            for (let i = 0; i < 5; i++) {
                let p = random(soilParticles);
                if (p && dist(newPos.x, newPos.y, p.pos.x, p.pos.y) < 50) {
                    moisture = max(moisture, p.moisture);
                }
            }

            // If dry, low chance to grow. If wet, high chance.
            if (random() > (0.1 + moisture * 0.8)) continue;

            if (newPos.x > 0 && newPos.x < width && newPos.y < height) {
                this.nodes.push({
                    pos: newPos,
                    parent: parentIndex,
                    age: 0
                });
                break; // One branch per frame max
            }
        }
    }

    display() {
        stroke(238, 238, 238, 150); // Whiteish fungal threads
        strokeWeight(1);
        noFill();

        beginShape(LINES);
        for (let node of this.nodes) {
            if (node.parent !== -1) {
                let parent = this.nodes[node.parent];
                vertex(parent.pos.x, parent.pos.y);
                vertex(node.pos.x, node.pos.y);
            }
        }
        endShape();

        // Visualize Symbiosis / Nutrient Transfer (Pulses)
        // Draw moving dots along random paths
        // We'll deterministically pick some paths based on time
        if (this.nodes.length > 20) {
            noStroke();
            fill(200, 255, 200); // Glowing green pulse
            const pulseCount = 5;
            const t = frameCount * 0.05;

            for (let i = 0; i < pulseCount; i++) {
                // Select a 'path' index based on time and noise
                // We map time to an index in the nodes array
                let pathOffset = i * 200;
                let idx = floor(noise(t * 0.1 + i) * this.nodes.length);
                let node = this.nodes[idx];

                // Trace back a bit to interpolate position on the branch
                if (node && node.parent !== -1) {
                    let parent = this.nodes[node.parent];
                    let lerpVal = (t + i) % 1.0;

                    // Pulse moves from parent to child (growth) or reverse (nutrient)
                    // Let's do reverse for nutrients (soil -> root)
                    let lx = lerp(node.pos.x, parent.pos.x, lerpVal);
                    let ly = lerp(node.pos.y, parent.pos.y, lerpVal);

                    ellipse(lx, ly, 4, 4);
                }
            }
        }
    }
}
