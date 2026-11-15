// SPDX-License-Identifier: GPL-3.0-only
// An envelope as the device draws it (app/ui/envview.c, after nonagon's EnvelopeVisualizer): the shape spans the
// box, each stage as wide as its share of the total time (sustain a fixed 200 ms) on a square-root axis; the
// engine's times (env_times.h) and exponential curves.
import { ENV_ATTACK_MS, ENV_TAIL_MS } from "../data/fields.js";
import { setup, polyline, fillUnder, rect, text, mix, C, panelBg } from "./canvas.js";

const SUSTAIN_MS = 200, LABEL_MIN = 12, LABEL_H = 16;
const rate = v => Math.max(0, Math.min(127, Math.trunc(Math.fround(v * 127))));
const approach = (t, k) => (1 - Math.exp(-k * t)) / (1 - Math.exp(-k));

export function drawEnvelope(canvas, accent, a, d, s, r) {
    const { g, w: cw, h: ch } = setup(canvas);
    const x0 = 6, x1 = cw - 6, y0 = 2, y1 = ch - LABEL_H;
    const am = Math.sqrt(ENV_ATTACK_MS[rate(a)]), dm = Math.sqrt(ENV_TAIL_MS[rate(d)]), rm = Math.sqrt(ENV_TAIL_MS[rate(r)]);
    const sm = Math.sqrt(SUSTAIN_MS), held = s, total = am + dm + sm + rm;
    const ends = [am / total, (am + dm) / total, (am + dm + sm) / total];
    const [attackEnd, decayEnd, sustainEnd] = ends;
    const W = x1 - x0, base = y1 - 1, H = base - y0, columns = Math.min(Math.trunc(W), 256);
    const xs = [], ys = [];
    for (let i = 0; i <= columns; ++i) {
        const x = i / columns;
        let level;
        if (x <= attackEnd) level = approach(attackEnd > 0 ? x / attackEnd : 1, 4.85);
        else if (x <= decayEnd) level = 1 + (s - 1) * approach((x - attackEnd) / (decayEnd - attackEnd), 4.6);
        else if (x <= sustainEnd) level = held;
        else level = held * (1 - approach((x - sustainEnd) / (1 - sustainEnd), 4.6));
        xs.push(x0 + W * x); ys.push(base - H * level);
    }
    fillUnder(g, xs, ys, y1, mix(panelBg, accent, 72));
    for (const e of ends) rect(g, x0 + Math.trunc(W * e), y0, 1, y1 - y0, C.bg2);
    polyline(g, xs, ys, accent, 2);
    const from = [0, ...ends], to = [...ends, 1];
    ["A", "D", "S", "R"].forEach((l, i) => {
        const a0 = x0 + Math.trunc(W * from[i]), a1 = x0 + Math.trunc(W * to[i]);
        if (a1 - a0 >= LABEL_MIN) text(g, (a0 + a1) / 2, y1 + 3, l, C.dim, "center");
    });
}
