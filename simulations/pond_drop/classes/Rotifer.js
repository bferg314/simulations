export class Rotifer {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.type = 'rotifer';
        this.color = 0xccaa88;

        this.size = 20 + Math.random() * 8;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.5;
        this.wheelPhase = 0;
        this.footExtended = true;
        this.energy = 50;
        this.maxEnergy = 100;

        // Graphics
        this.graphics = new PIXI.Container();
        this.body = new PIXI.Graphics();
        this.wheel = new PIXI.Graphics();
        this.foot = new PIXI.Graphics();

        this.graphics.addChild(this.foot);
        this.graphics.addChild(this.body);
        this.graphics.addChild(this.wheel);

        this.drawBody();

        this.graphics.x = x;
        this.graphics.y = y;
    }

    drawBody() {
        this.body.clear();

        // Vase-shaped body
        this.body.beginFill(0xddccaa, 0.5);
        this.body.lineStyle(1, 0xccbb99, 0.6);

        // Body outline
        this.body.moveTo(0, -this.size * 0.5);
        this.body.bezierCurveTo(
            this.size * 0.4, -this.size * 0.4,
            this.size * 0.35, this.size * 0.2,
            this.size * 0.15, this.size * 0.5
        );
        this.body.lineTo(-this.size * 0.15, this.size * 0.5);
        this.body.bezierCurveTo(
            -this.size * 0.35, this.size * 0.2,
            -this.size * 0.4, -this.size * 0.4,
            0, -this.size * 0.5
        );
        this.body.endFill();

        // Internal organs
        this.body.beginFill(0xbbaa88, 0.3);
        this.body.drawEllipse(0, 0, this.size * 0.2, this.size * 0.25);
        this.body.endFill();

        // Foot
        this.foot.clear();
        if (this.footExtended) {
            this.foot.lineStyle(2, 0xccbb99, 0.5);
            this.foot.moveTo(0, this.size * 0.5);
            this.foot.lineTo(0, this.size * 0.9);
            // Toes
            this.foot.moveTo(0, this.size * 0.9);
            this.foot.lineTo(-3, this.size);
            this.foot.moveTo(0, this.size * 0.9);
            this.foot.lineTo(3, this.size);
        }
    }

    drawWheel() {
        this.wheel.clear();

        // Corona (wheel organ) - creates current
        const numCilia = 12;
        this.wheel.lineStyle(1, 0xeeddcc, 0.7);

        for (let i = 0; i < numCilia; i++) {
            const baseAngle = (i / numCilia) * Math.PI - Math.PI / 2;
            const waveOffset = Math.sin(this.wheelPhase + i * 0.5) * 0.3;

            const startX = Math.cos(baseAngle) * this.size * 0.25;
            const startY = -this.size * 0.5;

            const endX = Math.cos(baseAngle + waveOffset) * this.size * 0.4;
            const endY = -this.size * 0.5 - this.size * 0.15;

            this.wheel.moveTo(startX, startY);
            this.wheel.lineTo(endX, endY);
        }

        // Central mouth
        this.wheel.beginFill(0x996655, 0.4);
        this.wheel.drawCircle(0, -this.size * 0.45, this.size * 0.08);
        this.wheel.endFill();
    }

    update(delta, bounds, lightIntensity, entities, temperature = 1) {
        // Animate wheel
        this.wheelPhase += 0.2 * delta * temperature;
        this.drawWheel();

        // Create suction effect - pull nearby bacteria toward mouth
        if (entities) {
            for (const e of entities) {
                if (e.type === 'bacteria' || e.type === 'detritus') {
                    const dx = this.x - e.x;
                    const dy = (this.y - this.size * 0.5) - e.y; // Pull toward mouth
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 60 && dist > 5) {
                        // Gentle suction
                        const force = 0.02 * (60 - dist) / 60;
                        e.vx = (e.vx || 0) + (dx / dist) * force * delta;
                        e.vy = (e.vy || 0) + (dy / dist) * force * delta;
                    }

                    // Eat if very close to mouth
                    if (dist < 8) {
                        this.energy = Math.min(this.maxEnergy, this.energy + 15);
                        return e;
                    }
                }
            }
        }

        // Movement - slow, drifting
        this.vx += (Math.random() - 0.5) * 0.01 * delta;
        this.vy += (Math.random() - 0.5) * 0.01 * delta;

        this.vx *= 0.98;
        this.vy *= 0.98;

        this.x += this.vx * delta * temperature;
        this.y += this.vy * delta * temperature;

        // Lose energy over time
        this.energy -= 0.02 * delta;

        // Screen wrap
        if (this.x < -30) this.x = bounds.width + 30;
        if (this.x > bounds.width + 30) this.x = -30;
        if (this.y < -30) this.y = bounds.height + 30;
        if (this.y > bounds.height + 30) this.y = -30;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;

        return null;
    }

    canReproduce() {
        return this.energy >= this.maxEnergy * 0.9;
    }

    reproduce() {
        this.energy = this.energy / 2;
        return { x: this.x + 20, y: this.y };
    }
}
