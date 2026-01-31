export class Cholesterol {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.isStuck = false;
        this.stuckTime = 0;
        this.size = 4 + Math.random() * 4;
        this.wobblePhase = Math.random() * Math.PI * 2;

        this.sprite = new PIXI.Graphics();
        this.drawSprite();

        this.sprite.x = x;
        this.sprite.y = y;
    }

    drawSprite() {
        this.sprite.clear();

        // Yellow fatty globule
        this.sprite.beginFill(0xFFD700, 0.85); // Gold
        this.sprite.drawCircle(0, 0, this.size);
        this.sprite.endFill();

        // Highlight
        this.sprite.beginFill(0xFFFFAA, 0.6);
        this.sprite.drawCircle(-this.size * 0.3, -this.size * 0.3, this.size * 0.4);
        this.sprite.endFill();

        // Darker edge for depth
        this.sprite.lineStyle(1, 0xCC9900, 0.5);
        this.sprite.drawCircle(0, 0, this.size);
    }

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius, damageZones, entities) {
        if (this.isStuck) {
            // Stuck to wall - grow slightly over time (plaque accumulation)
            this.stuckTime += delta;

            // Wobble slightly
            this.wobblePhase += 0.02 * delta;
            this.sprite.x = this.x + Math.sin(this.wobblePhase) * 0.5;
            this.sprite.y = this.y + Math.cos(this.wobblePhase * 0.7) * 0.3;

            // Grow very slowly
            if (this.stuckTime > 500 && this.size < 12) {
                this.size += 0.001 * delta;
                this.drawSprite();
            }

            return;
        }

        // Flow physics
        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;
        if (normalizedPos > 1) normalizedPos = 1;

        let flowVelocity = 5 * (1 - (normalizedPos * normalizedPos));
        if (flowVelocity < 0.3) flowVelocity = 0.3;

        // Cholesterol drifts toward walls (lipids are lighter)
        if (this.y < vesselCenter) {
            this.vy -= 0.01 * delta;
        } else {
            this.vy += 0.01 * delta;
        }

        // Damping
        this.vx *= 0.98;
        this.vy *= 0.98;

        this.x += (flowVelocity * flowFactor * 0.6 + this.vx) * delta;
        this.y += this.vy * delta;

        // Check if near wall - stick to it
        const wallMargin = 30;
        if (this.y < vesselCenter - vesselRadius + wallMargin ||
            this.y > vesselCenter + vesselRadius - wallMargin) {

            // Chance to stick
            if (Math.random() < 0.02) {
                this.isStuck = true;
                // Snap to wall
                if (this.y < vesselCenter) {
                    this.y = vesselCenter - vesselRadius + 15 + Math.random() * 10;
                } else {
                    this.y = vesselCenter + vesselRadius - 15 - Math.random() * 10;
                }
            }
        }

        // Bounce off walls
        if (this.y < vesselCenter - vesselRadius + 10) {
            this.y = vesselCenter - vesselRadius + 10;
            this.vy *= -0.5;
        }
        if (this.y > vesselCenter + vesselRadius - 10) {
            this.y = vesselCenter + vesselRadius - 10;
            this.vy *= -0.5;
        }

        // Screen wrap
        if (this.x > bounds.width + 30) {
            this.x = -30;
            this.y = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.8;
        }

        this.sprite.x = this.x;
        this.sprite.y = this.y;
    }

    // Check if this plaque blocks an entity
    checkCollision(entity) {
        if (!this.isStuck || this.size < 6) return false;

        const dx = entity.x - this.x;
        const dy = entity.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist < this.size + 10;
    }
}
