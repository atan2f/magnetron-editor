// SPDX-License-Identifier: GPL-3.0-only
// The voice filter's coefficients (protein-fm1/src/protein_voice.c pfm1_voice_filter_refresh) and the voice
// Drive's refresh, for the filter view.
const f = Math.fround;
const fma = (a, b, c) => f(a * b + c);       // (one rounding, as fmaf)
// the original's inline reciprocal: a seed from 0xbe6eb3be, one refinement (an approximation of 1 / z)
const bits = new DataView(new ArrayBuffer(4));
function reciprocal(z) {
    bits.setFloat32(0, z);
    bits.setUint32(0, ((0xbe6eb3be - bits.getUint32(0)) >>> 0) >>> 1);
    const r = bits.getFloat32(0), r2 = f(r * r);
    return f(r2 * fma(-z, r2, 2));
}

function poleFrequency(m, cutoff) {
    const e = fma(m.slope, cutoff, m.bias);
    const n = Math.floor(e), fraction = f(e - n);
    let poly = fma(fraction, 0.693147182, 1);
    poly = fma(fraction, f(fraction * 0.240226507), poly);
    return f(f(Math.pow(2, n & 63) * poly) * m.scale);   // (2^n as the original's shifted bit)
}

function lowpass(c, m, p, k) {
    const pa = f(p * m.stage_a), pb = f(p * m.stage_b);
    const ra = reciprocal(f(pa + 1)), rb = reciprocal(f(pb + 1));
    const g2 = f(pa * ra), g1 = f(pb * rb);
    const g21 = f(g2 * g1), kg1 = f(k * g1), kg21 = f(k * g21);
    c.gain = fma(k, m.gain_scale, 1);
    c.a = g2; c.b = g1;
    c.k3 = f(k * rb); c.k2 = f(kg1 * ra); c.k1 = f(rb * kg21); c.k0 = f(f(g1 * kg21) * ra);
    c.d = reciprocal(fma(g21, kg21, 1));
}

function highpass(c, m, p, k) {
    const pa = f(p * m.stage_a), pb = f(p * m.stage_b);
    const a = reciprocal(f(pa + 1)), b = reciprocal(f(pb + 1));
    const ab = f(a * b), kab = f(k * ab), k0 = f(f(ab * ab) * k);
    c.gain = fma(k, m.gain_scale, 1);
    c.h0 = f(pa + pa); c.h1 = f(pb + pb);
    c.a = a; c.b = b;
    c.k3 = f(k * b); c.k2 = kab; c.k1 = f(b * kab); c.k0 = k0;
    c.d = reciprocal(f(k0 + 1));
}

// mode: 0 LP24, 1 LP12, 2 HP24, 3 HP12
export function filterRefresh(c, m, cutoff, resonance, mode) {
    let effective = resonance;
    if (mode < 2) {
        if (mode === 1) effective = f(resonance * 0.8);
        if (0.62 < effective && 0.9 < cutoff) cutoff = 0.9;
        lowpass(c, m, poleFrequency(m, cutoff), f(effective + effective));
    } else {
        if (mode === 3) effective = f(resonance * 0.85);
        highpass(c, m, poleFrequency(m, cutoff), f(effective * 2.4));
    }
}

export function driveRefresh(cutoff) {
    const t = fma(-cutoff, 0.7, 1);
    return { amount: f(cutoff * 0.5), trim: f(t * t) };
}
