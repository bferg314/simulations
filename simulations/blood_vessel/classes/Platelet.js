export class Platelet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.state = 'inactive'; // inactive, active, clumping
        this.angle = Math.random() * Math.PI * 2;

        this.sprite = new PIXI.Graphics();
        this.drawSprite();

        this.sprite.x = x;
        this.sprite.y = y;

        // Small and fast
        this.scaleBase = 0.3 + Math.random() * 0.2;
        this.sprite.scale.set(this.scaleBase);
    }

    drawSprite() {
        this.sprite.clear();
        if (this.state === 'inactive') {
            // Smooth, pale disc
            this.sprite.beginFill(0xF5F5DC); // Beige/White
            this.sprite.drawEllipse(0, 0, 8, 5);
            this.sprite.endFill();
        } else {
            // Spiky, stuck
            this.sprite.beginFill(0xFFFACD); // LemonChiffon
            // Manually draw a star/spiky shape because drawStar is not in core Pixi v7 without extras
            const points = [];
            const rOuter = 12;
            const rInner = 5;
            for (let i = 0; i < 10; i++) {
                const r = (i % 2 === 0) ? rOuter : rInner;
                const angle = (i / 10) * Math.PI * 2;
                points.push(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            this.sprite.drawPolygon(points);
            this.sprite.endFill();
        }
    }

    activate() {
        if (this.state === 'inactive') {
            this.state = 'active';
            this.drawSprite();
        }
    }

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius, damageZones) {
        if (this.state === 'clumping') {
            // Stuck in a clot, maybe jitter slightly but don't flow
            this.x += (Math.random() - 0.5) * 0.5;
            this.y += (Math.random() - 0.5) * 0.5;
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            return;
        }

        // Standard flow logic (similar to RBC)
        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;
        if (normalizedPos > 1) normalizedPos = 1;

        let flowVelocity = 6.5 * (1 - (normalizedPos * normalizedPos)); // Slightly faster than RBCs in center
        if (flowVelocity < 0.5) flowVelocity = 0.5;

        this.x += flowVelocity * flowFactor * delta;

        // Platelets tumble faster
        this.angle += (normalizedPos * 0.2) * flowFactor * delta;
        this.sprite.rotation = this.angle;

        // CHECK FOR DAMAGE ZONES (The "Cut" logic)
        if (damageZones && damageZones.length > 0) {
            for (let zone of damageZones) {
                // Simple distance check
                let dx = this.x - zone.x;
                let dy = this.y - zone.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < zone.radius) {
                    this.activate();
                    this.state = 'clumping'; // Instant stick for now
                    // "Attach" to the wound position with some randomness
                    // this.x = zone.x + (Math.random()-0.5)*zone.radius;
                    // this.y = zone.y + (Math.random()-0.5)*zone.radius;
                }
            }
        }

        // Screen wrap (only if not stuck)
        if (this.x > bounds.width + 50) {
            this.x = -50;
            this.y = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.9;
            this.state = 'inactive'; // Reset on respawn
            this.drawSprite();
        }

        this.sprite.x = this.x;
        this.sprite.y = this.y;
    }
}
