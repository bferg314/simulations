class SoilParticle {
    constructor(x, y, size) {
        this.pos = createVector(x, y);
        this.size = size;
        // Types: 0=Sand (large, light), 1=Organic (messy, dark), 2=Clay (tiny, dense)
        // Distribution: more sand and clay, less organic
        let rand = random();
        if (rand < 0.4) this.type = 0; // Sand
        else if (rand < 0.6) this.type = 1; // Organic
        else this.type = 2; // Clay

        this.moisture = 0; // 0 to 1
        this.noiseOffset = random(1000); // For organic wiggle
        this.rotation = random(TWO_PI);
    }

    update() {
        // Moisture slowly evaporates
        if (this.moisture > 0) {
            this.moisture = max(0, this.moisture - 0.0005);
        }

        // Organic matter has slight movement (decomposition/worms)
        if (this.type === 1 && this.size > 3) {
            this.pos.x += map(noise(frameCount * 0.01 + this.noiseOffset), 0, 1, -0.1, 0.1);
            this.pos.y += map(noise(frameCount * 0.01 + this.noiseOffset + 100), 0, 1, -0.05, 0.1);
            // Slowly shrink (decomposition)
            this.size = max(2, this.size - 0.0005);
        }
    }

    display() {
        push();
        translate(this.pos.x, this.pos.y);
        rotate(this.rotation);

        noStroke();
        if (this.type === 0) {
            // Sand - angular, granular
            fill(141 + this.moisture * 20, 110 + this.moisture * 10, 99, 200);
            rectMode(CENTER);
            rect(0, 0, this.size, this.size * 0.8, 1);
        } else if (this.type === 1) {
            // Organic matter - darker, irregular
            fill(45, 30 + this.moisture * 10, 25, 230);
            beginShape();
            let points = 6;
            for (let i = 0; i < points; i++) {
                let angle = map(i, 0, points, 0, TWO_PI);
                let r = this.size * (0.6 + noise(i * 0.5 + this.noiseOffset) * 0.6);
                vertex(cos(angle) * r, sin(angle) * r);
            }
            endShape(CLOSE);

            // Little "fibers" for organic
            stroke(80, 60, 40, 100);
            strokeWeight(0.5);
            for (let i = 0; i < 2; i++) {
                let ang = random(TWO_PI);
                line(0, 0, cos(ang) * this.size * 0.8, sin(ang) * this.size * 0.8);
            }
        } else if (this.type === 2) {
            // Clay - tiny, dense, reddish
            fill(150 + this.moisture * 30, 80, 70, 180);
            ellipse(0, 0, this.size * 0.6, this.size * 0.6);
        }

        pop();

        // Water film - blue highlight around wet particles
        if (this.moisture > 0.2) {
            noFill();
            let waterAlpha = this.moisture * 150;
            stroke(64, 196, 255, waterAlpha);
            strokeWeight(this.moisture * 2 + 1);
            ellipse(this.pos.x, this.pos.y, this.size * 1.4);

            // Shiny highlight
            if (this.moisture > 0.6) {
                fill(200, 230, 255, this.moisture * 80);
                noStroke();
                ellipse(this.pos.x - this.size * 0.2, this.pos.y - this.size * 0.2, 3, 2);
            }
        }
    }
}
