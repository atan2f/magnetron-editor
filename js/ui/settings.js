// SPDX-License-Identifier: GPL-3.0-only
// SETTINGS: the device's own, over SysEx 30 / 31: Omni, the receive and send channels, MPE, clock, screen saver, the
// debug line, the preset it boots with. Shown once the device has sent them.
import { P } from "../params.js";
import * as model from "../model.js";
import { setting } from "./bindings.js";
import { cellRow } from "./cell.js";
import { slotNumber } from "./library.js";

// the boot preset: any preset the device has, by its number and name
function boot(put) {
    const slots = () => [...model.device.names.keys()].sort((a, b) => a - b);
    const label = s => `${slotNumber(s)} ${model.device.names.get(s).name}`;
    return () => {
        const list = slots();
        if (!list.length) return null;
        const at = () => Math.max(0, list.indexOf(model.settings.boot));
        return {
            key: "boot", name: "Boots",
            get: at, set: i => put({ boot: list[Math.round(i)] }),
            text: () => (model.device.names.has(model.settings.boot) ? label(model.settings.boot) : "-"),
            frac: () => 0, step: (x, d) => Math.max(0, Math.min(list.length - 1, Math.round(x) + d)), fine: null,
            def: 0, labels: list.map(label), range: 0, tip: () => "SysEx setting",
        };
    };
}

export function initSettings(put) {
    const el = document.getElementById("settings");
    const s = key => () => setting(P[key], put);
    // the device's SETTINGS pages (pages.c): MIDI (Omni, Recv Ch, Send Ch, MPE, Max Chan), then the device's (Clock
    // In / Out, Saver, Debug); and the preset it boots with (SAVE on SETTINGS there)
    const none = () => null;
    const update = cellRow(el.querySelector(".cells"), [s("OMNI"), s("RCHN"), s("SCHN"), none, s("MPES"), s("MPEC"), none, none,
        s("CLKI"), s("CLKO"), s("SCRN"), s("DBUG"), boot(put)]);
    return () => {
        el.hidden = !Object.keys(model.settings).length;
        if (!el.hidden) update();
    };
}
