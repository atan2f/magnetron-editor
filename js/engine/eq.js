// SPDX-License-Identifier: GPL-3.0-only
// The EQ's band coefficients (protein-fm1/src/protein_eq.c: init, reset, set, bands), for the EQ view. Its state
// is the original's word record, addressed by byte offset as there.
import { EQ_INITIAL } from "../data/engine.js";
import { fxGain } from "./fxmath.js";

const f = Math.fround;
const fma = (a, b, c) => f(a * b + c);
const clip = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const power2 = e => f(Math.pow(2, e));

export function eqNew() {
    const buf = new ArrayBuffer(EQ_INITIAL.length * 4);
    const s = { u: new Uint32Array(buf), w: new Float32Array(buf) };
    s.u.set(EQ_INITIAL.map(x => x >>> 0));
    return s;
}
const g = (s, o) => s.w[o / 4];
const p = (s, o, v) => { s.w[o / 4] = v; };
const dirty = s => { s.u[0x13c / 4] = ((s.u[0x13c / 4] & ~255) | 1) >>> 0; };
const history = (s, o) => { for (let i = 0; i < 8; ++i) s.u[(o + 0x18) / 4 + i] = 0; };

function coefficients(s, o, a1, a2, b0, b1, b2) { p(s, o + 4, a1); p(s, o + 8, a2); p(s, o + 12, b0); p(s, o + 16, b1); p(s, o + 20, b2); }

function band(s, o, kind, frequency, db, q) {
    let k, square, v, root, den, minus, n, other, t, b1, a1, a2, b0, b2;
    if (db === 0) { coefficients(s, o, 0, 0, 1, 0, 0); history(s, o); return; }
    k = f(frequency * 3.141592653589793); k = f(Math.tan(k));
    square = f(k * k); v = fxGain(Math.abs(db));
    if (kind === 1) {
        const width = f(k / q);
        t = fma(k, k, -1); t = f(t + t);
        den = fma(k, k, f(width + 1)); n = fma(k, k, fma(v, width, 1));
        minus = fma(k, k, f(1 - width)); other = fma(k, k, fma(-v, width, 1));
        if (db > 0) { b0 = f(n / den); b1 = f(t / den); b2 = f(other / den); a1 = -b1; a2 = f(-minus / den); }
        else { b0 = f(den / n); b1 = f(t / n); b2 = f(minus / n); a1 = -b1; a2 = f(-other / n); }
    } else {
        root = f(v + v); root = f(Math.sqrt(root));
        den = f(fma(k, 1.4142135381698608, 1) + square);
        minus = f(square + fma(-k, 1.4142135381698608, 1)); t = f(square - 1);
        if (kind === 0) {
            const u = fma(square, v, -1);
            n = fma(square, v, fma(root, k, 1)); other = fma(square, v, fma(-root, k, 1));
            if (db > 0) { b0 = f(n / den); b1 = f(f(u + u) / den); b2 = f(other / den); a1 = f(f(t * -2) / den); a2 = f(-minus / den); }
            else { b0 = f(den / n); b1 = f(f(t + t) / n); b2 = f(minus / n); a1 = f(f(u * -2) / n); a2 = f(-other / n); }
        } else {
            const rootK = f(root * k);
            n = f(f(v + rootK) + square);
            if (db > 0) {
                const difference = f(square - v);
                b0 = f(n / den); b1 = f(f(difference + difference) / den); b2 = f(f(f(v - rootK) + square) / den);
                a1 = f(f(t * -2) / den); a2 = f(-minus / den);
            } else {
                const normalized = f(square / v);
                const rootInverse = f(Math.sqrt(f(2 / v)));
                const den2 = f(fma(rootInverse, k, 1) + normalized);
                b0 = f(den / n); b1 = f(f(t + t) / n); b2 = f(minus / n);
                a1 = f(f(f(normalized - 1) * -2) / den2);
                a2 = f(-f(fma(-rootInverse, k, 1) + normalized) / den2);
            }
        }
    }
    coefficients(s, o, a1, a2, b0, b1, b2);
}

const dbGain = (value, wet) => fma(fma(f(value - 0.5), wet, 0.5), 40, -20);

function update(s) {
    const wet = clip(f(g(s, 0xec) + g(s, 0x140))), shift = f(clip(f(g(s, 0xf4) + g(s, 0x144))) - 0.5);
    const db = f(f(f(g(s, 0xf0) - 0.5) * 40) * wet);
    let fr, q;
    p(s, 0x130, wet); p(s, 0x138, db); p(s, 0x134, fxGain(db));
    if (!(s.u[0x13c / 4] & 255)) return;
    fr = f(power2(fma(clip(f(shift + g(s, 0xfc))), 3.906890392303467, 4.906890392303467)) / 44100);
    band(s, 0xc, 0, fr, dbGain(g(s, 0x100), wet), 1);
    fr = f(power2(fma(clip(f(shift + g(s, 0x108))), 5.129283905029297, 7.643856048583984)) / 44100);
    q = power2(fma(g(s, 0x110), 7.321928024291992, -3.321928024291992));
    band(s, 0x44, 1, fr, dbGain(g(s, 0x10c), wet), q);
    fr = f(power2(fma(clip(f(shift + g(s, 0x118))), 5.129283905029297, 7.643856048583984)) / 44100);
    q = power2(fma(g(s, 0x120), 7.321928024291992, -3.321928024291992));
    band(s, 0x7c, 1, fr, dbGain(g(s, 0x11c), wet), q);
    fr = f(power2(fma(clip(f(shift + g(s, 0x128))), 3.7369632720947266, 10.55074691772461)) / 44100);
    band(s, 0xb4, 2, fr, dbGain(g(s, 0x12c), wet), 1);
    s.u[0x13c / 4] = (s.u[0x13c / 4] & ~255) >>> 0;
}

export function eqReset(s) {
    for (let i = 0; i < 4; ++i) history(s, 0xc + i * 0x38);
    p(s, 0x140, 0.5); p(s, 0x144, 0.5); s.u[0x13c / 4] = (s.u[0x13c / 4] & ~255) >>> 0;
}

const OFFSETS = [0xec, 0xf0, 0xfc, 0x100, 0x108, 0x10c, 0x110, 0x118, 0x11c, 0x120, 0x128, 0x12c];
export function eqSet(s, index, value) {           // the rack's field indices 47..58
    if (index < 47 || index > 58) return false;
    p(s, OFFSETS[index - 47], value); dirty(s);
    return true;
}

const GATES = [0xf8, 0x104, 0x114, 0x124];
// {c: [4][5] (a1, a2, b0, b1, b2), gain, enabled: band bits}
export function eqBands(s) {
    if (g(s, 0x140) !== 0) { p(s, 0x140, 0); dirty(s); }   // (the rack's: no modulation)
    if (g(s, 0x144) !== 0) { p(s, 0x144, 0); dirty(s); }
    if (s.u[0x13c / 4] & 255) update(s);
    const c = [];
    let enabled = 0;
    for (let i = 0; i < 4; ++i) {
        c.push([0, 1, 2, 3, 4].map(j => g(s, 0xc + i * 0x38 + 4 + j * 4)));
        if (g(s, GATES[i]) > 0.10000000149011612) enabled |= 1 << i;
    }
    return { c, gain: g(s, 0x134), enabled };
}
