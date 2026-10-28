// Tell a click apart from a drag.
//
// Acting on pointerdown means every camera orbit and every press on a settings
// panel also plants, sprays or pushes something. onClick only fires for a
// primary-button press that started on `element` and was released close to
// where it began, shortly after.

export function onClick(element, handler, { maxMove = 6, maxTime = 500 } = {}) {
    const presses = new Map();

    element.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        presses.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    });

    element.addEventListener('pointerup', (e) => {
        const press = presses.get(e.pointerId);
        presses.delete(e.pointerId);
        if (!press) return;
        const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
        if (moved <= maxMove && performance.now() - press.t <= maxTime) handler(e);
    });

    element.addEventListener('pointercancel', (e) => presses.delete(e.pointerId));
}
