// SPDX-License-Identifier: GPL-3.0-only
// One choice of a list on a button: it shows the choice, and a click (or Enter, Space) opens the editor's menu.
// Used as a select is: el.value (a string), el.setOptions([[value, label], ...]) (the first is chosen), and a
// "change" event when the user picks another. The button is as wide as its longest label.
import { openMenu } from "./menu.js";

// columns: the menu's (default: by the list's length)
export function makeDropdown(el, options = [], { columns } = {}) {
    const name = el.getAttribute("aria-label") || "";
    const text = document.createElement("span");
    text.className = "t";
    let opts = [], at = -1;
    const show = () => {
        const label = at >= 0 ? opts[at][1] : "";
        text.textContent = label;
        if (name) el.setAttribute("aria-label", `${name}: ${label}`);
    };
    Object.defineProperty(el, "value", {
        get: () => (at >= 0 ? opts[at][0] : ""),
        set: v => { const i = opts.findIndex(o => o[0] === String(v)); if (i !== at) { at = i; show(); } },
    });
    el.setOptions = list => {
        opts = list.map(([v, l]) => [String(v), String(l)]);
        at = opts.length ? 0 : -1;
        el.replaceChildren(text, ...opts.map(o => { const w = document.createElement("span"); w.className = "w"; w.textContent = o[1]; return w; }));
        show();
    };
    el.addEventListener("click", () => {
        if (opts.length) openMenu(el, opts.map(o => o[1]), at, i => {
            if (i === at) return;
            at = i;
            show();
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }, columns);
    });
    el.setAttribute("aria-haspopup", "listbox");
    el.setOptions(options);
    return el;
}
