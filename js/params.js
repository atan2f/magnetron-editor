// SPDX-License-Identifier: GPL-3.0-only
// The UI's parameters (app/ui/params.h, generated) and their patch fields: a layer's parameter has a field per
// layer (+ LAYER_STRIDE each), the effects' and the globals' one, the settings none (they go by SysEx).
import { PARAMS, FIELDS, FLAGS, LAYER_PARAMS, LAYER_STRIDE, CCMAP } from "./data/fields.js";

export { PARAMS, FIELDS, LAYER_PARAMS, LAYER_STRIDE };
export const FL = FLAGS;                       // BIPOLAR, FX, LFO_SPEED, DELAY_TIME, ...
export const P = Object.fromEntries(PARAMS.map((p, i) => [p.key, i]));
export const FIELD = Object.fromEntries(FIELDS.map((f, i) => [f.tag, i]));
export const STEP_FIELD = FIELD.Sp00;          // the sequencer's step 1: Pitch, Velo, Param 1, Param 2; then step 2 ..

export const isSetting = p => (PARAMS[p].flags & FL.SETTING) !== 0;
export const isLayerParam = p => p < LAYER_PARAMS;

export function fieldOf(p, layer) {
    const f = PARAMS[p].field;
    return Array.isArray(f) ? f[layer] : f;
}

// a field's parameter and layer (-1: not a layer's), or null (a field the UI has no parameter for: the steps' ..)
const BY_FIELD = new Map();
PARAMS.forEach((p, i) => {
    if (Array.isArray(p.field)) p.field.forEach((f, layer) => BY_FIELD.set(f, { p: i, layer }));
    else if (p.field != null) BY_FIELD.set(p.field, { p: i, layer: -1 });
});
export const paramOfField = index => BY_FIELD.get(index) || null;

// the CC that sets parameter p (ui/ccmap.c; 102 / 103 each FX slot's Dry/Wet, by the slot's type), or null
const CC_OF = new Map(Object.entries(CCMAP).map(([cc, p]) => [p, +cc]));
CC_OF.set(P.L1R, 89); CC_OF.set(P.L2R, 92);    // (a synced LFO's Speed: its ratio, on the same CC)
const DRY_WET = [null, P.CHDW, P.FLDW, P.PHDW, P.TRDW, P.DRDW, null, P.EQDW, P.DLDW, P.RVDW];
export function ccOf(p, value) {
    if (CC_OF.has(p)) return CC_OF.get(p);
    for (let slot = 0; slot < 2; ++slot) {
        const type = Math.trunc(value(slot ? P.FXT2 : P.FXT1) + 0.5);
        if (DRY_WET[type] === p) return 102 + slot;
    }
    return null;
}
