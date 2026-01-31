export class Detritus {
    constructor(x, y, size = null) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.1;
        this.vy = Math.random() * 0.2; // Sinks slowly
        this.type = 'detritus';
        this.color = 0x886644;

        this.size = size || (2 + Math.random() * 3);
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.02;
        this.life = 300 + Math.random() * 200; // Decomposes over time
        this.nutrients = this.size * 2;

        // Graphics
        this.graphics = new PIXI.Graphics();
        this.draw();

        this.graphics.x = x;
        this.graphics.y = y;
    }

    draw() {
        this.graphics.clear();

        // Irregular organic matter shape
        this.graphics.beginFill(0x665533, 0.6);
        this.graphics.lineStyle(0.5, 0x554422, 0.4);

        // Random blobby shape
        const points = 5 + Math.floor(Math.random() * 3);
        const angleStep = (Math.PI * 2) / points;

        for (let i = 0; i < points; i++) {
            const angle = i * angleStep + (Math.random() - 0.5) * 0.3;
            const radius = this.size * (0.7 + Math.random() * 0.6);
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            if (i === 0) {
                this.graphics.moveTo(x, y);
            } else {
                this.graphics.lineTo(x, y);
            }
        }
        this.graphics.closePath();
        this.graphics.endFill();
    }

    update(delta, bounds, lightIntensity, entities) {
        // Slow sinking and drifting
        this.vy += 0.001 * delta; // Gravity
        this.vy = Math.min(0.3, this.vy);

        this.vx *= 0.99;
        this.vy *= 0.99;

        this.x += this.vx * delta;
        this.y += this.vy * delta;

        this.rotation += this.rotSpeed * delta;

        // Decompose over time
        this.life -= delta;

        // Screen wrap horizontal, but sink through bottom reappears at top
        if (this.x < -10) this.x = bounds.width + 10;
        if (this.x > bounds.width + 10) this.x = -10;
        if (this.y > bounds.height + 10) this.y = -10;
        if (this.y < -10) this.y = bounds.height + 10;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;
        this.graphics.rotation = this.rotation;
        this.graphics.alpha = Math.min(1, this.life / 100);

        // Return self if decomposed (to be removed)
        if (this.life <= 0) {
            return 'decomposed';
        }

        return null;
    }
}
