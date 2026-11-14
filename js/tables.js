// SPDX-License-Identifier: GPL-3.0-only
// The wavetables, as the device plays them (SysEx 50): fetched the first time a panel shows one and kept for the
// connection (a reconnect starts over: another build can have other tables). listen(): one arrived.
import { getTable } from "./sysex.js";

const tables = new Map(), asked = new Set();
let listen = () => {}, connection = 0;
export const onTable = fn => { listen = fn; };
export function forget() { tables.clear(); asked.clear(); ++connection; }

// the table at a Table position (0..63): {name, halves}, or null while it's on its way (or not to be had)
export function tableAt(position, connected) {
    if (tables.has(position)) return tables.get(position);
    if (connected && !asked.has(position)) {
        const at = connection;
        asked.add(position);
        getTable(position).then(t => { if (at === connection) { tables.set(position, t); listen(); } },
            () => {});                        // (no answer, an older build: not asked again this connection)
    }
    return null;
}
