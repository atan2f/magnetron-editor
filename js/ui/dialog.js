// SPDX-License-Identifier: GPL-3.0-only
// The page's own dialogs (no browser pop-ups): a question with its answers, and Store (a user slot, the name).
import * as model from "../model.js";
import { CATEGORIES } from "../data/fields.js";
import { USER, USER_SLOTS } from "../sysex.js";
import { slotNumber } from "./library.js";

const NAME = 14;                                // (a user preset's name on the device: 14 characters)

function shell(title) {
    const back = document.createElement("div");
    back.className = "dialog-back";
    back.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><h2></h2><div class="body"></div><div class="actions"></div></div>`;
    back.querySelector("h2").textContent = title;
    document.body.appendChild(back);
    return back;
}

// resolves with the chosen answer's index, or -1 (Escape)
export function ask(title, text, answers) {
    return new Promise(resolve => {
        const back = shell(title);
        back.querySelector(".body").textContent = text;
        const done = i => { back.remove(); resolve(i); };
        answers.forEach((a, i) => {
            const b = document.createElement("button");
            b.type = "button"; b.className = `btn${i === answers.length - 1 ? " primary" : ""}`; b.textContent = a;
            b.addEventListener("click", () => done(i));
            back.querySelector(".actions").appendChild(b);
        });
        back.addEventListener("keydown", e => { if (e.key === "Escape") done(-1); });
        back.querySelector(".actions button:last-child").focus();
    });
}

// Store: resolves {slot, name, category} or null
export function storeDialog() {
    return new Promise(resolve => {
        const back = shell("Store to a user slot");
        const body = back.querySelector(".body");
        body.innerHTML = `<label class="row">Name <input id="st-name" maxlength="${NAME}" spellcheck="false"></label>
            <label class="row">Category <select id="st-cat" class="sel"></select></label>
            <ul class="slots" id="st-slots" role="listbox" aria-label="User slot"></ul>`;
        const name = body.querySelector("#st-name"), cat = body.querySelector("#st-cat"), slots = body.querySelector("#st-slots");
        name.value = model.sound.name.slice(0, NAME);
        cat.innerHTML = CATEGORIES.map((c, i) => `<option value="${i}">${c}</option>`).join("");
        cat.value = String(model.sound.category);
        let slot = model.sound.slot !== null && model.sound.slot >= USER ? model.sound.slot
            : USER + (Array.from({ length: USER_SLOTS }, (_, i) => i).find(i => !model.device.names.has(USER + i)) ?? 0);
        const go = document.createElement("button");
        const label = () => {
            const e = model.device.names.get(slot);
            go.textContent = e ? `Replace ${slotNumber(slot)} ${e.name}` : `Store to ${slotNumber(slot)}`;
            [...slots.children].forEach(li => li.classList.toggle("sel", +li.dataset.slot === slot));
        };
        for (let i = 0; i < USER_SLOTS; ++i) {
            const s = USER + i, e = model.device.names.get(s), li = document.createElement("li");
            li.dataset.slot = String(s);
            li.innerHTML = `<span class="n">${slotNumber(s)}</span><span class="nm"></span>`;
            li.querySelector(".nm").textContent = e ? e.name : "Empty";
            if (!e) li.classList.add("empty");
            li.addEventListener("click", () => { slot = s; label(); });
            slots.appendChild(li);
        }
        const done = r => { back.remove(); resolve(r); };
        const cancel = document.createElement("button");
        cancel.type = "button"; cancel.className = "btn"; cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => done(null));
        go.type = "button"; go.className = "btn primary";
        go.addEventListener("click", () => done({ slot, name: name.value.trim() || "Init", category: +cat.value }));
        back.querySelector(".actions").append(cancel, go);
        back.addEventListener("keydown", e => { if (e.key === "Escape") done(null); });
        label();
        slots.querySelector(".sel")?.scrollIntoView({ block: "center" });
        name.focus(); name.select();
    });
}
