// SPDX-License-Identifier: GPL-3.0-only
// FX 1 and FX 2 (pages.c fx_cells, screen.c): the slot's type, then its effect's fields in the original's order
// (all of them: no second page here); the delay's times are its synced ratios while Sync is on, its Right gone
// while Link is on. The picture: the modulation effects' sweep, the drive's curve, the compressor's, the EQ's
// response, the delay's echoes, the reverb's decay.
import { P } from "../params.js";
import * as model from "../model.js";
import * as values from "../values.js";
import * as fxunits from "../fxunits.js";
import { param } from "./bindings.js";
import { cellRow } from "./cell.js";
import { drawMod, drawDriveFx, drawCompressor, drawEq, drawDelay, drawReverb, MOD } from "../views/fxviews.js";
import { setup } from "../views/canvas.js";

const v = model.value;
const idx = p => values.indexAt(p, v(p));
const TYPES = [[], ["CHDW", "CHDP", "CHSP", "CHFE", "CHCE", "CHSD", "CHSH", "CHST", "CHHI", "CHLO"],
    ["FLDW", "FLDP", "FLSP", "FLFE", "FLCE", "FLPD", "FLSH"],
    ["PHDW", "PHDP", "PHSP", "PHFE", "PHCE", "PHSD", "PHPD", "PHSH", "PHST", "PHMO"],
    ["TRDW", "TRSP", "TRPD", "TRSH", "TRSM"], ["DRDW", "DRAM", "DRGA", "DRTY"],
    ["CPRA", "CPTH", "CPIG", "CPOG", "CPAG", "CPAT", "CPRL", "CPLA"],
    ["EQDW", "EQGA", "EQLF", "EQLG", "EQMF", "EQMG", "EQMQ", "EQNF", "EQNG", "EQNQ", "EQHF", "EQHG"],
    ["DLDW", "DLDL", "DLDR", "DLLK", "DLSY", "DLFB", "DLHI", "DLLO"], ["RVDW", "RVTI", "RVCO", "RVMD", "RVMR", "RVPD"]];
const MAX = 13;
const SYNC_RATIOS = [0.125, 0.1666666716337204, 0.1875, 0.25, 0.3333333432674408, 0.375, 0.5, 0.6666666865348816,
    0.75, 1, 1.25, 1.3333333730697632, 1.5, 1.6666666269302368, 1.75, 2];   // (protein_delay.c pfm1_delay_sync_ratio)

const typeOf = slot => { const t = idx(slot ? P.FXT2 : P.FXT1); return t > 9 ? 0 : t; };

export function fxCells(slot) {               // parameter indices, null for a blank
    const synced = v(P.DLSY) > 0.5, linked = v(P.DLLK) > 0.5;
    return [slot ? P.FXT2 : P.FXT1, ...TYPES[typeOf(slot)].map(key => {
        if (key === "DLDL" && synced) return P.DLRL;
        if (key === "DLDR") return linked ? null : synced ? P.DLRR : P.DLDR;
        return P[key];
    })];
}

// the delay's times in ms (the rack's beat: 2646000 / tempo samples)
function delayTimes() {
    const beat = 2646000 / values.tempoOf(v) / 44.1, synced = v(P.DLSY) > 0.5;
    const l = synced ? SYNC_RATIOS[Math.min(idx(P.DLRL), 15)] * beat : values.delayMs(v(P.DLDL));
    const r = v(P.DLLK) > 0.5 ? l : synced ? SYNC_RATIOS[Math.min(idx(P.DLRR), 15)] * beat : values.delayMs(v(P.DLDR));
    return [l, r];
}

function draw(slot, canvas) {
    const type = typeOf(slot);
    if (type >= 1 && type <= 4) {
        const k = type - 1, sh = idx([P.CHSH, P.FLSH, P.PHSH, P.TRSH][k]);
        const shape = k === 3 ? (sh === 0 ? MOD.SINE : sh === 1 ? MOD.TRIANGLE : MOD.SQUARE) : (sh ? MOD.SINE : MOD.TRIANGLE);
        const speed = [P.CHSP, P.FLSP, P.PHSP, P.TRSP][k], phase = [P.CHSD, P.FLPD, P.PHPD, P.TRPD][k];
        drawMod(canvas, shape, fxunits.rateHz(speed, v(speed)), k ? v(phase) : 0.5 * v(phase), v([P.CHDP, P.FLDP, P.PHDP, P.TRDW][k]));
    } else if (type === 5) drawDriveFx(canvas, v(P.DRDW), v(P.DRAM), v(P.DRGA), idx(P.DRTY));
    else if (type === 6) drawCompressor(canvas, v(P.CPRA), v(P.CPTH), v(P.CPIG), v(P.CPOG), v(P.CPAG) > 0.5);
    else if (type === 7) drawEq(canvas, Array.from({ length: 12 }, (_, q) => v(P.EQDW + q)));
    else if (type === 8) drawDelay(canvas, ...delayTimes(), v(P.DLFB));
    else if (type === 9) drawReverb(canvas, fxunits.predelayMs(v(P.RVPD)), fxunits.decayMs(v(P.RVTI)));
    else setup(canvas);
}

export function initFx() {
    return [0, 1].map(slot => {
        const el = document.getElementById(`fx${slot + 1}`);
        const canvas = el.querySelector("canvas"), aside = el.querySelector(".aside"), pill = el.querySelector(".pill");
        const box = el.querySelector(".cells");
        const sources = Array.from({ length: MAX }, (_, i) => () => { const p = fxCells(slot)[i]; return p == null ? null : param(p); });
        const update = cellRow(box, sources);
        return () => {
            update();
            const n = fxCells(slot).length;
            [...box.children].forEach((c, i) => { c.hidden = i >= n; });
            draw(slot, canvas);
            const type = typeOf(slot);
            let note = values.format(slot ? P.FXT2 : P.FXT1, v(slot ? P.FXT2 : P.FXT1));
            let half = false;
            if (type === 8) {
                const [l, r] = delayTimes();
                note += ` · ${Math.trunc(l + 0.5)} / ${Math.trunc(r + 0.5)} ms`;
                half = Math.max(l, r) > 1000;    // (past the FM-1's one-second ring: its lines at half rate)
            } else if (type === 9) note += ` · ${values.format(P.RVTI, v(P.RVTI))}`;
            aside.textContent = note;
            pill.hidden = !half;
        };
    }).reduce((a, b) => () => { a(); b(); });
}
