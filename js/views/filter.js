// SPDX-License-Identifier: GPL-3.0-only
// The filter's response from the engine's own filter (app/ui/filterview.c): one sample of the voice filter's loop,
// linear at small levels, run once per state and once for the input gives its state-space form; the response
// at z = e^jw is C (zI - A)^-1 B + D, per column, on 20 Hz .. 20 kHz and -42 .. +18 dB.
import { filterRefresh } from "../engine/filter.js";
import { setup, polyline, fillUnder, mix, panelBg } from "./canvas.js";

const TOP_DB = 18, BOTTOM_DB = -42, F_LOW = 20, F_HIGH = 20000, RATE = 44100;
const word = w => new Float32Array(new Uint32Array([w]).buffer)[0];

function mapping(highpass) {
    return { gain_scale: 2, stage_a: word(0x3f5d70a4), stage_b: word(0x3f9147ae),
        slope: word(highpass ? 0x41415555 : 0x4126aaab), bias: word(highpass ? 0 : 0x3fd55555), scale: word(0x3a18ae04) };
}

function step(c, s, x, mode, t) {
    const fb = s[0] * c.k0 + s[1] * c.k1 + s[2] * c.k2 + s[3] * c.k3;
    let v, y, m0, m1, m2, m3, e1, e2, e3, out;
    if (mode < 2) {
        v = (x - fb) * c.d; y = v * t - s[0];
        m0 = y * c.a + s[0]; e1 = m0 - s[1]; s[0] = y * c.a + m0;
        m1 = e1 * c.b + s[1]; e2 = m1 - s[2]; s[1] = e1 * c.b + m1;
        m2 = e2 * c.a + s[2]; e3 = m2 - s[3]; s[2] = e2 * c.a + m2;
        m3 = e3 * c.b + s[3];
        out = (mode === 0 ? m3 : m1) * c.gain;
        s[3] = e3 * c.b + m3;
    } else {
        v = (x + fb) * c.d; y = v * t - s[0];
        m0 = y * c.a; e1 = m0 - s[1]; s[0] = m0 * c.h0 + s[0];
        m1 = e1 * c.b; e2 = m1 - s[2]; s[1] = m1 * c.h1 + s[1];
        m2 = e2 * c.a; e3 = m2 - s[3]; s[2] = m2 * c.h0 + s[2];
        m3 = e3 * c.b;
        out = (mode === 2 ? m3 : m1) * c.gain;
        s[3] = m3 * c.h1 + s[3];
    }
    return out;
}

// |C (zI - A)^-1 B + D|^2 at z = (zr, zi), by elimination on the 4 x 4 complex system
function magnitude2(A, B, Cv, D, zr, zi) {
    const mr = [], mi = [];
    let hr = D, hi = 0;
    for (let r = 0; r < 4; ++r) {
        mr.push([...A[r].map(x => -x), B[r]]); mi.push([0, 0, 0, 0, 0]);
        mr[r][r] += zr; mi[r][r] += zi;
    }
    for (let k = 0; k < 4; ++k) {
        let pivot = k, best = mr[k][k] ** 2 + mi[k][k] ** 2;
        for (let r = k + 1; r < 4; ++r) { const n = mr[r][k] ** 2 + mi[r][k] ** 2; if (n > best) { best = n; pivot = r; } }
        if (best <= 0) return 0;
        if (pivot !== k) { [mr[k], mr[pivot]] = [mr[pivot], mr[k]]; [mi[k], mi[pivot]] = [mi[pivot], mi[k]]; }
        const ir = mr[k][k] / best, ii = -mi[k][k] / best;
        for (let r = 0; r < 4; ++r) {
            if (r === k) continue;
            const fr = mr[r][k] * ir - mi[r][k] * ii, fi = mr[r][k] * ii + mi[r][k] * ir;
            for (let j = k; j < 5; ++j) {
                const ar = mr[k][j], ai = mi[k][j];
                mr[r][j] -= fr * ar - fi * ai;
                mi[r][j] -= fr * ai + fi * ar;
            }
        }
    }
    for (let r = 0; r < 4; ++r) {
        const n = mr[r][r] ** 2 + mi[r][r] ** 2;
        hr += Cv[r] * (mr[r][4] * mr[r][r] + mi[r][4] * mi[r][r]) / n;
        hi += Cv[r] * (mi[r][4] * mr[r][r] - mr[r][4] * mi[r][r]) / n;
    }
    return hr * hr + hi * hi;
}

export function drawFilter(canvas, accent, cutoff, resonance, mode) {
    const { g, w: cw, h: ch } = setup(canvas);
    const x0 = 6, x1 = cw - 6, y0 = 2, y1 = ch - 2;
    const W = x1 - x0, base = y1 - 1, H = base - y0, columns = Math.min(Math.trunc(W), 256);
    const filtered = mode < 4;
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], B = [0, 0, 0, 0], Cv = [0, 0, 0, 0];
    let D = 0, t = 1;
    if (filtered) {
        const highpass = mode >= 2, c = {};
        filterRefresh(c, mapping(highpass), cutoff, resonance, mode);
        t = 1 / word(highpass ? 0x3f44ec4f : 0x3ede9bd4);
        for (let j = 0; j < 4; ++j) {
            const s = [0, 0, 0, 0]; s[j] = 1;
            Cv[j] = step(c, s, 0, mode, t);
            for (let i = 0; i < 4; ++i) A[i][j] = s[i];
        }
        const s = [0, 0, 0, 0];
        D = step(c, s, 1, mode, t);
        for (let i = 0; i < 4; ++i) B[i] = s[i];
    }
    const xs = [], ys = [];
    for (let i = 0; i <= columns; ++i) {
        const x = i / columns;
        let db = 0;
        if (filtered) {
            const fr = F_LOW * Math.pow(F_HIGH / F_LOW, x), w = 2 * Math.PI * fr / RATE;
            const g2 = magnitude2(A, B, Cv, D, Math.cos(w), Math.sin(w)) / (t * t);
            db = g2 > 1e-12 ? 10 * Math.log10(g2) : BOTTOM_DB;
        }
        db = Math.max(BOTTOM_DB, Math.min(TOP_DB, db));
        xs.push(x0 + W * x); ys.push(y0 + H * (TOP_DB - db) / (TOP_DB - BOTTOM_DB));
    }
    fillUnder(g, xs, ys, y1, mix(panelBg, accent, 72));
    polyline(g, xs, ys, accent, 2);
}
