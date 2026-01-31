export class Pathogen {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.health = 100;
        this.isAlive = true;
        this.beingEngulfed = false;
        this.engulfProgress = 0;
        this.type = Math.random() > 0.5 ? 'bacteria' : 'virus';

        this.sprite = new PIXI.Graphics();
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.drawSprite();

        this.sprite.x = x;
        this.sprite.y = y;

        this.scaleBase = this.type === 'bacteria' ? 0.8 : 0.5;
        this.sprite.scale.set(this.scaleBase);
    }

    drawSprite() {
        this.sprite.clear();

        if (this.type === 'bacteria') {
            // Rod-shaped bacteria (like E. coli)
            // Main body
            this.sprite.beginFill(0x32CD32, 0.9); // Lime green
            this.sprite.drawRoundedRect(-12, -5, 24, 10, 5);
            this.sprite.endFill();

            // Flagella (wavy lines)
            this.sprite.lineStyle(1.5, 0x228B22, 0.7);
            // Left flagellum
            this.sprite.moveTo(-12, 0);
            this.sprite.bezierCurveTo(-18, -8, -22, 4, -28, -2);
            // Right flagellum  
            this.sprite.moveTo(12, 0);
            this.sprite.bezierCurveTo(18, 8, 22, -4, 28, 2);

            // Pili (tiny hairs)
            this.sprite.lineStyle(0.5, 0x90EE90, 0.5);
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI - Math.PI / 2;
                const startX = Math.cos(angle) * 5;
                const startY = Math.sin(angle) * 3 - 5;
                this.sprite.moveTo(startX, startY);
                this.sprite.lineTo(startX + Math.cos(angle) * 4, startY + Math.sin(angle) * 4 - 2);
            }
        } else {
            // Virus (spiky ball like coronavirus)
            // Core
            this.sprite.beginFill(0x9932CC, 0.9); // Purple
            this.sprite.drawCircle(0, 0, 8);
            this.sprite.endFill();

            // Spike proteins
            this.sprite.lineStyle(2, 0xDA70D6, 0.8);
            const spikes = 12;
            for (let i = 0; i < spikes; i++) {
                const angle = (i / spikes) * Math.PI * 2;
                const r1 = 8;
                const r2 = 14;
                this.sprite.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
                this.sprite.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
                // Spike tip (small circle)
                this.sprite.beginFill(0xFFB6C1);
                this.sprite.drawCircle(Math.cos(angle) * r2, Math.sin(angle) * r2, 2);
                this.sprite.endFill();
            }
        }
    }

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius, damageZones, entities) {
        if (!this.isAlive) return;

        // If being engulfed, shrink and fade
        if (this.beingEngulfed) {
            this.engulfProgress += 0.02 * delta;
            this.sprite.alpha = 1 - this.engulfProgress;
            this.sprite.scale.set(this.scaleBase * (1 - this.engulfProgress * 0.5));

            if (this.engulfProgress >= 1) {
                this.isAlive = false;
                this.sprite.visible = false;
            }
            return;
        }

        // Brownian motion - pathogens wriggle
        this.vx += (Math.random() - 0.5) * 0.3;
        this.vy += (Math.random() - 0.5) * 0.3;

        // Damping
        this.vx *= 0.95;
        this.vy *= 0.95;

        // Flow carries them
        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;
        if (normalizedPos > 1) normalizedPos = 1;

        let flowVelocity = 5 * (1 - (normalizedPos * normalizedPos));
        if (flowVelocity < 0.3) flowVelocity = 0.3;

        this.x += (flowVelocity * flowFactor * 0.5 + this.vx) * delta;
        this.y += this.vy * delta;

        // Stay in vessel bounds
        if (this.y < vesselCenter - vesselRadius + 20) {
            this.y = vesselCenter - vesselRadius + 20;
            this.vy *= -0.5;
        }
        if (this.y > vesselCenter + vesselRadius - 20) {
            this.y = vesselCenter + vesselRadius - 20;
            this.vy *= -0.5;
        }

        // Pulsing animation
        this.pulsePhase += 0.1 * delta;
        let pulse = 1 + Math.sin(this.pulsePhase) * 0.1;
        this.sprite.scale.set(this.scaleBase * pulse);

        // Rotation (tumbling)
        this.sprite.rotation += 0.02 * delta;

        // Screen wrap
        if (this.x > bounds.width + 50) {
            this.x = -50;
            this.y = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.8;
        }
        if (this.x < -60) {
            this.x = bounds.width + 40;
        }

        this.sprite.x = this.x;
        this.sprite.y = this.y;
    }

    startEngulfment() {
        this.beingEngulfed = true;
        this.engulfProgress = 0;
    }
}
