// SPDX-License-Identifier: GPL-3.0-only
// .syx files: a sound as Magnetron's dump (10 messages, as the device sends its edit buffer); in, a file's first
// complete dump (10s or 13s). The Protein's own dumps need converting first (tools/protein_syx.py).
import { dumpMessages, unwrap, DumpReader, ID } from "./sysex.js";

export function soundFile(words, name, category) {
    const parts = dumpMessages(words, name, category);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

export function readSoundFile(bytes) {
    const reader = new DumpReader();
    let protein = false;
    for (let i = 0; i < bytes.length; ++i) {
        if (bytes[i] !== 0xF0) continue;
        const end = bytes.indexOf(0xF7, i);
        if (end < 0) break;
        const msg = bytes.subarray(i, end + 1);
        if (msg[1] === 0x3E && msg[2] === 0x2F) protein = true;
        const m = unwrap(msg);
        i = end;
        if (!m || (m[3] !== ID.SOUND && m[3] !== ID.STORE)) continue;
        if (reader.add(m)) return { words: reader.words, name: reader.name, category: reader.category };
    }
    if (protein) throw new Error("This is a Protein dump. Convert it with tools/protein_syx.py first.");
    throw new Error("No Magnetron sound in this file.");
}

export function download(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
