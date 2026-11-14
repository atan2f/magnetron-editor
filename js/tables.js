// SPDX-License-Identifier: GPL-3.0-only
// The wavetables, as the device plays them (SysEx 50): all 64 read once and kept in this browser by the build's
// version, so a later connect to the same version reads none. A build that doesn't answer leaves the panels blank.
import { getTable } from "./sysex.js";

const KEY = "magnetron-editor-tables", COUNT = 64;
let tables = null, listen = () => {};
export const onTable = fn => { listen = fn; };
export function forget() { tables = null; }

// the table at a Table position (0..63): {name, halves}, or null
export const tableAt = position => (tables && tables[position]) || null;

const toText = bytes => btoa(String.fromCharCode(...bytes));
const toBytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

// version: the device's; the kept tables if they're this version's, else all read from the device and kept.
// fresh: read from the device whatever is kept (the ones shown meanwhile, and a failure thrown)
export async function load(version, fresh = false) {
    if (!fresh) {
        tables = null;
        try {
            const kept = JSON.parse(localStorage.getItem(KEY));
            if (kept && kept.version === version && kept.tables.length === COUNT) {
                tables = kept.tables.map(t => ({ name: t.name, halves: toBytes(t.halves) }));
                listen();
                return;
            }
        } catch { /* (none kept, or no storage) */ }
    }
    const read = [];
    try { for (let p = 0; p < COUNT; ++p) read.push(await getTable(p)); }
    catch (e) { if (fresh) throw e; return; }     // (an older build: no tables)
    tables = read;
    try { localStorage.setItem(KEY, JSON.stringify({ version, tables: read.map(t => ({ name: t.name, halves: toText(t.halves) })) })); }
    catch { /* (no storage: read again next connect) */ }
    listen();
}
