export class Amoeba {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.type = 'amoeba';
        this.color = 0x99aacc;

        // Much smaller size!
        this.size = 30 + Math.random() * 10;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.3;
        this.state = 'wandering'; // wandering, hunting, engulfing
        this.target = null;
        this.engulfProgress = 0;
        this.foodEaten = 0;

        // Pseudopod animation - fewer, more controlled
        this.pseudopods = [];
        this.numPseudopods = 4 + Math.floor(Math.random() * 2);
        for (let i = 0; i < this.numPseudopods; i++) {
            this.pseudopods.push({
                baseAngle: (i / this.numPseudopods) * Math.PI * 2,
                length: 0.5 + Math.random() * 0.3,
                phase: Math.random() * Math.PI * 2,
                speed: 0.03 + Math.random() * 0.02
            });
        }

        // Graphics
        this.graphics = new PIXI.Container();
        this.body = new PIXI.Graphics();
        this.graphics.addChild(this.body);

        // Nucleus - proportional to body
        this.nucleus = new PIXI.Graphics();
        this.nucleus.beginFill(0x667799, 0.5);
        this.nucleus.drawCircle(0, 0, this.size * 0.15);
        this.nucleus.endFill();
        this.graphics.addChild(this.nucleus);

        // Food vacuoles (appear when eating)
        this.vacuoles = [];

        this.graphics.x = x;
        this.graphics.y = y;

        this.drawBody();
    }

    drawBody() {
        this.body.clear();

        // Draw blobby amoeba shape using pseudopods
        this.body.beginFill(0x8899bb, 0.25);
        this.body.lineStyle(1.5, 0x99aacc, 0.5);

        // Create blob shape from pseudopods
        const points = [];
        const resolution = 24;

        for (let i = 0; i < resolution; i++) {
            const angle = (i / resolution) * Math.PI * 2;

            // Base radius - smaller
            let radius = this.size * 0.5;

            // Add pseudopod bulges - much more constrained
            for (const pod of this.pseudopods) {
                // Use baseAngle which doesn't accumulate
                let angleDiff = angle - pod.baseAngle;
                // Normalize to -PI to PI
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                angleDiff = Math.abs(angleDiff);

                if (angleDiff < 0.6) {
                    const influence = 1 - (angleDiff / 0.6);
                    // Clamp pod.length and use smaller multiplier
                    const clampedLength = Math.max(0.3, Math.min(1.0, pod.length));
                    radius += this.size * 0.15 * clampedLength * influence * influence;
                }
            }

            points.push({
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius
            });
        }

        // Draw smooth blob
        if (points.length > 0) {
            this.body.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length; i++) {
                const curr = points[i];
                const next = points[(i + 1) % points.length];

                const cpx = curr.x;
                const cpy = curr.y;
                const epx = (curr.x + next.x) / 2;
                const epy = (curr.y + next.y) / 2;

                this.body.quadraticCurveTo(cpx, cpy, epx, epy);
            }
        }
        this.body.closePath();
        this.body.endFill();

        // Inner cytoplasm texture - smaller
        this.body.beginFill(0x7788aa, 0.15);
        this.body.drawCircle(3, -2, this.size * 0.15);
        this.body.drawCircle(-4, 3, this.size * 0.12);
        this.body.endFill();
    }

    update(delta, bounds, lightIntensity, entities) {
        // Animate pseudopods - oscillate length, not angle
        for (const pod of this.pseudopods) {
            pod.phase += pod.speed * delta;
            // Clamp length to reasonable range
            pod.length = 0.5 + Math.sin(pod.phase) * 0.3;
        }

        // Find prey (bacteria or paramecia if hungry enough)
        let nearestPrey = null;
        let minDist = 250;

        if (entities && this.state !== 'engulfing') {
            for (const e of entities) {
                // Amoeba eats bacteria, and if really hungry, even paramecia!
                if (e.type === 'bacteria' || (e.type === 'paramecium' && this.foodEaten > 5)) {
                    const dx = e.x - this.x;
                    const dy = e.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < minDist) {
                        minDist = dist;
                        nearestPrey = e;
                    }
                }
            }
        }

        // State machine
        if (this.state === 'engulfing') {
            this.engulfProgress += 0.02 * delta;
            if (this.engulfProgress >= 1) {
                this.state = 'wandering';
                this.engulfProgress = 0;
                this.target = null;
            }
        } else if (nearestPrey) {
            this.state = 'hunting';
            this.target = nearestPrey;

            // Move toward prey
            const dx = nearestPrey.x - this.x;
            const dy = nearestPrey.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0) {
                // Extend pseudopod toward prey
                const targetAngle = Math.atan2(dy, dx);

                // Find closest pseudopod and extend it
                let closestPod = this.pseudopods[0];
                let closestDiff = Math.PI * 2;
                for (const pod of this.pseudopods) {
                    let diff = Math.abs(pod.baseAngle - targetAngle);
                    if (diff > Math.PI) diff = Math.PI * 2 - diff;
                    if (diff < closestDiff) {
                        closestDiff = diff;
                        closestPod = pod;
                    }
                }
                // Clamp to 1.0 max
                closestPod.length = Math.min(1.0, closestPod.length + 0.03 * delta);

                // Slow movement toward prey
                this.vx += (dx / dist) * 0.02 * delta;
                this.vy += (dy / dist) * 0.02 * delta;
            }

            // Engulf if close enough
            const engulfDist = nearestPrey.type === 'paramecium' ? 30 : 20;
            if (dist < engulfDist) {
                this.state = 'engulfing';
                this.engulfProgress = 0;
                this.foodEaten++;

                // Add food vacuole
                const vacuole = new PIXI.Graphics();
                vacuole.beginFill(nearestPrey.color || 0xFFFFFF, 0.4);
                vacuole.drawCircle(0, 0, 5 + Math.random() * 5);
                vacuole.endFill();
                vacuole.x = (Math.random() - 0.5) * this.size * 0.3;
                vacuole.y = (Math.random() - 0.5) * this.size * 0.3;
                this.graphics.addChild(vacuole);
                this.vacuoles.push({ graphics: vacuole, life: 500 });

                return nearestPrey; // Return eaten entity
            }
        } else {
            this.state = 'wandering';
            // Random wandering
            this.vx += (Math.random() - 0.5) * 0.02 * delta;
            this.vy += (Math.random() - 0.5) * 0.02 * delta;
        }

        // Velocity limits and damping
        const maxSpeed = this.state === 'hunting' ? 0.8 : 0.4;
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > maxSpeed) {
            this.vx = (this.vx / speed) * maxSpeed;
            this.vy = (this.vy / speed) * maxSpeed;
        }
        this.vx *= 0.98;
        this.vy *= 0.98;

        this.x += this.vx * delta;
        this.y += this.vy * delta;

        // Screen wrap
        if (this.x < -this.size) this.x = bounds.width + this.size;
        if (this.x > bounds.width + this.size) this.x = -this.size;
        if (this.y < -this.size) this.y = bounds.height + this.size;
        if (this.y > bounds.height + this.size) this.y = -this.size;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;

        // Redraw body with new pseudopod positions
        this.drawBody();

        // Update and fade food vacuoles
        for (let i = this.vacuoles.length - 1; i >= 0; i--) {
            const v = this.vacuoles[i];
            v.life -= delta;
            v.graphics.alpha = v.life / 500;
            v.graphics.scale.set(v.graphics.scale.x * 0.999);

            if (v.life <= 0) {
                this.graphics.removeChild(v.graphics);
                this.vacuoles.splice(i, 1);
            }
        }

        return null;
    }
}
