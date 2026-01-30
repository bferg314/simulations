export class WBC {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.type = Math.random() > 0.7 ? 'lymphocyte' : 'neutrophil';

        this.sprite = new PIXI.Graphics();
        this.drawSprite();

        this.sprite.x = x;
        this.sprite.y = y;

        this.timeOffset = Math.random() * 100;

        // Leukocytes are larger
        this.scaleBase = 1.0;
        this.sprite.scale.set(this.scaleBase);
    }

    drawSprite() {
        this.sprite.clear();
        if (this.type === 'neutrophil') {
            // Complex nucleus, granular
            this.sprite.beginFill(0xE6E6FA); // Lavender base
            this.sprite.drawCircle(0, 0, 18);
            this.sprite.endFill();

            // Nucleus (multi-lobed)
            this.sprite.beginFill(0x483D8B, 0.5); // Dark Slate Blue
            this.sprite.drawCircle(-5, -5, 6);
            this.sprite.drawCircle(5, 0, 6);
            this.sprite.drawCircle(-2, 6, 6);
            this.sprite.endFill();
        } else {
            // Lymphocyte: Large round nucleus
            this.sprite.beginFill(0xE6E6FA);
            this.sprite.drawCircle(0, 0, 14);
            this.sprite.endFill();

            this.sprite.beginFill(0x483D8B, 0.8);
            this.sprite.drawCircle(0, 0, 10);
            this.sprite.endFill();
        }
    }

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius) {
        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;
        if (normalizedPos > 1) normalizedPos = 1;

        // MARGINATION: Neutrophils tend to roll along the walls
        if (this.type === 'neutrophil') {
            // Bias Y towards walls
            if (this.y < vesselCenter) this.y -= 0.2 * delta;
            else this.y += 0.2 * delta;

            // Clamp inside vessel
            if (this.y < vesselCenter - vesselRadius + 20) this.y = vesselCenter - vesselRadius + 20;
            if (this.y > vesselCenter + vesselRadius - 20) this.y = vesselCenter + vesselRadius - 20;
        }

        // Velocity
        // Rolling cells (near wall) move much slower
        let flowVelocity = 6 * (1 - (normalizedPos * normalizedPos));

        if (this.type === 'neutrophil' && normalizedPos > 0.8) {
            // Rolling friction
            flowVelocity *= 0.3;
            // Add "rolling" wobble
            this.sprite.rotation += 0.05 * delta;
        } else {
            // Flowing
            this.sprite.rotation = Math.sin(this.timeOffset + this.x * 0.01) * 0.2;
        }

        if (flowVelocity < 0.2) flowVelocity = 0.2;

        this.x += flowVelocity * flowFactor * delta;

        // Amoeboid movement visual (pulsing)
        // const breathe = 1 + Math.sin(Date.now() * 0.002 + this.timeOffset) * 0.05;
        // this.sprite.scale.set(this.scaleBase * breathe);

        // Screen wrap
        if (this.x > bounds.width + 60) {
            this.x = -60;
            // Respawn logic
            let newY = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.9;
            if (this.type === 'neutrophil') {
                // Bias new neutrophils to already be marginated? 
                // Or let them drift there. Let's let them drift.
            }
            this.y = newY;
        }

        this.sprite.x = this.x;
        this.sprite.y = this.y;
    }
}
