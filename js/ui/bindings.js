// SPDX-License-Identifier: GPL-3.0-only
// What a cell edits: a parameter of the sound (the layer shown's, for a layer's), a sequencer step's field, the
// Play cell (Solo / Multi), a device setting. Each gives its name, value text, bar, list labels, and how a step
// moves it (values.js, as the device's knobs move it).
import { PARAMS, FL, P, fieldOf, STEP_FIELD, FIELDS, ccOf } from "../params.js";
import * as values from "../values.js";
import * as model from "../model.js";
import { signed } from "../values.js";

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export function noteName(pitch) {                // a step's pitch as the note it plays from C4 (seqview.c)
    const n = 60 + Math.trunc(Math.fround(pitch + 0.5)) - 48;
    return NOTE_NAMES[n % 12] + (Math.trunc(n / 12) - 1);
}

// the range a step covers: 0 for a list of names (values.c ui_accel_range)
const range = p => (PARAMS[p].steps ? (PARAMS[p].labels ? 0 : PARAMS[p].steps - 1) : (PARAMS[p].flags & FL.TEMPO) ? 380 : 127);

export function param(p, name) {
    const field = () => fieldOf(p, model.view.layer);
    return {
        key: `p${p}`,
        name: name || PARAMS[p].name,
        get: () => model.field(field()),
        set: v => model.setField(field(), v, "ui"),
        text: v => values.format(p, v),
        frac: v => values.frac(p, v),
        step: (v, d) => values.stepped(p, v, d),
        fine: (v, d) => values.fine(p, v, d),
        def: PARAMS[p].def,
        labels: PARAMS[p].labels,
        range: range(p),
        tip: () => {
            const cc = ccOf(p, model.value);
            return `${cc != null ? `CC ${cc} · ` : ""}NRPN ${field()}`;
        },
    };
}

// a sequencer step's field (the one the panel edits, or step `at`): Pitch (0..96, C4 at 48), Velo (0..127),
// Param 1 / 2 (-64..+63)
const SE_NAMES = ["Pitch", "Velo", "Param 1", "Param 2"];
const sevenbit = v => Math.max(0, Math.min(127, Math.trunc(Math.fround(Math.fround(v * 127) + 0.5))));
export function step(k, at = null) {
    const field = () => STEP_FIELD + 4 * (at ?? model.view.step) + k;
    return {
        key: `s${k}`,
        name: SE_NAMES[k],
        get: () => model.field(field()),
        set: v => model.setField(field(), v, "ui"),
        text: v => (k === 0 ? noteName(v) : k === 1 ? String(sevenbit(v)) : signed(sevenbit(v) - 64)),
        frac: v => (k === 0 ? Math.trunc(Math.trunc(v + 0.5) * 256 / 96) / 256 : Math.trunc(sevenbit(v) * 256 / 127) / 256),
        step: (v, d) => (k === 0 ? Math.max(0, Math.min(96, Math.trunc(v + 0.5) + d)) : Math.fround(Math.max(0, Math.min(127, sevenbit(v) + d)) / 127)),
        fine: null,
        def: FIELDS[STEP_FIELD + k].def,
        labels: null,
        range: k === 0 ? 96 : 127,
        tip: () => `NRPN ${field()}`,
    };
}

// LAYERS' Play: Solo (the layer shown alone) or Multi (main.c: Play turned up goes Multi, down Solo on the shown)
export function play() {
    const multi = () => model.value(P.LYMD) > 3.5;
    return {
        key: "play",
        name: "Play",
        get: () => (multi() ? 1 : 0),
        set: v => model.setParam(P.LYMD, v >= 0.5 ? 4 : model.view.layer, "ui"),
        text: v => (v >= 0.5 ? "Multi" : "Solo"),
        frac: v => (v >= 0.5 ? 1 : 0),
        step: (v, d) => (d > 0 ? 1 : d < 0 ? 0 : v),
        fine: null,
        def: 0,
        labels: ["Solo", "Multi"],
        range: 0,
        tip: () => `NRPN ${fieldOf(P.LYMD, 0)}`,
    };
}

// a device setting (SysEx 31): its number, the list's index
export function setting(p, put) {
    const tag = PARAMS[p].tag;
    return {
        key: `set-${tag}`,
        name: PARAMS[p].name,
        get: () => model.settings[tag] ?? PARAMS[p].def,
        set: v => put({ [tag]: Math.round(v) }),
        text: v => values.format(p, v),
        frac: v => values.frac(p, v),
        step: (v, d) => values.stepped(p, v, d),
        fine: null,
        def: PARAMS[p].def,
        labels: PARAMS[p].labels,
        range: 0,
        tip: () => "SysEx setting",
    };
}
