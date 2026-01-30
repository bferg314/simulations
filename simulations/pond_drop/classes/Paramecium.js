export class Paramecium {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 1 + Math.random();
        this.type = 'paramecium';

        // Graphics container
        this.graphics = new PIXI.Container();

        // Body
        this.body = new PIXI.Graphics();
        this.drawBody();
        this.graphics.addChild(this.body);

        // Internal vacuoles (simple circles for now)
        this.vacuoles = [];
        for (let i = 0; i < 2; i++) {
            const v = new PIXI.Graphics();
            v.beginFill(0xFFFFFF, 0.2);
            v.drawCircle(0, 0, 8);
            v.endFill();
            v.x = (i === 0 ? -15 : 15);
            this.graphics.addChild(v);
            this.vacuoles.push(v);
        }

        this.graphics.x = x;
        this.graphics.y = y;
        this.graphics.rotation = this.angle;

        // Cilia animation
        this.ciliaPhase = 0;
    }

    drawBody() {
        this.body.clear();
        this.body.lineStyle(2, 0x88ccff, 0.3);
        this.body.beginFill(0x88ccff, 0.1);
        // Oval shape
        this.body.drawEllipse(0, 0, 40, 20);
        this.body.endFill();

        // Cilia using simple dashed line or just texture? 
        // For procedural, let's draw many small lines around the perimeter in update() or just once?
        // Let's just draw a fuzzy stroke for MVP
        this.body.lineStyle(4, 0x88ccff, 0.1);
        this.body.drawEllipse(0, 0, 42, 22);
    }

    update(delta, bounds, lightIntensity, entities) {
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
            this.speed = 1.5 + Math.random(); // Sprint
        } else {
            // Wander
            this.angle += (Math.sin(Date.now() * 0.002) * 0.05);
            this.speed = 0.8 + Math.random() * 0.5; // Cruise
        }

        this.x += Math.cos(this.angle) * this.speed * delta;
        this.y += Math.sin(this.angle) * this.speed * delta;

        // Screen wrap
        if (this.x < -50) this.x = bounds.width + 50;
        if (this.x > bounds.width + 50) this.x = -50;
        if (this.y < -50) this.y = bounds.height + 50;
        if (this.y > bounds.height + 50) this.y = -50;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;
        this.graphics.rotation = this.angle;

        // Animate vacuoles (pulsing)
        this.vacuoles.forEach((v, i) => {
            v.scale.set(0.8 + Math.sin(Date.now() * 0.005 + i) * 0.2);
        });

        // Return nearest food if we "ate" it (collision)
        if (nearestFood && minDist < 15) {
            return nearestFood;
        }
        return null;
    }
}
