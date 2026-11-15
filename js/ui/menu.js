// SPDX-License-Identifier: GPL-3.0-only
// A list's names in a pop-up under its cell: click one, or arrows and Enter; Escape, a click outside or a click
// on its cell again closes it.
let open = null, shut = null;                     // (shut: the cell whose press just closed its menu: its click opens none)

export function closeMenu() {
    if (!open) return;
    open.el.remove();
    document.removeEventListener("pointerdown", open.outside, true);
    const owner = open.owner;
    open = null;
    owner.focus();
}

// columns: how many the names are laid in (default: by their count)
export function openMenu(owner, labels, current, choose, columns = labels.length > 24 ? 3 : labels.length > 10 ? 2 : 1) {
    if (shut === owner) { shut = null; return; }
    closeMenu();
    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "listbox");
    el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    labels.forEach((l, i) => {
        const o = document.createElement("button");
        o.type = "button";
        o.textContent = l;
        o.className = i === current ? "on" : "";
        o.addEventListener("click", () => { choose(i); closeMenu(); });
        el.appendChild(o);
    });
    el.addEventListener("keydown", e => {
        const items = [...el.children], at = items.indexOf(document.activeElement);
        const d = { ArrowDown: 1, ArrowUp: -1, ArrowRight: Math.ceil(labels.length / columns), ArrowLeft: -Math.ceil(labels.length / columns) }[e.key];
        if (d) { e.preventDefault(); items[Math.max(0, Math.min(items.length - 1, at + d))].focus(); }
        else if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
    });
    document.body.appendChild(el);
    const r = owner.getBoundingClientRect(), m = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(innerWidth - m.width - 8, r.left));
    const below = r.bottom + 4 + m.height < innerHeight - 8;
    el.style.left = `${x}px`;
    el.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - 4 - m.height)}px`;
    const outside = e => {
        if (el.contains(e.target)) return;
        shut = owner.contains(e.target) ? owner : null;
        if (shut) document.addEventListener("pointerup", () => setTimeout(() => { shut = null; }, 0), { once: true, capture: true });   // (only that press's own release)
        closeMenu();
    };
    document.addEventListener("pointerdown", outside, true);
    open = { el, owner, outside };
    (el.children[current] || el.firstChild).focus();
}
