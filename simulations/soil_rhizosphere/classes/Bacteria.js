class Bacteria {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.vel = p5.Vector.random2D().mult(0.5);
        this.acc = createVector(0, 0);
        this.maxSpeed = 1.5;
        this.maxForce = 0.1;
        this.energy = random(50, 100); // Energy level for reproduction
        this.pulsePhase = random(TWO_PI);
        // Slight color variation
        this.hue = random(100, 140); // Green hues
    }

    update(particles, rootSystem) {
        // Brownian motion / wandering
        this.acc.add(p5.Vector.random2D().mult(0.15));

        // Seek nearby organic matter for food
        let nearestOrganic = null;
        let nearestDist = 80; // Detection range

        for (let p of particles) {
            if (p.type === 1) { // Organic matter
                let d = dist(this.pos.x, this.pos.y, p.pos.x, p.pos.y);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestOrganic = p;
                }
            }
        }

        if (nearestOrganic) {
            // Seek towards organic matter
            let desired = p5.Vector.sub(nearestOrganic.pos, this.pos);
            desired.setMag(this.maxSpeed * 1.5); // Speed up when hunting
            let steer = p5.Vector.sub(desired, this.vel);
            steer.limit(this.maxForce);
            this.acc.add(steer);

            // If touching organic matter, "eat" it (gain energy, reduce organic size)
            if (nearestDist < 8) {
                this.energy += 5;
                // Shrink organic matter slightly
                nearestOrganic.size = max(2, nearestOrganic.size - 0.1);
            }
        }

        // Slight attraction to root zone (rhizosphere is the action zone)
        if (rootSystem) {
            // Find nearest point on root
            let minRootDist = Infinity;
            let nearestRootPoint = null;
            for (let rp of rootSystem.structure) {
                let d = dist(this.pos.x, this.pos.y, rp.x, rp.y);
                if (d < minRootDist) {
                    minRootDist = d;
                    nearestRootPoint = rp;
                }
            }

            if (nearestRootPoint && minRootDist > 30 && minRootDist < 200) {
                // Gently attract to root zone
                let desired = p5.Vector.sub(nearestRootPoint, this.pos);
                desired.setMag(0.3);
                this.acc.add(desired);
            }
        }

        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);
        this.pos.add(this.vel);
        this.acc.mult(0);

        // Energy decay
        this.energy -= 0.05;

        // Bounds (wrap)
        if (this.pos.x < 0) this.pos.x = width;
        if (this.pos.x > width) this.pos.x = 0;
        if (this.pos.y < 0) this.pos.y = height;
        if (this.pos.y > height) this.pos.y = 0;
    }

    // Binary fission - returns a new Bacteria if conditions are met
    tryReproduce() {
        if (this.energy > 150) {
            this.energy *= 0.5;
            return new Bacteria(
                this.pos.x + random(-5, 5),
                this.pos.y + random(-5, 5)
            );
        }
        return null;
    }

    isDead() {
        return this.energy <= 0;
    }

    display() {
        // Pulsing glow effect
        let pulse = sin(frameCount * 0.05 + this.pulsePhase) * 0.3 + 0.7;
        let baseAlpha = map(this.energy, 0, 100, 80, 220);

        push();
        colorMode(HSB, 360, 100, 100, 255);

        // Outer glow
        noStroke();
        fill(this.hue, 80, 90, baseAlpha * 0.3 * pulse);
        ellipse(this.pos.x, this.pos.y, 10 * pulse, 10 * pulse);

        // Core
        fill(this.hue, 70, 100, baseAlpha);
        ellipse(this.pos.x, this.pos.y, 4, 4);

        pop();
    }
}
