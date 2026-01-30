class Bacteria {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.vel = p5.Vector.random2D().mult(0.5);
        this.acc = createVector(0, 0);
        this.maxSpeed = 2;
        this.maxForce = 0.1;
        this.color = color(100, 255, 100, 200); // Bioluminescent green-ish
    }

    update() {
        // Brownian motion / wandering
        this.acc.add(p5.Vector.random2D().mult(0.2));

        // Attraction to roots (simplified: center of screen)
        // In a real sim we'd query the root structure
        let centerDir = createVector(width / 2 - this.pos.x, -this.pos.y).normalize().mult(0.01);
        this.acc.add(centerDir);

        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);
        this.pos.add(this.vel);
        this.acc.mult(0);

        // Bounds
        if (this.pos.x < 0) this.pos.x = width;
        if (this.pos.x > width) this.pos.x = 0;
        if (this.pos.y < 0) this.pos.y = height;
        if (this.pos.y > height) this.pos.y = 0;
    }

    display() {
        noStroke();
        fill(this.color);
        ellipse(this.pos.x, this.pos.y, 4, 4);
    }
}
