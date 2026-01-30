export class RBC {
    constructor(x, y, textures) {
        this.x = x;
        this.y = y;
        this.baseVelocity = 0; // Calculated based on Y
        this.angle = Math.random() * Math.PI * 2;
        this.rotSpeed = 0;

        // Sprite setup
        // We might accept a texture, or draw graphics
        this.sprite = new PIXI.Graphics();
        this.drawSprite();

        this.sprite.x = x;
        this.sprite.y = y;

        // Random slight size variation
        this.scaleBase = 0.8 + Math.random() * 0.4;
        this.sprite.scale.set(this.scaleBase);
    }

    drawSprite() {
        this.sprite.clear();
        // Biconcave shape drawn as a circle with inner shading

        // Outer rim
        this.sprite.beginFill(0xB22222); // Firebrick red
        this.sprite.drawCircle(0, 0, 15);
        this.sprite.endFill();

        // Inner depression (lighter/darker depending on "lighting")
        // lighter center suggests thinness
        this.sprite.beginFill(0xCD5C5C); // IndianRed
        this.sprite.drawCircle(0, 0, 7);
        this.sprite.endFill();
    }

    update(delta, bounds, flowFactor, vesselCenter, vesselRadius, damageZones, entities) {
        // PARABOLIC FLOW PHYSICS
        // Calculate distance from center (normalized 0 to 1)
        let distFromCenter = Math.abs(this.y - vesselCenter);
        let normalizedPos = distFromCenter / vesselRadius;

        // Clamped
        if (normalizedPos > 1) normalizedPos = 1;

        // V = Vmax * (1 - r^2)
        // Add some noise so they aren't perfect lines
        let flowVelocity = 6 * (1 - (normalizedPos * normalizedPos));

        // Walls are slow but not stopped (plasma drag)
        if (flowVelocity < 0.5) flowVelocity = 0.5;

        // COLLISIONS WITH CLOTS (Platelets)
        let collisionSlowdown = 1.0;

        if (entities) {
            for (const e of entities) {
                // Only interact with clumps within a relevant X range (optimization)
                if (e.state === 'clumping' && Math.abs(e.x - this.x) < 30) {
                    const dx = this.x - e.x;
                    const dy = this.y - e.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = 22; // RBC radius 15 + Platelet radius ~7

                    if (distSq < minDist * minDist) {
                        const dist = Math.sqrt(distSq);
                        // Repel vector
                        const nx = dx / dist;
                        const ny = dy / dist;

                        // Push away
                        const push = (minDist - dist) * 0.2;
                        this.x += nx * push;
                        this.y += ny * push;

                        // Friction/Slowdown from hitting the blockage
                        collisionSlowdown = 0.1;

                        // Tumble heavily when hitting clot
                        this.rotSpeed += (Math.random() - 0.5) * 0.5;
                    }
                }
            }
        }

        // Apply global heart rate flow factor
        this.x += flowVelocity * flowFactor * delta * collisionSlowdown;

        // TUMBLING logic
        // Cells near walls tumble due to shear stress
        // Shear is derivative of velocity. High shear at walls.
        let shear = normalizedPos * 0.1; // Simple approximation
        this.rotSpeed += (shear * 0.05) * flowFactor;

        // Drag/Damping on rotation
        this.rotSpeed *= 0.95;
        this.angle += this.rotSpeed * delta;
        this.sprite.rotation = this.angle;

        // Screen wrap
        if (this.x > bounds.width + 50) {
            this.x = -50;
            // Randomize Y slightly on respawn to prevent "tracks"
            this.y = vesselCenter + (Math.random() - 0.5) * 2 * vesselRadius * 0.9;
        }

        this.sprite.x = this.x;
        this.sprite.y = this.y;

        // SQUISH effect based on speed/collision could go here
        // For now, simple stretch based on velocity
        let stretch = 1 + (flowVelocity * flowFactor * 0.05);
        this.sprite.scale.x = this.scaleBase * stretch;
        this.sprite.scale.y = this.scaleBase * (1 / stretch); // Preserve volume
    }
}
