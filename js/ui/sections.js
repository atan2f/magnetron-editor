// SPDX-License-Identifier: GPL-3.0-only
// The layer's sections, as the device's pages (app/ui/pages.c, screen.c): OSC 1 / 2, WAVE ENV, FILTER, FILT ENV,
// AMP ENV, LFO, VOICE, each with its picture and its cells for the layer shown.
import { P } from "../params.js";
import * as model from "../model.js";
import * as values from "../values.js";
import { param } from "./bindings.js";
import { cellRow } from "./cell.js";
import { drawWaterfall } from "../views/waterfall.js";
import { tableAt } from "../tables.js";
import { drawEnvelope } from "../views/envelope.js";
import { drawFilter } from "../views/filter.js";
import { drawLfo, drawFilterDrive } from "../views/fxviews.js";
import { C } from "../views/canvas.js";

const v = model.value;
const idx = key => values.indexAt(P[key], v(P[key]));
const cell = (key, name) => () => param(P[key], name);
const fmt = key => values.format(P[key], v(P[key]));

function section(id) {
    const el = document.getElementById(id);
    return { el, canvas: el.querySelector("canvas"), cells: el.querySelector(".cells"), aside: el.querySelector(".aside") };
}

export function initSections() {
    const renders = [];

    for (const k of [1, 2]) {                    // the oscillators: the wavetable, the position's frame red
        const s = section(`osc${k}`);
        const update = cellRow(s.cells, ["T", "P"].map(x => cell(`W${k}${x}`)).concat(
            ["S", "D", "K", "V"].map(x => cell(`O${k}${x}`)), [cell(`W${k}L`), cell(`W${k}E`)]));
        renders.push(() => {
            update();
            const table = tableAt(values.indexAt(P[`W${k}T`], v(P[`W${k}T`])), model.device.connected);
            drawWaterfall(s.canvas, table && table.halves, Math.trunc(v(P[`W${k}P`]) + 0.5) & 63);
            s.aside.textContent = table ? table.name : "";
        });
    }

    const envelope = (id, keys, accent, cells) => {   // an envelope page: its top row A D S R
        const s = section(id);
        const update = cellRow(s.cells, cells);
        renders.push(() => { update(); drawEnvelope(s.canvas, accent, ...keys.map(k => v(P[k]))); });
    };
    envelope("wenv", ["WEA", "WED", "WES", "WER"], C.osc, [cell("WEA"), cell("WED"), cell("WES"), cell("WER"),
        cell("W1E", "W1 Amt"), cell("W1V", "W1 Velo"), cell("W2E", "W2 Amt"), cell("W2V", "W2 Velo")]);
    envelope("fenv", ["FEA", "FED", "FES", "FER"], C.filt, ["FEA", "FED", "FES", "FER", "FCE", "FVE"].map(k => cell(k)));
    envelope("aenv", ["AEA", "AED", "AES", "AER"], C.env, ["AEA", "AED", "AES", "AER", "AVE"].map(k => cell(k)));

    {                                            // the filter's response, or in Drive mode its curve
        const s = section("filt");
        const drive = () => idx("FTY") === 4;     // (Drive mode: Reso's cell is the drive type)
        const update = cellRow(s.cells, [cell("FCU"), () => param(drive() ? P.DRT : P.FRE), cell("FTY"), cell("FKT"),
            cell("FCE"), cell("FVE")]);
        renders.push(() => {
            update();
            if (drive()) drawFilterDrive(s.canvas, C.filt, v(P.FCU), idx("DRT"));
            else drawFilter(s.canvas, C.filt, v(P.FCU), v(P.FRE), idx("FTY"));
            s.aside.textContent = drive() ? `${fmt("FTY")} · ${fmt("DRT")}` : fmt("FTY");
        });
    }

    {                                            // the LFOs: each its shape over two seconds (1 to 16 cycles)
        const s = section("lfo");
        const lanes = [...s.el.querySelectorAll(".lane")];
        const speed = k => () => {               // (clocked: its ratio, as the page shows)
            const synced = values.indexAt(P[`L${k}C`], v(P[`L${k}C`]));
            return param(P[synced ? `L${k}R` : `L${k}P`]);
        };
        const update = cellRow(s.cells, [cell("L1H"), speed(1), cell("L1C"), cell("L1Y"), cell("L2H"), speed(2), cell("L2C"), cell("L2Y")]);
        renders.push(() => {
            update();
            lanes.forEach((lane, k) => {
                const hz = values.lfoHz(k, v, values.tempoOf(v));
                const cycles = Math.max(1, Math.min(16, hz * 2));
                drawLfo(lane.querySelector("canvas"), k ? C.lfo2 : C.lfo1, idx(k ? "L2H" : "L1H"), cycles);
                const ratio = values.indexAt(P[`L${k + 1}C`], v(P[`L${k + 1}C`])) ? `L${k + 1}R` : `L${k + 1}P`;
                lane.querySelector(".name").textContent = `LFO ${k + 1}   ${fmt(k ? "L2Y" : "L1Y")}   ${fmt(ratio)}`;
            });
        });
    }

    {                                            // VOICE: how it plays, the bend, the dirt, what Flavour does
        const s = section("voice");
        const facts = s.el.querySelectorAll(".fact b");
        const update = cellRow(s.cells, ["GLI", "GLM", "PLM", "PBR", "DTY", "NSV", "FLAV", "TBPM"].map(k => cell(k)));
        renders.push(() => {
            update();
            let plays = idx("PLM") === 0 ? "Poly, 8 voices" : fmt("PLM");
            if (v(P.GLI) > 0) plays += `, glide ${fmt("GLI")}`;
            const fl = v(P.FLAV);
            facts[0].textContent = plays;
            facts[1].textContent = `+/- ${fmt("PBR")} semitones`;
            facts[2].textContent = v(P.NSV) <= 0 ? "Off" : `${fmt("DTY")}, ${fmt("NSV")}`;
            facts[3].textContent = fl <= 0 ? "Off" : fl <= 0.25 ? "Per-note drift" : fl < 0.5 ? "Drift, clock jitter" : "Drift, jitter, steps";
            facts[3].classList.toggle("off", fl <= 0);
        });
    }

    return () => renders.forEach(r => r());
}
