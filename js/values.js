// SPDX-License-Identifier: GPL-3.0-only
// How each parameter reads and how a step moves it (app/ui/values.c): a label, an integer, 0..127, -64..+63 for
// the centred ones, a time for an envelope stage, BPM, Hz, ms.
import { PARAMS, FL, P } from "./params.js";
import { ENV_ATTACK_MS, ENV_TAIL_MS } from "./data/fields.js";
import { CLOCK_RATIOS } from "./data/engine.js";
import * as units from "./units.js";
import * as fxunits from "./fxunits.js";

const f = Math.fround;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function indexAt(p, v) { return clamp(Math.trunc(f(v + 0.5)), 0, PARAMS[p].steps - 1); }
export function bpmAt(v) { return clamp(Math.trunc(f(f(v * 380) + 20.5)), 20, 400); }   // raw * 380 + 20
export function sevenbitAt(p, v) {
    // an envelope time as the engine indexes its rate, (int)(v * 127); others rounded
    return clamp(Math.trunc(f(f(v * 127) + ((PARAMS[p].flags & FL.ENV_TIME) ? 0 : 0.5))), 0, 127);
}

// an LFO rate in Hz as the engine runs it: rate * 127 * 64 the 16-bit phase step, every 196 samples
export function rateHz(rate) {
    const step = Math.trunc(f(f(rate * 127) * 64));
    return f(f(clamp(step, 0, 8191) / 65536) * f(44100 / 196));
}

export function delayMs(v) {                    // the delay's free time (protein_delay.c): v^2 * 88198 + 1 samples
    const a = clamp(v, 0, 1);
    return f(f(f(f(a * a) * 88198) + 1) / 44.1);
}

export function format(p, v) {
    const d = PARAMS[p];
    const unit = fxunits.format(p, v);
    if (unit !== null) return unit;
    if (d.steps && d.labels) return d.labels[indexAt(p, v)];
    if (d.steps) return String(indexAt(p, v));
    if (d.flags & FL.ENV_TIME) {
        const i = sevenbitAt(p, v);
        if ((d.flags & FL.ENV_INF) && i === 127) return "∞";
        return units.time((d.flags & FL.ENV_INF) ? ENV_TAIL_MS[i] : ENV_ATTACK_MS[i]);
    }
    if (d.flags & FL.TEMPO) return String(bpmAt(v));
    if (d.flags & FL.LFO_SPEED) { const r = clamp(v, 0, 1); return units.hz(rateHz(f(r * r))); }
    if (d.flags & FL.DELAY_TIME) return units.time(Math.trunc(f(delayMs(v) + 0.5)));
    // 0..127 (the centred ones -64..+63); between two of them with a decimal (a tenth); the centre (0.5) reads 0
    const bipolar = (d.flags & FL.BIPOLAR) !== 0, c = clamp(v, 0, 1);
    const tenths = Math.trunc(f(f(c * 1270) + 0.5));
    if (tenths % 10 === 0 || (bipolar && c === 0.5)) {
        const s = sevenbitAt(p, v);
        return bipolar ? signed(s - 64) : String(s);
    }
    const t = bipolar ? tenths - 640 : tenths, a = Math.abs(t);
    return (bipolar ? (t < 0 ? "-" : "+") : "") + Math.trunc(a / 10) + "." + (a % 10);
}

export const signed = n => (n > 0 ? "+" : "") + n;

export function frac(p, v) {                      // the bar: 0..1 (the device's 0..256 / 256)
    const d = PARAMS[p];
    if (d.steps) return d.steps > 1 ? Math.trunc(indexAt(p, v) * 256 / (d.steps - 1)) / 256 : 0;
    if (d.flags & FL.TEMPO) return Math.trunc((bpmAt(v) - 20) * 256 / 380) / 256;
    return Math.trunc(sevenbitAt(p, v) * 256 / 127) / 256;
}

export function stepped(p, from, detents) {
    const d = PARAMS[p];
    if (d.steps) return clamp(indexAt(p, from) + detents, 0, d.steps - 1);
    if (d.flags & FL.ENV_TIME) {
        const i = clamp(sevenbitAt(p, from) + detents, 0, 127);
        return i === 127 ? 1 : f((i + 0.25) / 127);       // (+0.25: the engine's truncation lands on i)
    }
    if (d.flags & FL.TEMPO) return f((clamp(bpmAt(from) + detents, 20, 400) - 20) / 380);
    // from between two 127ths: the first detent goes to the next one that way
    const x = f(clamp(from, 0, 1) * 127);
    let i = sevenbitAt(p, from);
    if (i - x > 0.02 && detents > 0) --i;
    else if (x - i > 0.02 && detents < 0) ++i;
    return f(clamp(i + detents, 0, 127) / 127);
}

// in fine steps, a tenth of a step's each: the continuous fields alone; the delay's free time by what it shows
export function fine(p, from, detents) {
    const d = PARAMS[p];
    if (d.steps || (d.flags & (FL.ENV_TIME | FL.TEMPO))) return stepped(p, from, detents);
    if (d.flags & FL.DELAY_TIME) {
        let ms = Math.trunc(f(delayMs(from) + 0.5));
        if (ms >= 1000) ms = Math.trunc((ms + 5) / 10) * 10;
        for (let k = detents; k > 0; --k) ms += ms >= 1000 ? 10 : 1;
        for (let k = detents; k < 0; ++k) ms -= ms > 1000 ? 10 : 1;
        ms = clamp(ms, 0, 2000);
        let v = f(f(f(ms * 44.1) - 1) / 88198);
        v = v > 0 ? f(Math.sqrt(v)) : 0;
        return v > 1 ? 1 : v;
    }
    return clamp(f(from + f(detents * f(1 / 1270))), 0, 1);
}

export function lfoHz(lfo, value, tempo) {      // LFO 1 / 2 (0 / 1): its speed in Hz, free or clocked to tempo
    const speed = lfo ? P.L2P : P.L1P, ratio = lfo ? P.L2R : P.L1R, clocked = lfo ? P.L2C : P.L1C;
    if (indexAt(clocked, value(clocked))) return rateHz(f(tempo * CLOCK_RATIOS[Math.min(indexAt(ratio, value(ratio)), 18)]));
    const r = clamp(value(speed), 0, 1);
    return rateHz(f(r * r));
}

export const tempoOf = value => bpmAt(value(P.TBPM));
