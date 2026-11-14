// SPDX-License-Identifier: GPL-3.0-only
// Scales and chords (protein-fm1/src/protein_chord.c pfm1_scale_table, pfm1_chord_notes), for the CHORDS panel.
import { SCALE_MASK, CHORD_FREE, CHORD_SCALED } from "../data/engine.js";

const mod12 = x => ((x % 12) + 12) % 12;

export function scaleTable(scale, root) {
    const r = mod12(root + 12), s = scale < 0 ? 0 : scale > 23 ? 23 : scale;
    return Array.from({ length: 12 }, (_, pc) => SCALE_MASK[s * 12 + mod12(pc - r)]);
}

const div12 = x => Math.floor(x / 12);
function snapUp(mask, v) {
    for (let k = 0; k < 12; ++k) {
        const n = v + k, pc = n - 12 * div12(n);
        if (mask[mod12(pc)]) return n;
    }
    return v;
}

export function chordNotes(mode, type, scaled, mask, root) {
    const notes = [];
    if (mode === 1) {
        const c = CHORD_FREE.slice((type < 16 ? type : 16) * 9, (type < 16 ? type : 16) * 9 + 9);
        for (let i = 0; i < (c[8] & 255); ++i) {
            let v = root + c[i];
            if (v < -128) { while (v < -128) v += 12; } else { while (v > 127) v -= 12; }
            notes.push(v & 255);
        }
    } else if (mode > 1) {
        const c = CHORD_SCALED.slice((scaled < 5 ? scaled : 5) * 9, (scaled < 5 ? scaled : 5) * 9 + 9);
        const base = snapUp(mask, root);
        for (let i = 0; i < (c[8] & 255); ++i) {
            let v = base;
            for (let n = c[i]; n > 0; --n) v = snapUp(mask, v + 1);
            notes.push(v & 255);
        }
    }
    return notes;
}
