// SPDX-License-Identifier: GPL-3.0-only
// The LFO, effect and drive views as the device draws them: app/ui/lfoview.c, delayview.c, reverbview.c,
// eqview.c, compview.c, driveview.c, modview.c.
import { lfoNew, lfoStep } from "../engine/lfo.js";
import { eqNew, eqReset, eqSet, eqBands } from "../engine/eq.js";
import { driveChannel, driveCurveGain } from "../engine/drive.js";
import { driveRefresh } from "../engine/filter.js";
import { fxGain } from "../engine/fxmath.js";
import { setup, polyline, fillUnder, rect, text, mix, C, panelBg } from "./canvas.js";

const f = Math.fround;
const clip = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const cols = W => Math.min(Math.trunc(W), 256);

// an LFO's shape over `cycles` (the device: two seconds of it, 1 to 16 cycles), from the engine's kernel
export function drawLfo(canvas, accent, shape, cycles) {
    const { g, w, h } = setup(canvas);
    const x0 = 6, x1 = w - 6, W = x1 - x0, mid = 0.5 * h, amp = 0.5 * h - 2, columns = cols(W);
    const lfo = lfoNew();
    let seed = 12345;
    const random = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed >>> 8; };
    lfo.rate = f(f(f(65536 * cycles / columns) + 0.5) / f(127 * 64));
    lfo.width = 0.5;
    lfo.shape = Math.min(shape, 6);
    lfo.force = 1;
    rect(g, x0, Math.trunc(mid), W, 1, C.bg2);
    const xs = [], ys = [];
    for (let i = 0; i <= columns; ++i) {
        lfoStep(lfo, 1, 0, random);
        xs.push(x0 + W * i / columns); ys.push(mid - amp * lfo.output);
    }
    polyline(g, xs, ys, accent, 2);
}

// the delay's echoes for one impulse into both inputs, as the engine routes them (a ping-pong at fb^2)
export function drawDelay(canvas, leftMs, rightMs, feedback) {
    const { g, w, h } = setup(canvas);
    const GUTTER = 14, FLOOR = 0.03, MAX = 48;
    const same = 0.3 ** 4, cross = 1 - same, inject = cross * 0.5, fb = clip(feedback) ** 2;
    const queue = [{ t: 0, level: (1 - inject) + inject, right: 0 }, { t: 0, level: same, right: 1 }], out = [];
    while (queue.length && out.length < MAX) {
        let best = 0;
        for (let i = 1; i < queue.length; ++i) if (queue[i].t < queue[best].t) best = i;
        const wq = queue[best];
        queue[best] = queue[queue.length - 1]; queue.pop();
        if (wq.level < FLOOR) continue;
        const o = { t: wq.t + (wq.right ? rightMs : leftMs), level: wq.level, right: wq.right };
        out.push(o);
        if (queue.length + 2 <= MAX) {
            queue.push({ t: o.t, level: o.level * fb * same, right: o.right });
            queue.push({ t: o.t, level: o.level * fb * cross, right: o.right ? 0 : 1 });
        }
    }
    let span = Math.max(0, ...out.map(o => o.t));
    span = span > 0 ? span * 1.08 : 1;
    const px0 = 6 + GUTTER, mid = Math.trunc(h / 2), half = h / 2 - 2;
    text(g, 6, 0, "L", C.dim); text(g, 6, h, "R", C.dim, "left", "bottom");
    rect(g, px0, mid, w - 6 - px0, 1, C.bg2);
    for (const o of out) {
        const x = px0 + 2 + (w - 6 - px0 - 4) * o.t / span, level = Math.min(o.level, 1);
        const len = Math.round(half * level);
        if (len < 1) continue;
        const c = mix(panelBg, C.fx, Math.trunc(90 + 165 * level));
        if (o.right) rect(g, x, mid + 1, 2, len, c); else rect(g, x, mid - len, 2, len, c);
    }
}

// the reverb's decay: silent through the pre-delay, then -60 dB over its decay time
export function drawReverb(canvas, predelayMs, decayMs) {
    const { g, w, h } = setup(canvas);
    const x0 = 6, x1 = w - 6, W = x1 - x0, base = h - 3, H = base - 3, columns = cols(W);
    const span = (predelayMs + decayMs) * 1.05 + 1, xs = [], ys = [];
    for (let i = 0; i <= columns; ++i) {
        const t = span * i / columns;
        const level = t < predelayMs ? 0 : Math.pow(2, -9.9658 * (t - predelayMs) / decayMs);
        xs.push(x0 + W * i / columns); ys.push(base - H * level);
    }
    fillUnder(g, xs, ys, h - 2, mix(panelBg, C.fx, 72));
    polyline(g, xs, ys, C.fx, 2);
}

