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

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius, damageZones, entities) {
        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;
        if (normalizedPos > 1) normalizedPos = 1;

        // Base Flow Velocity
        let flowVelocity = 6 * (1 - (normalizedPos * normalizedPos));

        // CHEMOTAXIS (Seek Damage/Clots)
        let attracting = false;

        // Check damage zones
        if (damageZones && damageZones.length > 0) {
            let closest = null;
            let minDist = 300; // Sensing range

            for (const zone of damageZones) {
                const dx = zone.x - this.x;
                const dy = zone.y - this.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < minDist) {
                    minDist = d;
                    closest = zone;
                }
            }

            if (closest) {
                attracting = true;
                // Move towards damage 
                const dx = closest.x - this.x;
                const dy = closest.y - this.y;
                const angle = Math.atan2(dy, dx);

                // Active migration overrides passive flow partially
                this.x += Math.cos(angle) * 1.5 * delta;
                this.y += Math.sin(angle) * 1.5 * delta;

                // Slow down flow to stick around
                flowVelocity *= 0.2;
            }
        }

        // MARGINATION: Neutrophils tend to roll along the walls (if not seeking damage)
        if (!attracting && this.type === 'neutrophil') {
            // Bias Y towards walls
            if (this.y < vesselCenter) this.y -= 0.2 * delta;
            else this.y += 0.2 * delta;

            // Clamp inside vessel
            if (this.y < vesselCenter - vesselRadius + 20) this.y = vesselCenter - vesselRadius + 20;
            if (this.y > vesselCenter + vesselRadius - 20) this.y = vesselCenter + vesselRadius - 20;
        }

        if (this.type === 'neutrophil' && normalizedPos > 0.8 && !attracting) {
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

        // Screen wrap
        if (this.x > bounds.width + 60) {
            this.x = -60;
            // Respawn logic
            let newY = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.9;
            this.y = newY;
        }

        this.sprite.x = this.x;
        this.sprite.y = this.y;
    }
}
