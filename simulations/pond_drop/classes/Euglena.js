export class Euglena {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.type = 'euglena';
        this.color = 0x66cc66;

        this.size = 12 + Math.random() * 4;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.8;
        this.mode = 'photosynthetic'; // or 'hunting'
        this.energy = 50;
        this.maxEnergy = 100;
        this.flagellaPhase = 0;
        this.reproductionCooldown = 500; // Can't reproduce immediately

        // Graphics
        this.graphics = new PIXI.Container();
        this.body = new PIXI.Graphics();
        this.eyespot = new PIXI.Graphics();
        this.flagellum = new PIXI.Graphics();

        this.graphics.addChild(this.flagellum);
        this.graphics.addChild(this.body);
        this.graphics.addChild(this.eyespot);

        this.drawBody();

        this.graphics.x = x;
        this.graphics.y = y;
    }

    drawBody() {
        this.body.clear();

        // Elongated cell body - changes color based on mode
        const bodyColor = this.mode === 'photosynthetic' ? 0x44aa44 : 0x66aa66;
        this.body.beginFill(bodyColor, 0.6);
        this.body.lineStyle(1, 0x55bb55, 0.7);

        // Teardrop/spindle shape
        this.body.moveTo(this.size, 0);
        this.body.bezierCurveTo(
            this.size * 0.8, -this.size * 0.4,
            -this.size * 0.5, -this.size * 0.3,
            -this.size * 0.8, 0
        );
        this.body.bezierCurveTo(
            -this.size * 0.5, this.size * 0.3,
            this.size * 0.8, this.size * 0.4,
            this.size, 0
        );
        this.body.endFill();

        // Chloroplasts (green spots inside)
        if (this.mode === 'photosynthetic') {
            this.body.beginFill(0x228822, 0.4);
            this.body.drawCircle(-this.size * 0.2, -this.size * 0.1, this.size * 0.15);
            this.body.drawCircle(-this.size * 0.1, this.size * 0.1, this.size * 0.12);
            this.body.drawCircle(this.size * 0.2, 0, this.size * 0.1);
            this.body.endFill();
        }

        // Eyespot (red/orange - photoreceptor)
        this.eyespot.clear();
        this.eyespot.beginFill(0xff6633, 0.8);
        this.eyespot.drawCircle(this.size * 0.5, -this.size * 0.15, this.size * 0.1);
        this.eyespot.endFill();
    }

    drawFlagellum() {
        this.flagellum.clear();
        this.flagellum.lineStyle(1.5, 0x88cc88, 0.6);

        // Wavy flagellum at front
        const waveAmp = 3 + Math.sin(this.flagellaPhase * 3) * 2;
        this.flagellum.moveTo(this.size, 0);

        for (let i = 0; i < 8; i++) {
            const t = i / 8;
            const x = this.size + t * this.size * 0.8;
            const y = Math.sin(this.flagellaPhase + t * Math.PI * 2) * waveAmp * (1 - t);
            this.flagellum.lineTo(x, y);
        }
    }

    update(delta, bounds, lightIntensity, entities) {
        // Animate flagellum
        this.flagellaPhase += 0.3 * delta;
        this.drawFlagellum();

        // Mode switching based on light
        if (lightIntensity > 0.6) {
            if (this.mode !== 'photosynthetic') {
                this.mode = 'photosynthetic';
                this.drawBody();
            }
            // Gain energy from light (very slowly)
            this.energy = Math.min(this.maxEnergy, this.energy + 0.02 * lightIntensity * delta);
        } else {
            if (this.mode !== 'hunting') {
                this.mode = 'hunting';
                this.drawBody();
            }
            // Lose energy in dark
            this.energy -= 0.05 * delta;
        }

        // Behavior based on mode
        if (this.mode === 'photosynthetic') {
            // Move toward light (upward bias, slower)
            this.vy -= 0.01 * delta;
            this.speed = 0.4;

            // Gentle spiraling motion
            this.angle += Math.sin(Date.now() * 0.003) * 0.02;
        } else {
            // Hunting mode - seek bacteria
            this.speed = 1.2;

            let nearestFood = null;
            let minDist = 150;

            if (entities) {
                for (const e of entities) {
                    if (e.type === 'bacteria' || e.type === 'detritus') {
                        const dx = e.x - this.x;
                        const dy = e.y - this.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < minDist) {
                            minDist = dist;
                            nearestFood = e;
                        }
                    }
                }
            }

            if (nearestFood) {
                const dx = nearestFood.x - this.x;
                const dy = nearestFood.y - this.y;
                const targetAngle = Math.atan2(dy, dx);

                let angleDiff = targetAngle - this.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                this.angle += angleDiff * 0.08 * delta;

                // Eat if close
                if (minDist < 10) {
                    this.energy = Math.min(this.maxEnergy, this.energy + 20);
                    return nearestFood;
                }
            } else {
                // Random search
                this.angle += (Math.random() - 0.5) * 0.1 * delta;
            }
        }

        // Movement
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.vx += Math.cos(this.angle) * this.speed * 0.1 * delta;
        this.vy += Math.sin(this.angle) * this.speed * 0.1 * delta;

        this.x += this.vx * delta;
        this.y += this.vy * delta;

        // Screen wrap
        if (this.x < -20) this.x = bounds.width + 20;
        if (this.x > bounds.width + 20) this.x = -20;
        if (this.y < -20) this.y = bounds.height + 20;
        if (this.y > bounds.height + 20) this.y = -20;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;
        this.graphics.rotation = this.angle;

        return null;
    }

    // Check if ready to reproduce - requires full energy, cooldown, and random chance
    canReproduce() {
        this.reproductionCooldown--;
        // Need max energy, cooldown expired, AND random chance (1% per frame)
        return this.energy >= this.maxEnergy &&
            this.reproductionCooldown <= 0 &&
            Math.random() < 0.01;
    }

    // Binary fission
    reproduce() {
        this.energy = 30; // Start with less energy
        this.reproductionCooldown = 1000; // Long cooldown before can reproduce again
        return { x: this.x + (Math.random() - 0.5) * 30, y: this.y + (Math.random() - 0.5) * 30 };
    }
}
