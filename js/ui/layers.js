// SPDX-License-Identifier: GPL-3.0-only
// LAYERS (layerview.c): the four layers as cards (playing alone, on in Multi, or off; the level; where it goes);
// a click shows a layer in the panels (in Solo, that's the one playing: Play follows). Its cells: the patch's
// Play and Alloc, then the shown layer's On, Volume, Pan, Rand Pan, Dest.
import { P } from "../params.js";
import * as model from "../model.js";
import * as values from "../values.js";
import { param, play } from "./bindings.js";
import { cellRow } from "./cell.js";

const LETTERS = "ABCD";

export function initLayers() {
    const box = document.getElementById("layer-cards");
    const cards = [...LETTERS].map((l, k) => {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "card";
        c.innerHTML = `<span class="top2"><span class="L">${l}</span><span class="st"></span></span>
            <span class="vb"><i></i></span><span class="meta"></span>`;
        c.addEventListener("click", () => model.showLayer(k));
        box.appendChild(c);
        return c;
    });
    const update = cellRow(document.getElementById("layer-cells"), [play, () => param(P.LYAL),
        () => param(P.ACT, `Layer ${LETTERS[model.view.layer]}`), () => param(P.LAV), () => param(P.LAP),
        () => param(P.LRP), () => param(P.LDS)]);
    return () => {
        update();
        const mode = model.value(P.LYMD), multi = mode > 3.5;
        cards.forEach((c, k) => {
            const on = model.valueIn(P.ACT, k) > 0.5, plays = multi ? on : k === Math.trunc(mode + 0.5);
            const level = Math.max(0, Math.min(1, model.valueIn(P.LAV, k)));
            const dest = values.format(P.LDS, model.valueIn(P.LDS, k));
            c.classList.toggle("cur", k === model.view.layer);
            c.classList.toggle("off", !plays);
            c.querySelector(".st").textContent = !plays ? "off" : multi ? "ON" : "SOLO";
            c.querySelector(".vb i").style.width = plays ? `${level * 100}%` : "0";
            c.querySelector(".meta").textContent = plays ? `> ${dest}` : "";
            c.setAttribute("aria-pressed", String(k === model.view.layer));
            c.setAttribute("aria-label", `Layer ${LETTERS[k]}, ${!plays ? "off" : multi ? "on" : "solo"}`);
        });
        document.querySelectorAll(".lay").forEach(el => { el.textContent = LETTERS[model.view.layer]; });
        document.getElementById("layer-band").textContent = `Layer ${LETTERS[model.view.layer]}`;
    };
}
