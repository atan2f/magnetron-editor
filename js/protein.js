// SPDX-License-Identifier: GPL-3.0-only
// The Protein's own sounds (F0 3E 2F dev 10|13 ..: tag + float fields) as Magnetron's: tools/protein_syx.py's
// reading and tools/gen_presets.py's migrate and convert, the same uniform rules as the factory presets' (an older
// format's sound as the current one, envelope times to
// Magnetron's positions, matrix routes to envelope times scaled by their stage's stretch), float for float.
import { FIELDS, FIELD } from "./params.js";

const ATTACKS = ["aea", "fea", "wea"], TAILS = ["aed", "aer", "fed", "fer", "wed", "wer"], CAP = 80;
// matrix targets (the Tgt list): wave A D R 15 16 18, filter 19 20 22, amp 23 24 26; attacks 15, 19, 23
const ATTACK_TARGETS = new Set([15, 19, 23]), TIME_TARGETS = new Set([15, 16, 18, 19, 20, 22, 23, 24, 26]);
const CATEGORIES = 19;                          // (a number past the Protein's table: Uncategorized)

const view = new DataView(new ArrayBuffer(4));
const floatOf = w => { view.setUint32(0, w); return view.getFloat32(0); };
const get5 = (m, i) => ((m[i] << 28) | (m[i + 1] << 21) | (m[i + 2] << 14) | (m[i + 3] << 7) | m[i + 4]) >>> 0;
const tagAt = (m, i) => { const w = get5(m, i); return String.fromCharCode(w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255); };
const roundEven = x => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };   // (Python's round)

function envelopePosition(v, tail) {
    const index = Math.max(0, Math.trunc(Math.fround(v * 127)));              // the original's (int)(v * 127)
    if (index > CAP) return 1;
    const position = Math.floor((index * (tail ? 126 : 127) + CAP / 2) / CAP);
    return position >= 127 ? 1 : Math.fround(Math.fround(position + 0.25) / 127);
}

const VERSION = 8;                              // the sound format of the Protein 1.03b3
const whole = v => Math.trunc(v + 0.05);        // the firmware's (int)((double)v + 0.05)

// a filter type of an older format as the current list's (LP24 LP12 HP24 HP12 Drive Bypass)
function migrateType(v, version) {
    const n = whole(v);
    if (version === 7) return n >= 0 && n <= 3 ? [0, 2, 4, 5][n] : v;   // 7's list: LP24 HP24 Drive Bypass
    if (n < 2) return n ? 2 : 0;                                         // 4..6's list: LP24 HP24 Bypass Drive
    return whole(v + 1) === 3 ? 5 : v + 1;
}

// a matrix source of format 4 or 5: two sources have since joined the list, at 12 and at 15
function migrateSource(v) {
    if (whole(v) < 12) return v;
    return whole(v + 1) < 15 ? v + 1 : v + 2;
}

// A sound of an older format as the current one, as the Protein does when it loads one from its flash (1.03b3,
// 0x420294f0): the filter type's list (formats 4..7), the matrix sources' (4, 5) and targets' (4); in place
export function migrate(words, version) {
    if (version >= VERSION) return words;
    if (version < 4) throw new Error("A Protein sound in this file is in a format too old to read.");
    for (const layer of "1234") {
        words[FIELD["fty" + layer]] = migrateType(words[FIELD["fty" + layer]], version);
        for (let route = 1; route <= 8; ++route) {
            const md = FIELD[`md${route}${layer}`], ms = FIELD[`ms${route}${layer}`];
            if (version === 4 && whole(words[md]) > 9) words[md] += 1;
            if (version <= 5) words[ms] = migrateSource(words[ms]);
        }
    }
    return words;
}

// words: a Float32Array of the 561 fields, the Protein's values; converted in place
export function convert(words) {
    for (const layer of "1234") {
        for (const stage of [...ATTACKS, ...TAILS]) {
            const i = FIELD[stage + layer];
            words[i] = envelopePosition(words[i], TAILS.includes(stage));
        }
        for (let route = 1; route <= 8; ++route) {
            const target = roundEven(words[FIELD[`md${route}${layer}`]]);
            if (!TIME_TARGETS.has(target)) continue;
            const i = FIELD[`ma${route}${layer}`];
            const gain = Math.max(-1, Math.min(1, (2 * words[i] - 1) * ((ATTACK_TARGETS.has(target) ? 127 : 126) / CAP)));
            words[i] = (gain + 1) / 2;
        }
    }
    // the steps' Param 1 / 2 at their centre: no modulation (the Protein's 0 feeds nothing there; here, the matrix: -1)
    for (let step = 0; step < 32; ++step) for (const param of "ab") words[FIELD[`S${param}${String(step).padStart(2, "0")}`]] = 0.5;
    return words;
}

export const isProtein = msg => msg.length >= 10 && msg[1] === 0x3E && msg[2] === 0x2F && (msg[4] === 0x10 || msg[4] === 0x13);

// a Protein dump being read, a message (F0 .. F7) at a time: add returns a sound when one is complete
export class ProteinReader {
    constructor() { this.sound = null; }
    add(m) {
        let at = m[4] === 0x13 ? 8 : 6;
        const total = m[at], part = m[at + 1];
        at += 2;
        let sum = 0;
        for (let i = 1; i < m.length - 2; ++i) sum += m[i];
        if ((sum & 127) !== m[m.length - 2]) throw new Error("A Protein dump in this file is damaged (its checksum).");
        if (part === 1) {
            let name = "";
            for (let i = 0; i < 24 && m[at + 2 + i]; ++i) name += String.fromCharCode(m[at + 2 + i]);
            this.sound = { name: name.trim(), category: m[at + 1] < CATEGORIES ? m[at + 1] : 0, version: m[at], words: Float32Array.from(FIELDS, f => f.def) };
            at += 26;
        } else if (!this.sound) return null;
        for (let k = at; k < m.length - 2 - 9; k += 10) {
            const f = FIELD[tagAt(m, k)];
            if (f !== undefined) this.sound.words[f] = floatOf(get5(m, k + 5));
        }
        if (part !== total) return null;
        const done = this.sound;
        this.sound = null;
        convert(migrate(done.words, done.version));
        return done;
    }
}
