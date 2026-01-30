class RootSystem {
    constructor(x, y) {
        this.origin = createVector(x, y);
        this.structure = []; // Points defining the main root
        this.grow();
    }

    grow() {
        let current = this.origin.copy();
        this.structure.push(current.copy());

        // Main taproot growing down
        for (let i = 0; i < 30; i++) {
            let angle = map(noise(i * 0.1), 0, 1, PI / 2 - 0.5, PI / 2 + 0.5);
            current.add(p5.Vector.fromAngle(angle).mult(15));
            this.structure.push(current.copy());
        }
    }

    display() {
        noStroke();
        fill(141, 110, 99); // Medium brown

        // Draw main root as a filled shape
        beginShape();
        // Left side of root
        for (let i = 0; i < this.structure.length; i++) {
            let p = this.structure[i];
            let thickness = map(i, 0, this.structure.length, 15, 2);
            // Add some noise to thickness
            thickness += map(noise(i * 0.2, frameCount * 0.01), 0, 1, -2, 2);
            vertex(p.x - thickness, p.y);
        }
        // Right side of root (going back up)
        for (let i = this.structure.length - 1; i >= 0; i--) {
            let p = this.structure[i];
            let thickness = map(i, 0, this.structure.length, 15, 2);
            thickness += map(noise(i * 0.2, frameCount * 0.01 + 100), 0, 1, -2, 2);
            vertex(p.x + thickness, p.y);
        }
        endShape(CLOSE);

        // Root hairs (lighter, thinner)
        stroke(215, 204, 200, 150);
        strokeWeight(1);
        noFill();
        for (let i = 5; i < this.structure.length; i++) {
            let p = this.structure[i];
            // Simple distinct hairs
            if (noise(i) > 0.4) {
                let len = map(noise(i * 0.5), 0, 1, 5, 20);
                line(p.x - 10, p.y, p.x - 10 - len, p.y + len * 0.5);
            }
            if (noise(i + 100) > 0.4) {
                let len = map(noise(i * 0.5 + 50), 0, 1, 5, 20);
                line(p.x + 10, p.y, p.x + 10 + len, p.y + len * 0.5);
            }
        }
    }
}
