// SPDX-License-Identifier: GPL-3.0-only
// The engine's LFO kernel (protein-fm1/src/protein_lfo.c pfm1_lfo_step), for the LFO view.
import { LFO_SINE } from "../data/engine.js";

const f = Math.fround;
const signed16 = v => { v &= 65535; return v >= 32768 ? v - 65536 : v; };
export const SHAPE = { SINE: 0, TRIANGLE: 1, PULSE: 2, SAW_DOWN: 3, SAW_UP: 4, RANDOM: 5, SAMPLE_HOLD: 6 };

export function lfoNew() { return { value: 0, phase: 0, previous: 0, force: 0, rate: 0, modulation: 0, width: 0, shape: 0, output: 0 }; }

export function lfoStep(lfo, advance, rateModulation, randomWord) {
    const rate = f(f(lfo.rate * 127) * 64);
    const modulation = f(f(rateModulation * lfo.rate) * lfo.modulation);
    let step = Math.trunc(f(modulation * 4 + rate));
    let width = Math.trunc(f(lfo.width * 65535)), value, delta, mapped;
    if (step < 0) step = 0;
    if (step > 8191) step = 8191;
    if (width < 1) width = 1;
    width &= 65535;
    if (lfo.force) advance = 0;
    const phase = (lfo.phase + step * (advance & 65535)) & 65535;
    lfo.phase = phase;
    if (phase < width) mapped = f(f(phase * 32768) / width);
    else mapped = f(f(f(f(phase - width) * 32768) / f(65536 - width)) + 32768);
    const q = Math.trunc(mapped) & 65535;
    value = lfo.value;
    switch (lfo.shape) {
    case SHAPE.SINE: {
        const index = q >> 6;
        delta = (LFO_SINE[(index + 1) & 1023] - LFO_SINE[index]) * (q & 63);
        delta = delta >= 0 ? Math.trunc(delta / 64) : -Math.trunc((-delta + 63) / 64);
        value = signed16(LFO_SINE[index] + delta);
        break;
    }
    case SHAPE.TRIANGLE:
        value = signed16(q);
        if (value < 0) value = -value;
        value = signed16(2 * value - 32766);
        break;
    case SHAPE.PULSE: value = q < 32768 ? 32767 : -32768; break;
    case SHAPE.SAW_DOWN: value = q < 32768 ? 32767 - q : -(q & 32767); break;
    case SHAPE.SAW_UP: value = q < 32768 ? q - 32768 : q & 32767; break;
    case SHAPE.RANDOM: value = (randomWord() & 65535) - 32768; break;
    case SHAPE.SAMPLE_HOLD:
        if (lfo.force || q < lfo.previous || (q >= 32768 && lfo.previous < 32768)) value = (randomWord() & 65535) - 32768;
        break;
    default: break;
    }
    lfo.value = signed16(value);
    lfo.previous = q;
    lfo.force = 0;
    lfo.output = f(lfo.value * (1 / 32768));
}
