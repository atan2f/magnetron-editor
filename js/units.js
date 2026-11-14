// SPDX-License-Identifier: GPL-3.0-only
// Readings in units (app/ui/units.c): times, frequencies, levels, ratios, angles.
const f = Math.fround;

function fixed(v, places) {                 // v >= 0, 0..2 decimals
    const scale = places === 2 ? 100 : places === 1 ? 10 : 1, n = Math.trunc(f(f(v * scale) + 0.5));
    let s = String(Math.trunc(n / scale));
    if (places) s += "." + (places === 2 && n % 100 < 10 ? "0" : "") + String(n % scale);
    return s;
}

export function decimal(v) {
    let s = "";
    if (v < 0) { s = "-"; v = -v; }
    return s + fixed(v, v < 10 ? 2 : v < 100 ? 1 : 0);
}

export function time(ms) {                  // "120 ms", "1.25 s", "12.5 s"
    if (ms < 1000) return `${ms} ms`;
    return fixed(f(ms / 1000), ms < 10000 ? 2 : 1) + " s";
}

export function hz(v) {                     // "1.25 Hz", "450 Hz", "1.5 kHz", "15 kHz"
    if (v < 1000) return decimal(v) + " Hz";
    return fixed(f(v / 1000), v < 10000 ? 1 : 0) + " kHz";
}

export function db(v) {                     // "+3.5 dB", "-20 dB"
    const a = Math.abs(v);
    return (v < -0.05 ? "-" : v > 0.05 ? "+" : "") + fixed(a, a < 10 ? 1 : 0) + " dB";
}

export function ratio(r) { return fixed(r, r < 10 ? 1 : 0) + ":1"; }
export function degrees(d) { return `${Math.trunc(f(d + 0.5))}°`; }
