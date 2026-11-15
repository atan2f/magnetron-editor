// SPDX-License-Identifier: GPL-3.0-only
// The preset rail: the device's factory presets and user slots (names over SysEx), a search (name or number) and a
// category filter; a click (or Load) plays one on the device and brings it here. Shift- and Ctrl-click pick
// several. The user slots are arranged here first (arrange.js): picked presets dragged to another place, factory
// presets dragged in as copies, .syx files dropped in (every sound in them), Delete; the changed slots are
// marked and nothing is sent until Apply (Discard: as the device has them).
import * as model from "../model.js";
import { CATEGORIES } from "../data/fields.js";
import { USER, USER_SLOTS, isUser } from "../sysex.js";
import { Arrangement, entryOf } from "../arrange.js";
import { NAME } from "../transfer.js";
import { attachScrollbar } from "./scrollbar.js";
import { makeDropdown } from "./dropdown.js";

export const slotNumber = s => (s >= USER ? `U${String(s - USER + 1).padStart(3, "0")}` : String(s).padStart(3, "0"));

export function initLibrary(actions) {
    const list = document.getElementById("list"), filter = document.getElementById("filter"), search = document.getElementById("search");
    const tabs = { factory: document.getElementById("tab-factory"), user: document.getElementById("tab-user") };
    const count = document.getElementById("lib-count"), line = document.getElementById("ins"), wrap = list.parentElement;
    const btn = id => document.getElementById(id);
    const arr = new Arrangement(USER_SLOTS, USER);
    let tab = "factory", picks = new Set(), anchor = null, names = null, busy = false, drag = null;
    const sync = attachScrollbar(list, document.getElementById("track"), document.getElementById("thumb"));

    makeDropdown(filter, [["", "All categories"], ...CATEGORIES.map((c, i) => [i, c])]);
    // a slot's preset as the list shows it: a factory preset as the device names it, a user slot's as arranged
    const entry = s => (s >= USER ? arr.slots[s - USER] : model.device.names.has(s) ? entryOf(model.device.names.get(s), s) : null) || null;
    const pending = () => arr.changes(model.device.names).length;
    const searching = () => search.value.trim() !== "";
    // what the search matches: a name containing it, or a number starting with it ("065", "65", "U05")
    const matches = s => {
        const q = search.value.trim().toLowerCase(), e = entry(s);
        if (!q) return true;
        const n = slotNumber(s).toLowerCase();
        return (e && e.name.toLowerCase().includes(q)) || n.startsWith(q) || n.replace(/^[u0]+/, "").startsWith(q.replace(/^[u0]+/, "") || "\0");
    };
    const slots = () => {
        if (tab === "user") return Array.from({ length: USER_SLOTS }, (_, i) => USER + i).filter(s => !searching() || (entry(s) && matches(s)));
        const want = filter.value === "" ? null : +filter.value;
        return [...model.device.names.keys()].filter(s => s < USER && (want === null || model.device.names.get(s).category === want) && matches(s)).sort((a, b) => a - b);
    };
    const picked = () => [...picks].filter(entry).sort((a, b) => a - b);

    // a preset played: the device's own slot, or (a file's sound, not yet sent) its fields to the edit buffer
    const play = s => {
        const e = entry(s);
        if (!e || !model.device.connected || busy) return;
        if (e.from === null) actions.audition(e);
        else if (!(e.from === model.sound.slot && !model.sound.edited)) actions.load(e.from);
    };
    const choose = s => { picks = new Set([s]); anchor = s; render(); };
    list.addEventListener("click", e => {
        const li = e.target.closest("li");
        if (!li) return;
        const s = +li.dataset.slot;
        if (e.ctrlKey || e.metaKey) { if (picks.has(s)) picks.delete(s); else picks.add(s); anchor = s; render(); }
        else if (e.shiftKey && anchor !== null) {
            const shown = slots(), a = shown.indexOf(anchor), b = shown.indexOf(s);
            picks = new Set(a < 0 ? [s] : shown.slice(Math.min(a, b), Math.max(a, b) + 1));
            render();
        } else { choose(s); play(s); }
    });
    list.addEventListener("keydown", e => {
        const items = [...list.children], at = items.findIndex(li => +li.dataset.slot === anchor);
        const d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
        if (d && items.length) { e.preventDefault(); const li = items[Math.max(0, Math.min(items.length - 1, at + d))]; choose(+li.dataset.slot); li.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "Enter" && picks.size === 1) play([...picks][0]);
        else if (e.key === "Delete") remove();
    });
    for (const [name, el] of Object.entries(tabs)) el.addEventListener("click", () => { tab = name; picks = new Set(); anchor = null; render(); });
    filter.addEventListener("change", render);
    search.addEventListener("input", render);
    search.addEventListener("keydown", e => {             // Enter plays the first match; down goes into the list
        const first = list.firstElementChild;
        if (!first) return;
        if (e.key === "Enter" && entry(+first.dataset.slot)) { e.preventDefault(); choose(+first.dataset.slot); play(+first.dataset.slot); }
        else if (e.key === "ArrowDown") { e.preventDefault(); choose(+first.dataset.slot); list.focus(); }
        else if (e.key === "Escape" && search.value) { e.preventDefault(); search.value = ""; render(); }
    });

    // ---- the arrangement's changes -----------------------------------------------------------------------------

    function remove() {
        if (tab !== "user" || busy) return;
        arr.remove(picked().map(s => s - USER));
        render();
    }
    // the user slots shown with these picked, the first of them in view
    function landed(first, n) {
        picks = new Set(Array.from({ length: n }, (_, k) => USER + first + k));
        anchor = USER + first;
        tab = "user";
        render();
        const li = list.querySelector(`li[data-slot="${anchor}"]`);
        if (li) li.scrollIntoView({ block: "nearest" });
    }
    // sounds (a file's) or copies (factory presets) in at the boundary before index at, or (onto) on the slots
    // from index at, replacing what they hold; told if they don't fit
    function insert(entries, at, onto = false) {
        const first = onto ? arr.replace(entries, at) : arr.insert(entries, at);
        if (first >= 0) landed(first, entries.length);
        else actions.say(onto ? `${entries.length} presets don't fit from ${slotNumber(USER + at)}.` : `${entries.length} presets don't fit: ${arr.free()} user slots are empty.`);
    }
    // files' sounds in at a place; a backup's (each names its user slot) back to their own slots if asked
    async function files(fileList, at, onto = false) {
        const found = await actions.readFiles([...fileList]);
        if (!found || !found.length || busy) return;
        const fresh = found.map(s => entryOf({ ...s, name: s.name.slice(0, NAME) }));
        if (found.every(s => s.slot !== null && isUser(s.slot))) {
            const a = await actions.ask("Restore to their slots?", `These ${found.length} presets were saved from user slots. Put them back in the same slots, replacing what is there now, or in from ${slotNumber(USER + Math.min(at, USER_SLOTS - 1))}?`, ["Cancel", "In from there", "Same slots"]);
            if (a === 2) {
                found.forEach((s, k) => arr.put(s.slot - USER, fresh[k]));
                picks = new Set(found.map(s => s.slot)); anchor = found[0].slot; tab = "user";
                render();
                return;
            }
            if (a !== 1) return;
        }
        insert(fresh, at, onto);
    }
    // where Import's sounds go: the first picked user slot, else the first empty one
    const importAt = () => {
        const p = tab === "user" ? [...picks].sort((a, b) => a - b)[0] : undefined;
        if (p !== undefined) return p - USER;
        const empty = arr.slots.findIndex(e => !e);
        return empty < 0 ? USER_SLOTS : empty;
    };

    btn("load").addEventListener("click", () => { if (picks.size === 1) play([...picks][0]); });
    btn("del").addEventListener("click", remove);
    btn("imp").addEventListener("click", () => btn("imp-file").click());
    btn("imp-file").addEventListener("change", async e => {
        const f = [...e.target.files];
        e.target.value = "";
        if (!f.length) return;
        if (f.length === 1 && await actions.importOne(f[0])) return;     // (one sound alone: into the editor)
        files(f, importAt());
    });
    btn("exp").addEventListener("click", () => { const p = picked(); if (p.length > 1) actions.exportSounds(p.map(entry)); else actions.exportFile(); });
    btn("backup").addEventListener("click", () => actions.backup());
    btn("discard").addEventListener("click", () => { arr.reset(model.device.names); picks = new Set(); render(); });
    btn("apply").addEventListener("click", async () => {
        busy = true; render();
        try { await actions.apply(arr); } finally { busy = false; picks = new Set(); render(); }
    });
    addEventListener("beforeunload", e => { if (pending()) e.preventDefault(); });

    // ---- drag and drop ---------------------------------------------------------------------------------------------

    const hasFiles = e => [...e.dataTransfer.types].includes("Files");
    // where a drop goes: onto the row under the pointer (its middle half), else in at the boundary nearest (the
    // index it goes in before, and where its line is drawn)
    function boundary(e) {
        const li = e.target.closest ? e.target.closest("li") : null, rows = list.children;
        if (!rows.length) return { at: 0, y: 0, onto: null };
        const row = li || rows[rows.length - 1], r = row.getBoundingClientRect(), part = (e.clientY - r.top) / r.height;
        if (li && part > 0.25 && part < 0.75) return { at: +row.dataset.slot - USER, onto: row };
        const after = !li || part >= 0.75;
        return { at: +row.dataset.slot - USER + (after ? 1 : 0), y: row.offsetTop - list.offsetTop - list.scrollTop + (after ? row.offsetHeight : 0), onto: null };
    }
    let target = null;                            // (the row a drop would go onto)
    function aim(where) {
        if (target && target !== (where && where.onto)) target.classList.remove("onto");
        target = where ? where.onto : null;
        if (target) target.classList.add("onto");
        line.hidden = !where || !!where.onto;
        if (where && !where.onto) line.style.top = `${where.y}px`;
    }
    // a drag held near the list's top or bottom edge scrolls it, faster the nearer the edge
    const EDGE = 36;
    let creep = 0, creeping = null;
    function scrollNear(e) {
        const r = list.getBoundingClientRect(), up = r.top + EDGE - e.clientY, down = e.clientY - (r.bottom - EDGE);
        creep = up > 0 ? -Math.min(1, up / EDGE) : down > 0 ? Math.min(1, down / EDGE) : 0;
        if (creep && !creeping) creeping = setInterval(() => { if (creep) list.scrollTop += creep * 14; else still(); }, 16);
    }
    function still() { creep = 0; clearInterval(creeping); creeping = null; }
    const droppable = e => !busy && tab === "user" && !searching() && (drag || hasFiles(e));
    list.addEventListener("dragstart", e => {
        const li = e.target.closest("li"), s = li ? +li.dataset.slot : null;
        if (busy || s === null || !entry(s) || (tab === "user" && searching())) { e.preventDefault(); return; }
        if (!picks.has(s)) { picks = new Set([s]); anchor = s; }
        drag = { tab, slots: picked() };
        e.dataTransfer.effectAllowed = tab === "user" ? "move" : "copy";
        e.dataTransfer.setData("text/plain", drag.slots.map(slotNumber).join(" "));
        const ghost = document.getElementById("ghost");
        ghost.textContent = drag.slots.length === 1 ? entry(s).name : `${drag.slots.length} presets`;
        e.dataTransfer.setDragImage(ghost, -12, -8);
        requestAnimationFrame(render);            // (the rows dim once the drag has its image)
    });
    addEventListener("dragend", () => { drag = null; aim(null); still(); render(); });
    tabs.user.addEventListener("dragenter", e => { if ((drag || hasFiles(e)) && tab !== "user") { tab = "user"; render(); } });   // a drag held over the tab opens it
    wrap.addEventListener("dragover", e => {
        if (!droppable(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = drag && drag.tab === "user" ? "move" : "copy";
        aim(boundary(e));
        scrollNear(e);
    });
    wrap.addEventListener("dragleave", e => { if (!wrap.contains(e.relatedTarget)) { aim(null); still(); } });
    wrap.addEventListener("drop", e => {
        if (!droppable(e)) return;
        e.preventDefault();
        const where = boundary(e), at = where.at, onto = !!where.onto, d = drag;
        aim(null);
        still();
        drag = null;
        if (!d) files(e.dataTransfer.files, at, onto);
        else if (d.tab !== "user") insert(d.slots.map(s => entryOf(model.device.names.get(s), s)), at, onto);
        else {
            const first = onto ? arr.take(d.slots.map(s => s - USER), at) : arr.move(d.slots.map(s => s - USER), at);
            if (first < 0) actions.say(`${d.slots.length} presets don't fit from ${slotNumber(USER + at)}.`);
            else landed(first, d.slots.length);
        }
    });

    // ---- drawing ---------------------------------------------------------------------------------------------------

    let shown = "";
    function render() {
        if (model.device.names !== names) { names = model.device.names; arr.reset(names); picks = new Set(); }   // (a new connection's)
        else if (!busy && !pending()) arr.reset(names);                  // (a store elsewhere)
        const users = arr.slots.filter(Boolean).length, changes = pending(), sel = picked();
        tabs.factory.textContent = `Factory ${[...names.keys()].filter(s => s < USER).length}`;
        tabs.user.textContent = `User ${users} / ${USER_SLOTS}`;
        for (const [name, el] of Object.entries(tabs)) { el.classList.toggle("on", tab === name); el.setAttribute("aria-pressed", String(tab === name)); }
        filter.hidden = tab === "user";
        const items = slots();
        const html = items.map(s => {
            const e = entry(s);
            return `<li data-slot="${s}"${e ? ` draggable="true"` : ""}><span class="n">${slotNumber(s)}</span><span class="nm"></span><span class="c">${e ? CATEGORIES[e.category] || "" : ""}</span></li>`;
        }).join("");
        const key = html + items.map(s => (entry(s) || {}).name || "").join("\n");
        if (key !== shown) {
            list.innerHTML = html;
            [...list.children].forEach(li => { const e = entry(+li.dataset.slot); li.querySelector(".nm").textContent = e ? e.name : "Empty"; });
            shown = key;
            sync();
        }
        const cur = model.sound.slot;
        for (const li of list.children) {             // (the rows' states put on the rows there are: a drag keeps its row)
            const s = +li.dataset.slot, e = entry(s);
            li.className = [e && cur !== null && e.from === cur ? "cur" : "", picks.has(s) ? "sel" : "", e ? "" : "empty",
                s >= USER && arr.changed(s - USER, names) ? "moved" : "", drag && drag.tab === tab && drag.slots.includes(s) ? "lift" : "",
                li === target ? "onto" : ""].join(" ");
        }
        count.textContent = changes ? `${changes} slot${changes === 1 ? "" : "s"} changed` : sel.length > 1 ? `${sel.length} selected`
            : cur !== null && names.has(cur) ? `${slotNumber(cur)}` : "";
        const ok = model.device.connected && !busy;
        btn("load").disabled = !(picks.size === 1 && sel.length === 1 && ok);
        btn("del").disabled = !(tab === "user" && sel.length && !busy);
        btn("del").textContent = sel.length > 1 ? `Delete ${sel.length}` : "Delete";
        btn("exp").textContent = sel.length > 1 ? `Export ${sel.length} .syx` : "Export .syx";
        btn("exp").disabled = sel.length > 1 && !ok;
        btn("backup").disabled = !ok || ![...names.keys()].some(isUser);
        btn("pend").hidden = !changes;
        btn("pend-text").textContent = `${changes} slot${changes === 1 ? "" : "s"} to write.`;
        const lost = busy ? [] : arr.lost(names);
        btn("pend-lost").textContent = lost.length ? `${lost.length} preset${lost.length === 1 ? "" : "s"} deleted.` : "";
        if (lost.length) { btn("pend-lost").dataset.name = "Deleted"; btn("pend-lost").dataset.tip = "\n" + lost.map(x => `${slotNumber(x)} ${names.get(x).name}`).join("\n"); }   // (which, in the tooltip: under its heading)
        else delete btn("pend-lost").dataset.tip;
        btn("apply").disabled = !ok;
        btn("discard").disabled = busy;
    }

    // the sounding preset in view (on a load): scrolled to only if it is out of sight
    function reveal() {
        const s = model.sound.slot;
        if (s === null) return;
        const want = isUser(s) ? "user" : "factory";
        if (tab !== want) { tab = want; render(); }
        const at = isUser(s) ? arr.slots.findIndex(e => e && e.from === s) : -1;
        const li = list.querySelector(`li[data-slot="${at >= 0 ? USER + at : s}"]`);
        if (!li) return;
        const top = li.offsetTop - list.offsetTop;                       // (a row already in view stays where it is)
        if (top < list.scrollTop || top + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 3;
    }
    return { render, reveal, pending };
}
