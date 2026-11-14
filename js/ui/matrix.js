// SPDX-License-Identifier: GPL-3.0-only
// The matrix, all eight slots at once (the device's MATRIX page shows them all and edits one): each row its
// source, target and amount (-64..+63 about the centre); a slot that's Off shows nothing more (matrixview.c).
import { P } from "../params.js";
import * as model from "../model.js";
import * as values from "../values.js";
import { param } from "./bindings.js";
import { bindControl } from "./cell.js";

export function initMatrix() {
    const table = document.getElementById("matrix-rows");
    const rows = [];
    for (let k = 0; k < 8; ++k) {
        const src = P.MS1 + 3 * k, dst = src + 1, amt = src + 2;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="n">${k + 1}</td><td class="dd" tabindex="0"></td><td class="ar">&gt;</td>
            <td class="dd" tabindex="0"></td><td class="amt" tabindex="0"><div class="ab"><i></i></div></td><td class="av"></td>`;
        const [, s, , d, a, av] = tr.children;
        const live = () => values.indexAt(src, model.value(src)) !== 0;   // (Off: no target or amount to edit)
        const bs = () => param(src), bd = () => (live() ? param(dst) : null), ba = () => (live() ? param(amt) : null);
        bindControl(s, bs); bindControl(d, bd); bindControl(a, ba, () => {});
        av.tabIndex = -1;
        bindControl(av, ba, () => {});
        table.appendChild(tr);
        rows.push(() => {
            const on = values.indexAt(src, model.value(src)) !== 0;
            tr.classList.toggle("off", !on);
            tr.children[2].textContent = on ? ">" : "";
            s.textContent = values.format(src, model.value(src));
            d.textContent = on ? values.format(dst, model.value(dst)) : "";
            av.textContent = on ? values.format(amt, model.value(amt)) : "";
            const half = Math.trunc(values.frac(amt, model.value(amt)) * 256) - 128;    // -128..+128
            const bar = a.querySelector("i");
            bar.style.left = `${50 + Math.min(0, half) / 2.56}%`;
            bar.style.width = `${Math.abs(half) / 2.56}%`;
            a.style.visibility = on ? "" : "hidden";
            for (const [el, b] of [[s, bs], [d, bd], [a, ba]]) {
                const x = b();
                if (x) { el.dataset.tip = x.tip(); el.dataset.name = `${x.name} ${k + 1}`; } else delete el.dataset.tip;
            }
        });
    }
    return () => rows.forEach(r => r());
}
