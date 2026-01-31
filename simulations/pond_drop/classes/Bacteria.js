export class Bacteria {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.type = 'bacteria';
        this.color = 0xFFFFFF; // For particle burst color

        // Randomized properties - must be set BEFORE draw()
        this.size = 2 + Math.random() * 2;
        this.wobbleSpeed = 0.05 + Math.random() * 0.05;
        this.phase = Math.random() * Math.PI * 2;

        // Graphics
        this.graphics = new PIXI.Graphics();
        this.draw();

        this.graphics.x = x;
        this.graphics.y = y;
    }

    draw() {
        this.graphics.clear();
        this.graphics.beginFill(0xFFFFFF, 0.5); // Translucent white
        this.graphics.drawCircle(0, 0, this.size);
        this.graphics.endFill();
    }

    update(delta, bounds) {
        // Brownian motion
        this.vx += (Math.random() - 0.5) * 0.1;
        this.vy += (Math.random() - 0.5) * 0.1;

        // Dampen
        this.vx *= 0.95;
        this.vy *= 0.95;

        // Move
        this.x += this.vx * delta;
        this.y += this.vy * delta;

        // Screen wrap
        if (this.x < 0) this.x = bounds.width;
        if (this.x > bounds.width) this.x = 0;
        if (this.y < 0) this.y = bounds.height;
        if (this.y > bounds.height) this.y = 0;

        // Update graphics
        this.graphics.x = this.x;
        this.graphics.y = this.y;

        // Subtle pulse or wobble can be added here
        this.phase += this.wobbleSpeed * delta;
        const scale = 1 + Math.sin(this.phase) * 0.1;
        this.graphics.scale.set(scale);
    }
}
