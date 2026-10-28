// Fixed-timestep clock shared by the simulations.
//
// Simulation logic advances in whole steps of 1/60 s however fast the display
// refreshes, so a 144 Hz monitor runs the same simulation as a 60 Hz one, just
// drawn more often. Most of these sims were written assuming one update per
// frame at 60 fps; calling that update once per step keeps their behaviour
// exactly as tuned.
//
//   const clock = new FixedClock();
//   function animate(now) {
//       requestAnimationFrame(animate);
//       const steps = clock.frame(now);
//       for (let i = 0; i < steps; i++) update(clock.step);
//       render();
//   }

export class FixedClock {
    constructor({ hz = 60, maxSteps = 4, maxFrame = 0.25 } = {}) {
        this.step = 1 / hz;        // seconds of simulation per step
        this.maxSteps = maxSteps;  // per frame at speed 1; beyond this we drop time rather than spiral
        this.maxFrame = maxFrame;  // longest real gap counted, in seconds
        this.speed = 1;
        this.paused = false;
        this.time = 0;             // simulated seconds elapsed
        this.realDelta = 0;        // real seconds since the previous frame, clamped
        this.accumulator = 0;
        this.last = null;

        // A hidden tab stops requestAnimationFrame. Forget the last timestamp so
        // the gap isn't replayed as a burst of steps when the tab comes back.
        document.addEventListener('visibilitychange', () => { this.last = null; });

        this.listeners = new Set();
    }

    // Call once per animation frame with the rAF timestamp. Returns how many
    // fixed steps to run this frame (0 while paused).
    frame(now = performance.now()) {
        const real = this.last === null ? 0 : Math.min((now - this.last) / 1000, this.maxFrame);
        this.last = now;
        this.realDelta = real;
        if (this.paused) return 0;

        this.accumulator += real * this.speed;
        let steps = Math.floor(this.accumulator / this.step);
        const cap = Math.ceil(this.maxSteps * this.speed);
        if (steps > cap) {
            // Too slow to keep up: run what we can and let the rest go
            steps = cap;
            this.accumulator = 0;
        } else {
            this.accumulator -= steps * this.step;
        }
        this.time += steps * this.step;
        return steps;
    }

    setPaused(paused) {
        this.paused = paused;
        this.emit();
    }

    setSpeed(speed) {
        this.speed = speed;
        this.emit();
    }

    // Notified when pause or speed changes, so controls can stay in sync
    onChange(listener) {
        this.listeners.add(listener);
    }

    emit() {
        for (const listener of this.listeners) listener(this);
    }
}
