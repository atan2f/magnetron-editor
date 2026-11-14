// SPDX-License-Identifier: GPL-3.0-only
// Drawing helpers for the views (the device's gfx: lines, fills under a curve, rects, colour mixes), on a canvas
// at the screen's pixel ratio. Colours are the device's (app/ui/theme.h), as [r, g, b].
export const C = {
    bg: [11, 20, 46], bg2: [17, 30, 66], line: [150, 170, 205], dim: [95, 115, 155], text: [226, 233, 245],
    red: [240, 72, 72], osc: [96, 170, 255], env: [110, 220, 170], filt: [255, 176, 80], lfo1: [176, 124, 255],
    lfo2: [184, 224, 80], mat: [255, 120, 190], fx: [255, 128, 96], voice: [120, 210, 230], glo: [200, 205, 220],
    seq: [250, 220, 90], browse: [240, 210, 120], live: [110, 220, 170],
};
export const panelBg = [14, 25, 56];                 // (the editor's panels sit a shade off the ground)

export const mix = (a, b, t) => a.map((x, i) => x + Math.round((b[i] - x) * t / 256));   // gfx_mix: t of 256
export const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
export const FONT = '11px Lexend, "Segoe UI", system-ui, sans-serif';

export function setup(canvas) {
    const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * k) || canvas.height !== Math.round(h * k)) {
        canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    }
    const g = canvas.getContext("2d");
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineJoin = "round"; g.lineCap = "round";
    return { g, w, h };
}

export function polyline(g, xs, ys, colour, width = 2) {
    g.beginPath();
    xs.forEach((x, i) => (i ? g.lineTo(x, ys[i]) : g.moveTo(x, ys[i])));
    g.strokeStyle = css(colour); g.lineWidth = width; g.stroke();
}

export function fillUnder(g, xs, ys, bottom, colour) {
    g.beginPath();
    g.moveTo(xs[0], bottom);
    xs.forEach((x, i) => g.lineTo(x, ys[i]));
    g.lineTo(xs[xs.length - 1], bottom);
    g.closePath();
    g.fillStyle = css(colour); g.fill();
}

export function rect(g, x, y, w, h, colour) { g.fillStyle = css(colour); g.fillRect(x, y, w, h); }

export function text(g, x, y, s, colour, align = "left", baseline = "top") {
    g.font = FONT; g.fillStyle = css(colour); g.textAlign = align; g.textBaseline = baseline;
    g.fillText(s, x, y);
}
