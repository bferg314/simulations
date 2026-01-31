export class Paramecium {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 1 + Math.random();
        this.type = 'paramecium';
        this.color = 0x88ccff; // For particle effects
        this.vx = 0;
        this.vy = 0;

        // Graphics container
        this.graphics = new PIXI.Container();

        // Cilia layer (behind body)
        this.ciliaGraphics = new PIXI.Graphics();
        this.graphics.addChild(this.ciliaGraphics);

        // Body
        this.body = new PIXI.Graphics();
        this.drawBody();
        this.graphics.addChild(this.body);

        // Nucleus
        this.nucleus = new PIXI.Graphics();
        this.nucleus.beginFill(0x6699cc, 0.4);
        this.nucleus.drawEllipse(5, 0, 12, 8);
        this.nucleus.endFill();
        // Micronucleus
        this.nucleus.beginFill(0x5588bb, 0.6);
        this.nucleus.drawCircle(12, -3, 4);
        this.nucleus.endFill();
        this.graphics.addChild(this.nucleus);

        // Internal vacuoles (contractile vacuoles)
        this.vacuoles = [];
        for (let i = 0; i < 2; i++) {
            const v = new PIXI.Graphics();
            v.beginFill(0xAADDFF, 0.3);
            v.drawCircle(0, 0, 6);
            v.endFill();
            v.x = (i === 0 ? -20 : 25);
            this.graphics.addChild(v);
            this.vacuoles.push({ graphics: v, phase: Math.random() * Math.PI * 2 });
        }

        // Oral groove
        this.oralGroove = new PIXI.Graphics();
        this.oralGroove.lineStyle(2, 0x6699bb, 0.4);
        this.oralGroove.moveTo(-35, 5);
        this.oralGroove.quadraticCurveTo(-25, 12, -10, 10);
        this.graphics.addChild(this.oralGroove);

        this.graphics.x = x;
        this.graphics.y = y;
        this.graphics.rotation = this.angle;

        // Cilia animation
        this.ciliaPhase = Math.random() * Math.PI * 2;
        this.ciliaCount = 24;
    }

    drawBody() {
        this.body.clear();
        // Outer membrane
        this.body.lineStyle(1.5, 0xaaddff, 0.5);
        this.body.beginFill(0x88ccff, 0.15);
        // Slipper shape (asymmetric oval)
        this.body.moveTo(-38, 0);
        this.body.bezierCurveTo(-38, -18, -10, -22, 10, -18);
        this.body.bezierCurveTo(30, -14, 40, -5, 40, 0);
        this.body.bezierCurveTo(40, 5, 30, 14, 10, 18);
        this.body.bezierCurveTo(-10, 22, -38, 18, -38, 0);
        this.body.endFill();
    }

    drawCilia() {
        this.ciliaGraphics.clear();
        this.ciliaGraphics.lineStyle(1, 0xaaddff, 0.4);

        // Draw cilia around the perimeter
        for (let i = 0; i < this.ciliaCount; i++) {
            const t = i / this.ciliaCount;
            const angle = t * Math.PI * 2;

            // Ellipse perimeter point
            const rx = 42;
            const ry = 22;
            const px = Math.cos(angle) * rx;
            const py = Math.sin(angle) * ry;

            // Cilia wave animation
            const waveOffset = Math.sin(this.ciliaPhase + i * 0.8) * 0.5;
            const ciliaLength = 6 + Math.sin(this.ciliaPhase * 2 + i) * 2;

            // Outward direction with wave
            const nx = Math.cos(angle + waveOffset) * ciliaLength;
            const ny = Math.sin(angle + waveOffset) * ciliaLength;

            this.ciliaGraphics.moveTo(px, py);
            this.ciliaGraphics.lineTo(px + nx, py + ny);
        }
    }

    update(delta, bounds, lightIntensity, entities) {
        // Animate cilia
        this.ciliaPhase += 0.15 * delta * (this.speed + 0.5);
        this.drawCilia();

        // AI: Find nearest food (bacteria)
        let nearestFood = null;
        let minDist = 200; // Visualization range

        // Simple search (optimization: use a grid/quadtree in future)
        if (entities) {
            for (const e of entities) {
                if (e.type === 'bacteria') {
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

        // State Machine Behavior
        if (nearestFood) {
            // Chase
            const desiredAngle = Math.atan2(nearestFood.y - this.y, nearestFood.x - this.x);
            // Smoothly turn towards desired angle
            let diff = desiredAngle - this.angle;
            // Normalize angle to -PI to PI
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            this.angle += diff * 0.05 * delta;
            this.speed = 1.5 + Math.random() * 0.5; // Sprint
        } else {
            // Wander
            this.angle += (Math.sin(Date.now() * 0.002 + this.x * 0.01) * 0.03);
            this.speed = 0.8 + Math.random() * 0.3; // Cruise
        }

        // Apply velocity from external forces (like push interaction)
        this.vx *= 0.95;
        this.vy *= 0.95;

        this.x += Math.cos(this.angle) * this.speed * delta + this.vx * delta;
        this.y += Math.sin(this.angle) * this.speed * delta + this.vy * delta;

        // Screen wrap
        if (this.x < -50) this.x = bounds.width + 50;
        if (this.x > bounds.width + 50) this.x = -50;
        if (this.y < -50) this.y = bounds.height + 50;
        if (this.y > bounds.height + 50) this.y = -50;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;
        this.graphics.rotation = this.angle;

        // Animate vacuoles (contractile - pulsing like pumping water)
        this.vacuoles.forEach((vacuole, i) => {
            vacuole.phase += 0.08 * delta;
            const pulse = 0.6 + Math.abs(Math.sin(vacuole.phase)) * 0.6;
            vacuole.graphics.scale.set(pulse);
        });

        // Return nearest food if we "ate" it (collision)
        if (nearestFood && minDist < 20) {
            return nearestFood;
        }
        return null;
    }
}

