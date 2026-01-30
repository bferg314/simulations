export class Algae {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.05;
        this.vy = (Math.random() - 0.5) * 0.05; // Very slow drift
        this.type = 'algae';

        // Single cell or cluster? Let's do a small cluster of 3-5 cells
        this.graphics = new PIXI.Container();
        this.cells = [];

        const cellCount = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < cellCount; i++) {
            const cell = new PIXI.Graphics();
            const r = 3 + Math.random() * 3;
            const cx = (Math.random() - 0.5) * 10;
            const cy = (Math.random() - 0.5) * 10;

            cell.beginFill(0x44aa44, 0.8);
            cell.drawCircle(cx, cy, r);
            cell.endFill();

            // Chloroplast detail
            cell.beginFill(0x226622, 0.5);
            cell.drawCircle(cx + r * 0.3, cy - r * 0.3, r * 0.4);
            cell.endFill();

            this.graphics.addChild(cell);
            this.cells.push({ g: cell, baseAlpha: 0.8 });
        }

        this.graphics.x = x;
        this.graphics.y = y;
        this.graphics.rotation = Math.random() * Math.PI * 2;
    }

    update(delta, bounds, lightIntensity) {
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.graphics.rotation += 0.001 * delta;

        // Screen wrap
        if (this.x < -20) this.x = bounds.width + 20;
        if (this.x > bounds.width + 20) this.x = -20;
        if (this.y < -20) this.y = bounds.height + 20;
        if (this.y > bounds.height + 20) this.y = -20;

        this.graphics.x = this.x;
        this.graphics.y = this.y;

        // Light reaction: Algae glow/bubble when light is high
        // Use lightIntensity (0.0 to 1.5) to modulate brightness or scale
        // For now, just modulation of alpha or color could work, but PIXI filters are heavy.
        // Let's just pulsate slightly if light is high (photosynthesis active)
        if (lightIntensity > 0.8) {
            const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.05 * (lightIntensity - 0.8);
            this.graphics.scale.set(pulse);
        } else {
            this.graphics.scale.set(1);
        }
    }
}
