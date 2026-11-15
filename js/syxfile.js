// SPDX-License-Identifier: GPL-3.0-only
// .syx files: sounds as Magnetron's dumps (10 messages, as the device sends its edit buffer; 13s, each to its user
// slot, for a backup); in, every complete sound of a file: Magnetron's (10s or 13s) and the Protein's own, converted
// (protein.js).
import { dumpMessages, unwrap, DumpReader, ID } from "./sysex.js";
import { isProtein, ProteinReader } from "./protein.js";

const join = parts => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
};

export const soundFile = (words, name, category) => join(dumpMessages(words, name, category));
// several sounds in one file: [{words, name, category, slot}] (slot null: an edit-buffer dump)
export const soundsFile = sounds => join(sounds.flatMap(s => dumpMessages(s.words, s.name, s.category, s.slot ?? null)));

// every sound in a file, in its order: [{words, name, category, slot}] (slot: the user slot a 13 names, else null)
export function readSounds(bytes) {
    const reader = new DumpReader(), protein = new ProteinReader(), out = [];
    for (let i = 0; i < bytes.length; ++i) {
        if (bytes[i] !== 0xF0) continue;
        const end = bytes.indexOf(0xF7, i);
        if (end < 0) break;
        const msg = bytes.subarray(i, end + 1);
        i = end;
        if (isProtein(msg)) {
            const s = protein.add(msg);
            if (s) out.push({ ...s, slot: null });
            continue;
        }
        const m = unwrap(msg);
        if (!m || (m[3] !== ID.SOUND && m[3] !== ID.STORE)) continue;
        if (reader.add(m)) out.push({ words: Float32Array.from(reader.words), name: reader.name, category: reader.category, slot: reader.slot });
    }
    if (!out.length) throw new Error("No Magnetron or Protein sound in this file.");
    return out;
}

export const readSoundFile = bytes => readSounds(bytes)[0];

export function download(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
