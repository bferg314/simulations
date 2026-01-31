export class Hydra {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.type = 'hydra';
        this.color = 0xaaddaa;

        this.size = 40 + Math.random() * 15;
        this.numTentacles = 5 + Math.floor(Math.random() * 3);
        this.tentacles = [];
        this.energy = 60;
        this.maxEnergy = 100;
        this.attached = true; // Usually stationary
        this.contractPhase = 0;
        this.isContracting = false;
        this.contractTimer = 0;

        // Initialize tentacles
        for (let i = 0; i < this.numTentacles; i++) {
            this.tentacles.push({
                baseAngle: -Math.PI / 2 + (i - (this.numTentacles - 1) / 2) * 0.4,
                segments: 6 + Math.floor(Math.random() * 3),
                phase: Math.random() * Math.PI * 2,
                speed: 0.03 + Math.random() * 0.02,
                length: 0.8 + Math.random() * 0.4
            });
        }

        // Graphics
        this.graphics = new PIXI.Container();
        this.body = new PIXI.Graphics();
        this.tentacleGraphics = new PIXI.Graphics();

        this.graphics.addChild(this.tentacleGraphics);
        this.graphics.addChild(this.body);

        this.drawBody();

        this.graphics.x = x;
        this.graphics.y = y;
    }

    drawBody() {
        this.body.clear();

        // Stalk/body - elongated tube shape
        const contractScale = this.isContracting ? 0.5 + Math.cos(this.contractPhase) * 0.3 : 1;

        this.body.beginFill(0x88bb88, 0.6);
        this.body.lineStyle(1.5, 0x99cc99, 0.7);

        // Body (elongated oval/tube)
        const bodyHeight = this.size * 0.6 * contractScale;
        const bodyWidth = this.size * 0.15;

        this.body.moveTo(0, 0);
        this.body.bezierCurveTo(
            bodyWidth, bodyHeight * 0.3,
            bodyWidth, bodyHeight * 0.7,
            0, bodyHeight
        );
        this.body.bezierCurveTo(
            -bodyWidth, bodyHeight * 0.7,
            -bodyWidth, bodyHeight * 0.3,
            0, 0
        );
        this.body.endFill();

        // Foot/base (for attachment)
        this.body.beginFill(0x77aa77, 0.7);
        this.body.drawEllipse(0, bodyHeight, bodyWidth * 1.2, 4);
        this.body.endFill();

        // Mouth/hypostome at top
        this.body.beginFill(0x99dd99, 0.5);
        this.body.drawCircle(0, -2, bodyWidth * 0.8);
        this.body.endFill();
    }

    drawTentacles(delta) {
        this.tentacleGraphics.clear();

        const contractScale = this.isContracting ? 0.3 : 1;

        for (const tentacle of this.tentacles) {
            tentacle.phase += tentacle.speed * delta;

            this.tentacleGraphics.lineStyle(2, 0xaaddaa, 0.6);

            let x = 0;
            let y = -2; // Start at mouth

            this.tentacleGraphics.moveTo(x, y);

            const segmentLength = (this.size * 0.12 * tentacle.length) * contractScale;

            for (let i = 0; i < tentacle.segments; i++) {
                const t = i / tentacle.segments;
                const wave = Math.sin(tentacle.phase + t * Math.PI * 2) * 0.3 * (1 - t * 0.5);
                const angle = tentacle.baseAngle + wave;

                x += Math.cos(angle) * segmentLength;
                y += Math.sin(angle) * segmentLength;

                this.tentacleGraphics.lineTo(x, y);
            }

            // Stinging cell (nematocyst) at tip
            this.tentacleGraphics.beginFill(0xccffcc, 0.8);
            this.tentacleGraphics.drawCircle(x, y, 2);
            this.tentacleGraphics.endFill();
        }
    }

    update(delta, bounds, lightIntensity, entities, temperature = 1) {
        // Animate tentacles
        this.drawTentacles(delta * temperature);

        // Handle contraction
        if (this.isContracting) {
            this.contractPhase += 0.1 * delta;
            this.contractTimer -= delta;
            if (this.contractTimer <= 0) {
                this.isContracting = false;
            }
            this.drawBody();
        }

        // Hunt for prey - check if anything touches tentacles
        if (entities && !this.isContracting) {
            for (const e of entities) {
                // Hydra eats bacteria, paramecia, rotifers
                if (e.type === 'bacteria' || e.type === 'paramecium' || e.type === 'rotifer' || e.type === 'euglena') {
                    const dx = e.x - this.x;
                    const dy = e.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // Check if in tentacle reach (above the hydra)
                    const inReach = dist < this.size * 0.8 && dy < 0;

                    if (inReach) {
                        // Caught prey! Contract and eat
                        this.isContracting = true;
                        this.contractTimer = 50;
                        this.contractPhase = 0;
                        this.energy = Math.min(this.maxEnergy, this.energy + 15);
                        return e;
                    }
                }
            }
        }

        // Very slow drift if not attached
        if (!this.attached) {
            this.vy += 0.001 * delta; // Sink slowly
            this.x += this.vx * delta;
            this.y += this.vy * delta;
        }

        // Screen bounds (stay on screen)
        this.x = Math.max(30, Math.min(bounds.width - 30, this.x));
        this.y = Math.max(this.size, Math.min(bounds.height - 20, this.y));

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;

        // Lose energy slowly
        this.energy -= 0.01 * delta;

        return null;
    }

    canReproduce() {
        return this.energy >= this.maxEnergy * 0.95 && Math.random() < 0.005;
    }

    reproduce() {
        this.energy = 40;
        return { x: this.x + (Math.random() - 0.5) * 50, y: this.y + 30 };
    }
}
