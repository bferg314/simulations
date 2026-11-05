// Chime voices on the Web Audio clock.
//
// Each strike is a struck bar: four decaying sine partials at the bending-mode
// ratios of a free bar (1, 2.76, 5.40, 8.93), the upper ones quieter and
// shorter, with a soft attack so there is no click. Voices are panned by the
// pendulum's place in the row. A new strike on the same chime fades out the
// one still ringing there (as a bar re-struck would take over its own sound),
// and above 32 voices the oldest is faded out to make room.
//
// Output: voices → bus → low-pass → gentle compressor → master gain →
// soft ceiling (linear below 0.6, never above 0.89, which is −1 dBFS).
//
// Works on an OfflineAudioContext too, which tests/listen.html uses to render
// and measure a stretch of the realignment.

import { BAR_PARTIALS } from './physics.js';

const PARTIAL_GAIN = [1, 0.3, 0.11, 0.045];
const MAX_VOICES = 32;
const FADE = 0.05;        // seconds, for chokes and steals
const MAX_PARTIAL_HZ = 11000;

function ceilingCurve() {
    const n = 4096, knee = 0.6, room = 0.89 - knee;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
        const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
        curve[i] = Math.sign(x) * y;
    }
    return curve;
}

export class ChimeEngine {
    constructor(ctx, { lowpass = true } = {}) {
        this.ctx = ctx;
        this.voices = [];          // in start order
        this.lastOnChime = new Map();
        this.volume = 0.7;
        this.muted = false;

        this.bus = ctx.createGain();
        let node = this.bus;
        if (lowpass) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 9000;
            lp.Q.value = 0.5;
            node.connect(lp);
            node = lp;
        }
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.knee.value = 12;
        comp.ratio.value = 2.5;
        comp.attack.value = 0.005;
        comp.release.value = 0.25;
        node.connect(comp);
        this.master = ctx.createGain();
        this.master.gain.value = this.level();
        comp.connect(this.master);
        const ceiling = ctx.createWaveShaper();
        ceiling.curve = ceilingCurve();
        ceiling.oversample = '2x';
        this.master.connect(ceiling);
        ceiling.connect(ctx.destination);
    }

    level() {
        return this.muted ? 0 : this.volume;
    }

    setVolume(volume, muted = this.muted) {
        this.volume = volume;
        this.muted = muted;
        const g = this.master.gain, t = this.ctx.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(this.level(), t + 0.08);
    }

    // freq Hz, pan −1..1, gain linear (already scaled for velocity and density)
    strike({ time, freq, pan, gain, chime }) {
        const ctx = this.ctx;
        const t = Math.max(time, ctx.currentTime + 0.003);
        this.prune(t);

        // Lower bars ring longer
        const tau = Math.min(2.4, Math.max(0.5, 1.5 * Math.sqrt(262 / freq)));
        const length = 5 * tau;

        const out = ctx.createGain();       // fades for choke, steal and the tail
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (panner) {
            panner.pan.value = pan;
            out.connect(panner);
            panner.connect(this.bus);
        } else {
            out.connect(this.bus);
        }

        const oscs = [];
        BAR_PARTIALS.forEach((ratio, i) => {
            const f = freq * ratio;
            if (f > MAX_PARTIAL_HZ) return;
            const osc = ctx.createOscillator();
            osc.frequency.value = f;
            const env = ctx.createGain();
            const peak = gain * PARTIAL_GAIN[i];
            const attack = i === 0 ? 0.008 : 0.004;
            const decay = tau / ratio ** 0.75;
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(peak, t + attack);
            env.gain.setTargetAtTime(0, t + attack, decay);
            osc.connect(env);
            env.connect(out);
            osc.start(t);
            oscs.push(osc);
        });

        const voice = { t, end: t + length, out, panner, oscs, chime, choked: [], chokedBy: null, cancelled: false };
        this.fadeTail(voice);

        // Re-striking a chime takes over from its previous ring
        const prev = this.lastOnChime.get(chime);
        if (prev && prev.end > t && !prev.cancelled) this.fadeAt(prev, t, voice);
        this.lastOnChime.set(chime, voice);

        // Polyphony cap: fade the oldest voice still sounding at t
        const sounding = this.voices.filter((v) => v.end > t && !v.chokedBy && !v.cancelled);
        if (sounding.length >= MAX_VOICES) this.fadeAt(sounding[0], t, voice);

        this.voices.push(voice);
        oscs[0]?.addEventListener('ended', () => this.dispose(voice));
        return voice;
    }

    fadeTail(voice) {
        const g = voice.out.gain;
        g.setValueAtTime(1, voice.end - FADE);
        g.linearRampToValueAtTime(0, voice.end);
        for (const osc of voice.oscs) osc.stop(voice.end + 0.01);
    }

    // Fade `voice` out over FADE from time t, on behalf of `by`
    fadeAt(voice, t, by) {
        if (t >= voice.end - FADE) return;
        const g = voice.out.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(1, t);
        g.linearRampToValueAtTime(0, t + FADE);
        voice.realEnd = voice.end;
        voice.end = t + FADE;
        for (const osc of voice.oscs) osc.stop(voice.end + 0.01);
        voice.chokedBy = by;
        by.choked.push(voice);
    }

    // Drop a voice that hasn't started, and give back the ring it would have cut
    cancel(voice) {
        if (!voice || voice.cancelled) return;
        voice.cancelled = true;
        for (const osc of voice.oscs) {
            try { osc.stop(); } catch { /* already stopped */ }
        }
        for (const prev of voice.choked) {
            if (prev.chokedBy !== voice) continue;
            prev.chokedBy = null;
            prev.end = prev.realEnd;
            prev.out.gain.cancelScheduledValues(voice.t);
            this.fadeTail(prev);
        }
        if (this.lastOnChime.get(voice.chime) === voice) {
            const prev = voice.choked.find((v) => v.chime === voice.chime);
            if (prev) this.lastOnChime.set(voice.chime, prev);
            else this.lastOnChime.delete(voice.chime);
        }
        this.dispose(voice);
    }

    prune(t) {
        let i = 0;
        while (i < this.voices.length && this.voices[i].end < t - 0.5) i++;
        if (i) this.voices.splice(0, i);
    }

    dispose(voice) {
        voice.out.disconnect();
        voice.panner?.disconnect();
    }

    activeVoices(t = this.ctx.currentTime) {
        return this.voices.filter((v) => !v.cancelled && v.t <= t && v.end > t).length;
    }
}
