// Lookahead strike scheduler, with no DOM so it runs under `node --test`.
//
// Strike times are known in advance in pattern time, so they are put on the
// audio clock about 100 ms before they sound rather than detected per frame.
// A linear map ties the two clocks together:
//
//     audio time = a0 + (p − p0) / v
//
// where v is pattern seconds per audio second (speed × gravity rate, 0 when
// paused). Whenever v changes, or a parameter changes the strikes, queued
// strikes that haven't started are cancelled and the map is re-anchored at
// the current pattern time. `schedEnd` is the pattern time up to which every
// strike has been handed to the audio engine exactly once; cancelling pulls
// it back to the earliest cancelled strike, so nothing is dropped or doubled.

export class StrikeScheduler {
    constructor({ play, cancel, lookahead = 0.1, skipAfter = 0.25 }) {
        this.play = play;          // (event, audioTime) -> handle
        this.cancel = cancel;      // (handle) -> void
        this.lookahead = lookahead;
        this.skipAfter = skipAfter; // seconds; strikes further in the past than this are skipped
        this.source = null;
        this.a0 = 0;
        this.p0 = 0;
        this.v = 0;
        this.schedEnd = 0;
        this.pending = [];         // { event, time, handle }, in time order
    }

    audioTimeOf(p) { return this.a0 + (p - this.p0) / this.v; }
    patternAt(a) { return this.p0 + (a - this.a0) * this.v; }

    setSource(source) { this.source = source; }

    // Tie pattern time p to audio time `now`, running at v
    anchor(now, p, v) {
        this.a0 = now;
        this.p0 = p;
        this.v = v;
        // A real jump (a stalled tab, a slow frame) leaves strikes far in the
        // past: those are skipped, not played late in a burst
        if (v > 0 && this.schedEnd < p - this.skipAfter * v) this.schedEnd = p;
    }

    // Cancel every queued strike that hasn't started by `now`
    cancelFuture(now) {
        const keep = [];
        let earliest = Infinity;
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const item = this.pending[i];
            if (item.time > now) {
                this.cancel(item.handle);
                earliest = Math.min(earliest, item.event.p);
            } else {
                keep.push(item);
            }
        }
        this.pending = keep.reverse();
        if (earliest < this.schedEnd) this.schedEnd = earliest;
    }

    pause(now) {
        this.cancelFuture(now);
        this.v = 0;
    }

    // Start over from pattern time p (a release, or a new set of strikes)
    reset(now, p) {
        this.cancelFuture(now);
        this.schedEnd = p;
    }

    // Seconds the audio map leads (+) or lags (−) the given pattern time
    drift(now, p) {
        return this.v > 0 ? (this.patternAt(now) - p) / this.v : 0;
    }

    // Queue every strike up to `now + lookahead`. Returns the number queued.
    fill(now) {
        if (!(this.v > 0) || !this.source) return 0;
        const until = this.patternAt(now + this.lookahead);
        if (until <= this.schedEnd) return 0;
        const events = this.source.eventsBetween(this.schedEnd, until);
        for (const event of events) {
            const time = Math.max(this.audioTimeOf(event.p), now);
            this.pending.push({ event, time, handle: this.play(event, time) });
        }
        this.schedEnd = until;
        // Forget strikes that started long ago
        let drop = 0;
        while (drop < this.pending.length && this.pending[drop].time < now - 1) drop++;
        if (drop) this.pending.splice(0, drop);
        return events.length;
    }
}
