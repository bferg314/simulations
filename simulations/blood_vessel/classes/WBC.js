export class WBC {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.type = Math.random() > 0.7 ? 'lymphocyte' : 'neutrophil';
        this.state = 'patrolling'; // patrolling, hunting, engulfing
        this.target = null;
        this.killCount = 0;
        this.engulfPhase = 0;

        this.sprite = new PIXI.Graphics();
        this.drawSprite();

        this.sprite.x = x;
        this.sprite.y = y;

        this.timeOffset = Math.random() * 100;
        this.pseudopodPhase = Math.random() * Math.PI * 2;

        // Leukocytes are larger
        this.scaleBase = 1.0;
        this.sprite.scale.set(this.scaleBase);
    }

    drawSprite() {
        this.sprite.clear();

        // Amoeboid shape with pseudopods
        const wobble = Math.sin(this.pseudopodPhase) * 0.3;
        const wobble2 = Math.cos(this.pseudopodPhase * 1.3) * 0.2;

        if (this.type === 'neutrophil') {
            // Neutrophil - granular with multi-lobed nucleus
            // Base amoeba shape
            this.sprite.beginFill(0xE6E6FA);
            this.sprite.moveTo(-18 - wobble * 5, 0);
            this.sprite.bezierCurveTo(-18, -15 - wobble2 * 8, 18, -15 + wobble * 5, 18 + wobble2 * 5, 0);
            this.sprite.bezierCurveTo(18, 15 + wobble * 8, -18, 15 - wobble2 * 5, -18 - wobble * 5, 0);
            this.sprite.endFill();

            // Multi-lobed nucleus
            this.sprite.beginFill(0x483D8B, 0.6);
            this.sprite.drawCircle(-5 + wobble * 2, -5, 6);
            this.sprite.drawCircle(5 - wobble * 2, 0, 6);
            this.sprite.drawCircle(-2 + wobble2 * 2, 6, 6);
            this.sprite.endFill();

            // Granules
            this.sprite.beginFill(0x9370DB, 0.3);
            for (let i = 0; i < 8; i++) {
                const gx = (Math.random() - 0.5) * 20;
                const gy = (Math.random() - 0.5) * 14;
                this.sprite.drawCircle(gx, gy, 2);
            }
            this.sprite.endFill();

        } else {
            // Lymphocyte: Large round nucleus, small cytoplasm
            this.sprite.beginFill(0xE6E6FA);
            this.sprite.drawCircle(0, 0, 14 + wobble * 2);
            this.sprite.endFill();

            this.sprite.beginFill(0x483D8B, 0.8);
            this.sprite.drawCircle(0, 0, 10);
            this.sprite.endFill();
        }

        // Hunting indicator (red glow when chasing)
        if (this.state === 'hunting' && this.target) {
            this.sprite.lineStyle(2, 0xFF6B6B, 0.5);
            this.sprite.drawCircle(0, 0, 22 + wobble * 3);
        }

        // Engulfing animation (pseudopods reaching out)
        if (this.state === 'engulfing') {
            this.sprite.beginFill(0xE6E6FA, 0.6);
            const reach = this.engulfPhase * 15;
            // Two pseudopods wrapping around
            this.sprite.moveTo(15, -5);
            this.sprite.bezierCurveTo(15 + reach, -10, 20 + reach, 0, 15 + reach * 0.5, 5);
            this.sprite.moveTo(15, 5);
            this.sprite.bezierCurveTo(15 + reach, 10, 20 + reach, 0, 15 + reach * 0.5, -5);
            this.sprite.endFill();
        }
    }

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius, damageZones, entities) {
        // Animate pseudopods
        this.pseudopodPhase += 0.08 * delta;

        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;
        if (normalizedPos > 1) normalizedPos = 1;

        let flowVelocity = 6 * (1 - (normalizedPos * normalizedPos));
        let attracting = false;

        // PATHOGEN HUNTING (Priority over damage zones)
        if (entities && this.state !== 'engulfing') {
            let closestPathogen = null;
            let minDist = 250; // Sensing range

            for (const e of entities) {
                if (e.constructor.name === 'Pathogen' && e.isAlive && !e.beingEngulfed) {
                    const dx = e.x - this.x;
                    const dy = e.y - this.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < minDist) {
                        minDist = d;
                        closestPathogen = e;
                    }
                }
            }

            if (closestPathogen) {
                this.state = 'hunting';
                this.target = closestPathogen;
                attracting = true;

                const dx = closestPathogen.x - this.x;
                const dy = closestPathogen.y - this.y;
                const angle = Math.atan2(dy, dx);

                // Active chase - faster than normal flow
                const chaseSpeed = this.type === 'neutrophil' ? 3.0 : 2.0;
                this.x += Math.cos(angle) * chaseSpeed * delta;
                this.y += Math.sin(angle) * chaseSpeed * delta;

                // Face the target
                this.sprite.rotation = angle;

                // Check for engulfment (contact)
                if (minDist < 25) {
                    this.state = 'engulfing';
                    this.engulfPhase = 0;
                    closestPathogen.startEngulfment();
                }

                flowVelocity *= 0.1; // Almost stop when hunting
            } else {
                this.state = 'patrolling';
                this.target = null;
            }
        }

        // ENGULFING animation
        if (this.state === 'engulfing') {
            this.engulfPhase += 0.03 * delta;

            if (this.engulfPhase >= 1) {
                this.killCount++;
                this.state = 'patrolling';
                this.engulfPhase = 0;
                this.target = null;

                // Brief size increase (got bigger from eating)
                this.scaleBase = Math.min(1.3, this.scaleBase + 0.05);
            }

            this.drawSprite();
            this.sprite.x = this.x;
            this.sprite.y = this.y;
            return;
        }

        // DAMAGE ZONE CHEMOTAXIS (secondary priority)
        if (!attracting && damageZones && damageZones.length > 0) {
            let closest = null;
            let minDist = 300;

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
                const dx = closest.x - this.x;
                const dy = closest.y - this.y;
                const angle = Math.atan2(dy, dx);

                this.x += Math.cos(angle) * 1.5 * delta;
                this.y += Math.sin(angle) * 1.5 * delta;

                flowVelocity *= 0.2;
            }
        }

        // MARGINATION: Neutrophils roll along walls
        if (!attracting && this.type === 'neutrophil') {
            if (this.y < vesselCenter) this.y -= 0.2 * delta;
            else this.y += 0.2 * delta;

            if (this.y < vesselCenter - vesselRadius + 20) this.y = vesselCenter - vesselRadius + 20;
            if (this.y > vesselCenter + vesselRadius - 20) this.y = vesselCenter + vesselRadius - 20;
        }

        if (this.type === 'neutrophil' && normalizedPos > 0.8 && !attracting) {
            flowVelocity *= 0.3;
            this.sprite.rotation += 0.05 * delta;
        } else if (!attracting) {
            this.sprite.rotation = Math.sin(this.timeOffset + this.x * 0.01) * 0.2;
        }

        if (flowVelocity < 0.2) flowVelocity = 0.2;

        this.x += flowVelocity * flowFactor * delta;

        // Screen wrap
        if (this.x > bounds.width + 60) {
            this.x = -60;
            this.y = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.9;
        }

        this.drawSprite();
        this.sprite.x = this.x;
        this.sprite.y = this.y;
    }
}
