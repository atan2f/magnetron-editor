// SPDX-License-Identifier: GPL-3.0-only
// Tooltips over the cells (a cell's name, its CC and NRPN), on while the ? button is; the choice is remembered.
const KEY = "magnetron-editor-tips";

export function startTooltips(button) {
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    document.body.appendChild(tip);
    const on = () => button.getAttribute("aria-pressed") === "true";
    try { if (localStorage.getItem(KEY) === "0") button.setAttribute("aria-pressed", "false"); } catch { /* (no storage) */ }
    button.addEventListener("click", () => {
        const next = !on();
        button.setAttribute("aria-pressed", String(next));
        try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* (no storage) */ }
        if (!next) tip.hidden = true;
    });
    const show = cell => {
        if (!on() || !cell.dataset.tip || cell.classList.contains("blank")) { tip.hidden = true; return; }
        tip.style.setProperty("--c", getComputedStyle(cell).getPropertyValue("--c"));
        tip.innerHTML = "";
        const b = document.createElement("b"), s = document.createElement("span");
        b.textContent = cell.dataset.name || cell.querySelector(".l")?.textContent || "";
        s.textContent = cell.dataset.tip;
        tip.append(b, s);
        tip.hidden = false;
        const r = cell.getBoundingClientRect(), t = tip.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
        tip.style.top = `${r.top - t.height - 6 < 8 ? r.bottom + 6 : r.top - t.height - 6}px`;
    };
    const target = e => e.target.closest && e.target.closest(".cell, [data-tip]");
    document.addEventListener("mouseover", e => { const c = target(e); if (c) show(c); else tip.hidden = true; });
    document.addEventListener("focusin", e => { const c = target(e); if (c) show(c); else tip.hidden = true; });
    document.addEventListener("pointerdown", () => { tip.hidden = true; });
    addEventListener("scroll", () => { tip.hidden = true; }, true);
}
