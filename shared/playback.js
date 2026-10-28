// Pause and speed buttons for a FixedClock, plus Space to pause.
//
// For the sims without a toolbar of their own. Sits at the bottom centre in
// the same frosted pill style as the back buttons.

const STYLE = `
.playback {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 4px;
    padding: 4px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 20px;
    backdrop-filter: blur(5px);
    z-index: 100;
    font-family: 'Inter', sans-serif;
}
.playback button {
    min-width: 36px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
}
.playback button:hover { background: rgba(255, 255, 255, 0.15); color: white; }
.playback button.active { background: rgba(255, 255, 255, 0.25); color: white; }
`;

export function mountPlayback(clock, { speeds = [0.5, 1, 2] } = {}) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'playback';

    const pause = document.createElement('button');
    pause.title = 'Pause (Space)';
    pause.addEventListener('click', () => clock.setPaused(!clock.paused));
    bar.appendChild(pause);

    const speedButtons = speeds.map((speed) => {
        const btn = document.createElement('button');
        btn.textContent = speed === 0.5 ? '½×' : `${speed}×`;
        btn.title = `${speed}× speed`;
        btn.addEventListener('click', () => {
            clock.setSpeed(speed);
            clock.setPaused(false);
        });
        bar.appendChild(btn);
        return { btn, speed };
    });

    const sync = () => {
        pause.textContent = clock.paused ? '▶' : '⏸';
        pause.classList.toggle('active', clock.paused);
        for (const { btn, speed } of speedButtons) {
            btn.classList.toggle('active', !clock.paused && clock.speed === speed);
        }
    };
    clock.onChange(sync);
    sync();

    window.addEventListener('keydown', (e) => {
        if (e.code !== 'Space' || e.target.closest('input, textarea, select, button')) return;
        e.preventDefault();
        clock.setPaused(!clock.paused);
    });

    document.body.appendChild(bar);
    return bar;
}
