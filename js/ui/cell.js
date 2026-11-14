// SPDX-License-Identifier: GPL-3.0-only
// A value cell, as the device's (a label, a big value, a thin bar), and the control behind it (also the matrix's
// and the steps'): drag up / down to move it a step at a time (Shift: fine steps, where the field has them),
// double-click for its default, arrow keys when focused; a list opens its names on a click (or Enter).
import { openMenu } from "./menu.js";

// pixels of drag a step: a short list moves slowly, 0..127 about 2.4 px a step
const pxPerStep = b => (b.labels ? Math.max(8, Math.min(14, 120 / b.labels.length)) : Math.max(1.5, Math.min(10, 300 / Math.max(1, b.range))));

// el edits binding(): drag, double-click, keys; onClick(e) for a press that didn't move (default: a
// list's menu)
export function bindControl(el, binding, onClick) {
    const move = (detents, fine) => {
        const b = binding();
        if (!b || !detents) return;
        const v = b.get(), next = fine && b.fine ? b.fine(v, detents) : b.step(v, detents);
        if (next !== v) b.set(next);
    };
    const pick = () => {
        const b = binding();
        if (b && b.labels) openMenu(el, b.labels, Math.round(b.step(b.get(), 0)), i => b.set(i));
    };
    el.addEventListener("pointerdown", e => {
        const b = binding();
        if (!b || e.button !== 0) return;
        e.preventDefault();
        el.focus();
        el.setPointerCapture(e.pointerId);
        const y0 = e.clientY;
        let taken = 0, moved = false;
        el.classList.add("drag");
        const onMove = m => {
            const per = pxPerStep(b) * (m.shiftKey && b.fine ? 1.2 : 1);
            const want = Math.trunc((y0 - m.clientY) / per);
            if (Math.abs(y0 - m.clientY) > 3) moved = true;
            if (want !== taken) { move(want - taken, m.shiftKey); taken = want; }
        };
        const onUp = up => {
            el.classList.remove("drag");
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerup", onUp);
            el.removeEventListener("pointercancel", onUp);
            if (!moved && up.type === "pointerup") (onClick || pick)(up);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
        el.addEventListener("pointercancel", onUp);
    });
    el.addEventListener("dblclick", () => { const b = binding(); if (b && !b.labels) b.set(b.def); });
    el.addEventListener("keydown", e => {
        const b = binding();
        if (!b) return;
        const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
        if (d) { e.preventDefault(); move(d, e.shiftKey); }
        else if ((e.key === "Enter" || e.key === " ") && b.labels) { e.preventDefault(); pick(); }
    });
}

export function makeCell(source) {          // source(): the binding to show now, or null (a blank cell)
    const el = document.createElement("div");
    el.className = "cell";
    el.tabIndex = 0;
    el.innerHTML = `<div class="l"></div><div class="v"></div><div class="b"><i></i></div>`;
    const [label, value, bar] = [el.children[0], el.children[1], el.children[2].firstChild];
    let b = null;
    bindControl(el, () => b);
    el.update = () => {
        b = source();
        el.classList.toggle("blank", !b);
        el.classList.toggle("pick", !!(b && b.labels));
        el.tabIndex = b ? 0 : -1;
        if (!b) { delete el.dataset.tip; return; }
        const v = b.get(), fr = b.frac(v);
        label.textContent = b.name;
        value.textContent = b.text(v);
        bar.style.width = fr > 0 ? `calc(8% + ${fr * 92}%)` : "0";   // (the device's: 4 px + 46 * frac, of 50)
        el.dataset.tip = b.tip();
    };
    return el;
}

// cells into a container: sources, each () => binding | null; returns their update
export function cellRow(container, sources) {
    const cells = sources.map(s => makeCell(s));
    cells.forEach(c => container.appendChild(c));
    return () => cells.forEach(c => c.update());
}
