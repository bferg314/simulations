class FungalNetwork {
    constructor() {
        this.nodes = []; // {pos: p5.Vector, parent: index, rootAttached: boolean}
        this.rootAttachPoints = []; // Points where fungi attaches to root
    }

    // Initialize with multiple attachment points along the root
    attachToRoot(rootSystem) {
        this.rootAttachPoints = [];
        this.nodes = [];

        // Create attachment points along the root (skip the very top)
        for (let i = 5; i < rootSystem.structure.length; i += 2) {
            let rootPoint = rootSystem.structure[i];

            // Add attachment points on both sides of the root
            let thickness = map(i, 0, rootSystem.structure.length, 15, 2);

            // Left side attachment
            this.rootAttachPoints.push({
                pos: createVector(rootPoint.x - thickness - 2, rootPoint.y),
                rootIndex: i
            });

            // Right side attachment
            this.rootAttachPoints.push({
                pos: createVector(rootPoint.x + thickness + 2, rootPoint.y),
                rootIndex: i
            });
        }

        // Initialize nodes from attachment points
        for (let ap of this.rootAttachPoints) {
            this.nodes.push({
                pos: ap.pos.copy(),
                parent: -1,
                age: 0,
                rootAttached: true
            });
        }
    }

    grow(soilParticles, rootSystem) {
        // Growth speed
        if (frameCount % 3 !== 0) return;

        // Limit total size
        if (this.nodes.length >= 2000) return;

        // Try to branch from existing nodes
        const attempts = 8;
        let grewThisFrame = 0;

        for (let k = 0; k < attempts && grewThisFrame < 2; k++) {
            // Prefer growing from tips (newer nodes)
            let parentIndex;
            if (random() < 0.7 && this.nodes.length > 50) {
                // Pick from newer nodes (tips)
                parentIndex = floor(random(this.nodes.length * 0.7, this.nodes.length));
            } else {
                parentIndex = floor(random(this.nodes.length));
            }

            let parent = this.nodes[parentIndex];

            // Determine growth direction
            let angle;

            if (parent.rootAttached) {
                // If attached to root, grow OUTWARD (away from root center)
                let rootCenter = rootSystem.structure[floor(rootSystem.structure.length / 2)];
                let outwardDir = p5.Vector.sub(parent.pos, rootCenter);
                angle = outwardDir.heading() + random(-PI / 3, PI / 3);
            } else if (parent.parent !== -1) {
                // Continue roughly in same direction with some variation
                let grandParent = this.nodes[parent.parent];
                let prevDir = p5.Vector.sub(parent.pos, grandParent.pos).heading();
                angle = prevDir + random(-PI / 3, PI / 3);
            } else {
                // Random direction
                angle = random(TWO_PI);
            }

            // Segment length - shorter near root, longer further out
            let distFromRoot = this.getDistanceFromRoot(parent.pos, rootSystem);
            let len = map(distFromRoot, 0, 200, 5, 12);
            len = constrain(len, 5, 15);

            let newPos = p5.Vector.fromAngle(angle).mult(len).add(parent.pos);

            // Avoid growing INTO the root
            let newDistFromRoot = this.getDistanceFromRoot(newPos, rootSystem);
            if (newDistFromRoot < 10) continue; // Too close to root

            // MOISTURE CHECK - sample nearby particles
            let moisture = 0.2; // Base chance
            for (let i = 0; i < 3; i++) {
                let p = random(soilParticles);
                if (p && dist(newPos.x, newPos.y, p.pos.x, p.pos.y) < 40) {
                    moisture = max(moisture, p.moisture * 0.5 + 0.3);
                }
            }

            // Growth probability
            if (random() > moisture) continue;

            // Bounds check
            if (newPos.x > 0 && newPos.x < width && newPos.y > 0 && newPos.y < height) {
                this.nodes.push({
                    pos: newPos,
                    parent: parentIndex,
                    age: 0,
                    rootAttached: false
                });
                grewThisFrame++;
            }
        }
    }

    // Helper: find distance from a point to the nearest root segment
    getDistanceFromRoot(pos, rootSystem) {
        let minDist = Infinity;
        for (let rp of rootSystem.structure) {
            let d = dist(pos.x, pos.y, rp.x, rp.y);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }

    display() {
        // Draw fungal threads
        stroke(238, 238, 238, 120); // Whiteish, slightly transparent
        strokeWeight(0.8);
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

        // Draw attachment points (small dots on root)
        noStroke();
        fill(255, 255, 255, 80);
        for (let i = 0; i < this.nodes.length && i < this.rootAttachPoints.length; i++) {
            let node = this.nodes[i];
            if (node.rootAttached) {
                ellipse(node.pos.x, node.pos.y, 3, 3);
            }
        }

        // Visualize nutrient transfer pulses
        if (this.nodes.length > 30) {
            noStroke();
            fill(180, 255, 180, 200); // Soft green pulse
            const pulseCount = 8;
            const t = frameCount * 0.03;

            for (let i = 0; i < pulseCount; i++) {
                let idx = floor(noise(t * 0.1 + i * 100) * this.nodes.length);
                let node = this.nodes[idx];

                if (node && node.parent !== -1) {
                    let parent = this.nodes[node.parent];
                    let lerpVal = (t * 0.5 + i * 0.2) % 1.0;

                    // Pulse travels toward root (nutrient flow)
                    let lx = lerp(node.pos.x, parent.pos.x, lerpVal);
                    let ly = lerp(node.pos.y, parent.pos.y, lerpVal);

                    ellipse(lx, ly, 3, 3);
                }
            }
        }
    }
}
