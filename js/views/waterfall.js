// SPDX-License-Identifier: GPL-3.0-only
// A wavetable as the device draws it (app/ui/waterfall.c): every 4th of its 64 frames stacked back and right in
// perspective, the position's frame in red over them. The table is the device's own (tables.js): its 64 frames'
// half frames, or null (none yet: nothing drawn).
import { setup, polyline, fillUnder, mix, C, panelBg } from "./canvas.js";

const FRAMES = 64, POINTS = 128, HALF = 64;

// a frame's 128 samples from its 64 stored bytes: x - 128, then 127 - x mirrored
function sample(halves, frame, i) {
    const at = frame * HALF;
    return i < 64 ? halves[at + i] - 128 : 127 - halves[at + 127 - i];
}

export function drawWaterfall(canvas, halves, position, inset = 6) {
    const { g, w: cw, h: ch } = setup(canvas);
    if (!halves) return;
    const x0 = inset, x1 = cw - inset, y0 = 0, y1 = ch, W = x1 - x0, H = y1 - y0;
    const w = W * 78 / 100, depth = H * 62 / 100, amp = (H - depth) * 46 / 100;
    const base0 = y1 - amp - 4;
    for (let k = FRAMES - 1; k >= 0; --k) {
        const mark = k === position;
        if ((k & 3) && !mark) continue;
        const base = base0 - k * depth / FRAMES, left = x0 + k * (W - w) / FRAMES;
        const xs = [], ys = [];
        for (let i = 0; i < POINTS; ++i) {
            xs.push(left + i * w / (POINTS - 1));
            ys.push(base - sample(halves, k, i) * amp / 128);
        }
        fillUnder(g, xs, ys, base + amp + 2, panelBg);
        polyline(g, xs, ys, mark ? C.red : mix(C.line, panelBg, Math.trunc(k * 141 / FRAMES)), mark ? 2 : 1);
    }
}