// the EQ's response: each band's biquad at z = e^jw, times the output gain; +-20 dB
export function drawEq(canvas, settings) {
    const { g, w, h } = setup(canvas);
    const x0 = 6, x1 = w - 6, W = x1 - x0, top = 3, H = h - 6, zeroY = top + H * 0.5, columns = cols(W), RANGE = 20;
    const eq = eqNew();
    eqReset(eq);
    settings.forEach((v, i) => eqSet(eq, 47 + i, v));
    const { c, gain, enabled } = eqBands(eq);
    const xs = [], ys = [];
    for (let i = 0; i <= columns; ++i) {
        const x = i / columns, fr = 20 * Math.pow(1000, x), wv = 2 * Math.PI * fr / 44100;
        const c1 = Math.cos(wv), s1 = Math.sin(wv), c2 = Math.cos(2 * wv), s2 = Math.sin(2 * wv);
        let mag2 = gain * gain;
        for (let k = 0; k < 4; ++k) {
            if (!((enabled >> k) & 1)) continue;
            const b = c[k];
            const nr = b[2] + b[3] * c1 + b[4] * c2, ni = -(b[3] * s1 + b[4] * s2);
            const dr = 1 - b[0] * c1 - b[1] * c2, di = b[0] * s1 + b[1] * s2;
            mag2 *= (nr * nr + ni * ni) / (dr * dr + di * di);
        }
        let db = mag2 > 1e-12 ? 10 * Math.log10(mag2) : -RANGE;
        db = Math.max(-RANGE, Math.min(RANGE, db));
        xs.push(x0 + W * x); ys.push(zeroY - H * 0.5 * db / RANGE);
    }
    rect(g, x0, Math.trunc(zeroY), W, 1, C.bg2);
    polyline(g, xs, ys, C.fx, 2);
}

// the compressor's static curve, in over out, -60 .. 0 dB, in a square
export function drawCompressor(canvas, ratio, threshold, inGain, outGain, autoGain) {
    const { g, w: cw, h } = setup(canvas);
    const side = h - 4, x0 = Math.trunc((cw - side) / 2), y0 = 2, x1 = x0 + side, y1 = y0 + side, LOW = -60;
    const r = clip(ratio) ** 3 * 99 + 1, thr = (1 - clip(threshold)) * -50;
    const gin = clip(inGain) * 60 - 30, gout = clip(outGain) * 60 - 30;
    const makeup = autoGain ? 20 * Math.log10(0.8 * fxGain(thr / r - thr)) : 0;
    g.beginPath(); g.moveTo(x0, y1); g.lineTo(x1, y0); g.strokeStyle = `rgb(${C.bg2})`; g.lineWidth = 1; g.stroke();
    const xs = [], ys = [];
    for (let i = 0; i <= side; ++i) {
        const x = LOW * (1 - i / side) + gin;
        let out = x > thr ? thr + (x - thr) / r : x;
        out = Math.max(LOW, Math.min(0, out + makeup + gout));
        xs.push(x0 + i); ys.push(y0 + side * out / LOW);
    }
    polyline(g, xs, ys, C.fx, 2);
}

// a drive curve from the engine's shaper: a steady input per column, scaled so its peak fills the box
function driveCurve(canvas, accent, curveGain, amount, curve, reach, gain, wet, dry) {
    const { g, w, h } = setup(canvas);
    const x0 = 6, x1 = w - 6, W = x1 - x0, top = 3, H = h - 2 - top, columns = cols(W), out = [];
    rect(g, x0, Math.trunc(h / 2), W, 1, C.bg2);
    rect(g, x0 + Math.trunc(W / 2), 0, 1, h, C.bg2);
    let peak = 0;
    for (let i = 0; i <= columns; ++i) {
        const x = f(reach * f(-1 + f(2 * i / columns)));
        const samples = new Array(16).fill(x);
        driveChannel({ gain: curveGain, amount, previous: x, curve: Math.min(curve, 4) }, samples);
        out.push(wet * gain * samples[15] + dry * x);
        peak = Math.max(peak, Math.abs(out[i]));
    }
    const xs = out.map((_, i) => x0 + W * i / columns), ys = out.map(o => top + H * (1 - (peak > 0 ? o / peak : 0)) * 0.5);
    polyline(g, xs, ys, accent, 2);
}

export function drawFilterDrive(canvas, accent, cutoff, curve) {
    const { amount } = driveRefresh(clip(cutoff));
    driveCurve(canvas, accent, driveCurveGain(curve), amount, curve, 2 * 128 / 5120, 1, 1, 0);
}

export function drawDriveFx(canvas, dryWet, amount, gain, curve) {
    const a = clip(amount), wv = clip(dryWet), d = 1 - wv, gn = clip(gain);
    driveCurve(canvas, C.fx, f(0.2), f(a * a), curve, 1, fxGain(gn * 40 - 20), 2 * wv - wv * wv, 2 * d - d * d);
}

// the modulation effects' sweep: left full, right at its phase offset, dimmer
export const MOD = { TRIANGLE: 0, SINE: 1, SQUARE: 2 };
function wave(shape, t) {
    t -= Math.floor(t);
    if (shape === MOD.SINE) return Math.cos(2 * Math.PI * t - Math.PI / 2);
    if (shape === MOD.SQUARE) return t < 0.5 ? 1 : -1;
    return 1 - 4 * Math.abs(t - 0.5);
}
export function drawMod(canvas, shape, hz, phase, depth) {
    const { g, w, h } = setup(canvas);
    const GUTTER = 14, px0 = 6 + GUTTER, W = w - 6 - px0, mid = h / 2, columns = cols(W);
    const cycles = Math.max(1, Math.min(16, hz * 2)), d = Math.max(0.05, Math.min(1, depth)), amp = (h / 2 - 2) * d;
    rect(g, px0, Math.trunc(mid), W, 1, C.bg2);
    text(g, 6, 0, "L", C.fx); text(g, 6, 14, "R", C.dim);
    const line = (ph, colour) => {
        const xs = [], ys = [];
        for (let i = 0; i <= columns; ++i) { const x = i / columns; xs.push(px0 + W * x); ys.push(mid - amp * wave(shape, x * cycles + ph)); }
        polyline(g, xs, ys, colour, 2);
    };
    line(phase, mix(panelBg, C.fx, 120));
    line(0, C.fx);
}
