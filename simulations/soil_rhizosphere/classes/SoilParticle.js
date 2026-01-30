class SoilParticle {
    constructor(x, y, size) {
        this.pos = createVector(x, y);
        this.size = size;
        // Types: 0=Sand (large, light), 1=Organic (messy, dark), 2=Clay (tiny, dense)
        this.type = random([0, 0, 1]);
        this.moisture = 0; // 0 to 1
    }

    display() {
        noStroke();
        if (this.type === 0) {
            // Sand
            fill(121, 85, 72, 200); // Brown 400
            rectMode(CENTER);
            rect(this.pos.x, this.pos.y, this.size, this.size, 2);
        } else if (this.type === 1) {
            // Organic matter
            fill(62, 39, 35, 220); // Dark brown
            beginShape();
            for (let i = 0; i < 5; i++) {
                let angle = map(i, 0, 5, 0, TWO_PI);
                let r = this.size * (0.8 + random(0.4));
                let sx = this.pos.x + cos(angle) * r;
                let sy = this.pos.y + sin(angle) * r;
                vertex(sx, sy);
            }
            endShape(CLOSE);
        }

        // Water film?
        if (this.moisture > 0.3) {
            noFill();
            stroke(33, 150, 243, this.moisture * 100);
            strokeWeight(2);
            ellipse(this.pos.x, this.pos.y, this.size * 1.2);
        }
    }
}
