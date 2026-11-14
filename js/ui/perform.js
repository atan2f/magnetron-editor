// SPDX-License-Identifier: GPL-3.0-only
// ARP, SEQ and CHORDS (screen.c, seqview.c): each one's ON / OFF; the arp's rhythm, big; the sequence's 32 steps (a
// click picks the one the step cells edit, a drag moves a step's pitch); what a key plays with Chords on.
import { P } from "../params.js";
import * as model from "../model.js";
import * as values from "../values.js";
import { param, step, noteName } from "./bindings.js";
import { cellRow, bindControl } from "./cell.js";
import { RHYTHM_TYPE } from "../data/engine.js";
import { scaleTable, chordNotes } from "../engine/chord.js";
import { setup, rect, mix, C } from "../views/canvas.js";

const v = model.value;
const idx = key => values.indexAt(P[key], v(P[key]));
const fmt = key => values.format(P[key], v(P[key]));
const cell = key => () => param(P[key]);
const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function drawRhythm(canvas, pattern) {          // seqview_rhythm: 32 steps, played (accented every 4th), tied, rest
    const { g, w: cw, h } = setup(canvas);
    const w = Math.floor(cw / 32);
    for (let i = 0; i < 32; ++i) {
        const x = i * w, t = RHYTHM_TYPE[Math.min(pattern, 15) * 32 + i];
        if (t === 1) rect(g, x, 0, w - 2, h, i % 4 ? C.seq : mix(C.seq, [255, 255, 255], 90));
        else if (t === 2) rect(g, x - 2, Math.trunc(h / 2) - 1, w, 3, C.seq);
        else rect(g, x, h - 3, w - 2, 3, C.bg2);
    }
}

export function initPerform() {
    const renders = [];

    {   // the mode, as the device's ARP and SEQ buttons: each turns its own on (the other off) and off
        const pills = [["arp-on", 1], ["seq-on", 2]].map(([id, mode]) => {
            const b = document.getElementById(id);
            b.addEventListener("click", () => model.setParam(P.ASMD, idx("ASMD") === mode ? 0 : mode, "ui"));
            return [b, mode];
        });
        renders.push(() => pills.forEach(([b, mode]) => {
            const on = idx("ASMD") === mode;
            b.textContent = on ? "ON" : "OFF";
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", String(on));
        }));
    }

    {   // ARP: its rhythm and what that is
        const el = document.getElementById("arp");
        const update = cellRow(el.querySelector(".cells"), ["ARAL", "AROC", "ARRE", "TBPM", "RHPT", "RHSL", "RHRG", "RHSW"].map(cell));
        renders.push(() => {
            update();
            drawRhythm(el.querySelector("canvas"), idx("RHPT"));
            el.querySelector(".note").textContent = `Rhythm ${idx("RHPT") + 1} of 16, ${fmt("RHSL")} steps at ${fmt("TBPM")} BPM`;
        });
    }

    {   // SEQ: the steps, the one the cells edit outlined, past the length dimmed
        const el = document.getElementById("seq");
        const grid = el.querySelector(".steps");
        const steps = Array.from({ length: 32 }, (_, s) => {
            const b = document.createElement("button");
            b.type = "button";
            b.innerHTML = `<span></span><i></i>`;
            // a click picks the step; a drag moves its pitch, and picks it too
            const pitch = step(0, s);
            bindControl(b, () => ({ ...pitch, labels: null, set: x => { model.showStep(s); pitch.set(x); } }), () => model.showStep(s));
            b.addEventListener("dblclick", () => model.showStep(s));
            grid.appendChild(b);
            return b;
        });
        const update = cellRow(el.querySelector(".cells"), [0, 1, 2, 3].map(k => () => step(k))
            .concat(["SQLN", "SQDI", "SQRE", "TBPM", "SQSC", "SQRT"].map(cell)));
        renders.push(() => {
            update();
            const length = model.seqLength();
            steps.forEach((b, s) => {
                const vel = Math.max(0, Math.min(1, model.stepValue(s, 1)));
                b.firstChild.textContent = noteName(model.stepValue(s, 0));
                b.lastChild.style.width = s < length && vel > 0 ? `${8 + vel * 84}%` : "0";
                b.classList.toggle("cur", s === model.view.step);
                b.classList.toggle("out", s >= length);
                b.setAttribute("aria-pressed", String(s === model.view.step));
            });
            el.querySelector(".aside").textContent = `step ${model.view.step + 1} · ${length} of 32`;
        });
    }

    {   // CHORDS: what one key plays
        const el = document.getElementById("chords");
        const facts = el.querySelectorAll(".fact b");
        const update = cellRow(el.querySelector(".cells"), [cell("CHMD"), () => param(idx("CHMD") > 1 ? P.CHSC : P.CHTY), cell("SCTY")]);
        renders.push(() => {
            update();
            const mode = idx("CHMD");
            facts[0].textContent = mode ? fmt("CHMD") : "Off";
            facts[1].textContent = !mode ? "One note a key" : fmt(mode > 1 ? "CHSC" : "CHTY") + (mode > 1 ? ` of ${fmt("SCTY")}` : "");
            const root = 60 + (mode > 1 ? mode - 2 : 0);
            const notes = mode ? chordNotes(mode, idx("CHTY"), idx("CHSC"), scaleTable(idx("SCTY"), mode - 2), root) : [];
            facts[2].textContent = mode ? `${NOTES[root % 12]} ->  ${notes.slice(0, 8).map(n => NOTES[n % 12]).join("  ")}` : "";
            facts[0].classList.toggle("off", !mode);
            facts[1].classList.toggle("off", !mode);
            el.querySelector(".keys").hidden = !mode;
        });
    }

    return () => renders.forEach(r => r());
}
