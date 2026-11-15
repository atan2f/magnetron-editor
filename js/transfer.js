// SPDX-License-Identifier: GPL-3.0-only
// Presets between the editor and the device, several at a time: the staged arrangement (arrange.js) written out,
// presets read for a file, the user slots' backup.
import * as model from "./model.js";
import * as sysex from "./sysex.js";
import { soundsFile, download } from "./syxfile.js";

export const NAME = 14;                         // (a user preset's name on the device: 14 characters)
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");

// each entry's 561 fields, read from the device where the editor doesn't hold them: [{words, name, category}]
export async function sounds(entries, progress = () => {}) {
    const out = [];
    for (const [k, e] of entries.entries()) {
        progress(k, entries.length);
        out.push({ words: e.words || (await sysex.getSlot(e.from)).words, name: e.name, category: e.category });
    }
    return out;
}

// the user slots that hold a preset, as the device has them, into one file (each sound to its slot)
export async function backup(progress = () => {}) {
    const slots = [...model.device.names.keys()].filter(sysex.isUser).sort((a, b) => a - b), out = [];
    for (const [k, slot] of slots.entries()) {
        progress(k, slots.length);
        out.push({ ...(await sysex.getSlot(slot)), slot });
    }
    if (out.length) download(soundsFile(out), `Magnetron user presets ${stamp()}.syx`);
    return out.length;
}

// the arrangement's changed slots written (a slot emptied: deleted). First every preset they hold now is read
// and saved as a file, and every preset going in is read: from then on a preset may be only here until its slot
// is written. A failure leaves the rest staged, with their fields held: applying again goes on from there.
export async function apply(arr, progress = () => {}) {
    const names = model.device.names, base = arr.base, changed = arr.changes(names), held = new Map(), old = [];
    const total = changed.length * 2;
    let step = 0;
    for (const i of changed) {
        progress(step++, total, "Reading");
        if (!names.has(base + i)) continue;
        const s = await sysex.getSlot(base + i);
        held.set(base + i, s);
        old.push({ ...s, slot: base + i });
    }
    for (const i of changed) {
        const e = arr.slots[i];
        if (e && !e.words) e.words = (held.get(e.from) || await sysex.getSlot(e.from)).words;
    }
    if (old.length) download(soundsFile(old), `Magnetron before changes ${stamp()}.syx`);
    const current = model.sound.slot, follow = changed.find(i => arr.slots[i] && arr.slots[i].from === current);
    for (const i of changed) if (arr.slots[i]) arr.slots[i].from = null;
    if (changed.includes(current - base)) model.sound.slot = follow === undefined ? null : base + follow;
    for (const i of changed) {
        const e = arr.slots[i], slot = base + i;
        progress(step++, total, "Writing");
        if (e) {
            await sysex.storeSlot(slot, e.words, e.name, e.category);
            names.set(slot, { name: e.name, category: e.category });
            e.from = slot; e.words = null;
        } else {
            await sysex.deleteSlot(slot);
            names.delete(slot);
        }
    }
    return changed.length;
}
