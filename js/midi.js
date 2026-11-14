// SPDX-License-Identifier: GPL-3.0-only
// Web MIDI: the Magnetron's ports, NRPN both ways (app/nrpn.c's numbering and scaling), program changes, SysEx.
import { FIELDS } from "./params.js";

const PORT_KEY = "magnetron-editor-ports";
let access = null, input = null, output = null;
const handlers = { nrpn: () => {}, sysex: () => {}, ports: () => {}, traffic: () => {} };
export const onMidi = (kind, fn) => { handlers[kind] = fn; };

export async function start() {
    if (!navigator.requestMIDIAccess) throw new Error("This browser has no Web MIDI. Use Chrome or Edge.");
    access = await navigator.requestMIDIAccess({ sysex: true });
    access.onstatechange = () => { choose(); handlers.ports(); };
    choose();
}

const remembered = () => { try { return JSON.parse(localStorage.getItem(PORT_KEY)) || {}; } catch { return {}; } };

// the ports: the ones chosen last time, else the first named Magnetron
function choose() {
    const want = remembered();
    const pick = (ports, name) => ports.find(p => p.name === name) || ports.find(p => /magnetron/i.test(p.name)) || null;
    setInput(pick([...access.inputs.values()], want.input));
    output = pick([...access.outputs.values()], want.output);
}

function setInput(port) {
    if (input === port) return;
    if (input) input.onmidimessage = null;
    input = port;
    if (input) input.onmidimessage = e => receive(e.data);
}

export const ports = () => ({
    inputs: access ? [...access.inputs.values()].map(p => p.name) : [],
    outputs: access ? [...access.outputs.values()].map(p => p.name) : [],
    input: input && input.name, output: output && output.name,
});

export function usePorts(inName, outName) {
    setInput([...access.inputs.values()].find(p => p.name === inName) || null);
    output = [...access.outputs.values()].find(p => p.name === outName) || null;
    try { localStorage.setItem(PORT_KEY, JSON.stringify({ input: inName, output: outName })); } catch { /* (no storage) */ }
    handlers.ports();
}

export const ready = () => !!(input && output && input.state === "connected" && output.state === "connected");

function send(bytes) {
    if (!output) return false;
    output.send(bytes);
    return true;
}
export const sendSysex = bytes => { const ok = send(bytes); if (ok) handlers.traffic("out", bytes); return ok; };
// channel messages a send() each: several in one array reach the device garbled (Chrome on Windows: a bank select and
// program change sent together loaded the wrong preset)
const sendEach = messages => { for (const m of messages) send(m); };

// ---- NRPN (nrpn.c): parameter number = field index, MSB CC 99, LSB CC 98; data CC 6 / 38, 14 bits. A stepped
// field its step (0 .. steps - 1, mostly in the LSB); a continuous one 0 .. 16383 for 0 .. 1.

function toValue(field, v14) {
    const n = FIELDS[field].steps;
    if (n) return v14 > n - 1 ? n - 1 : v14;
    return Math.fround(v14 / 16383);
}
function fromValue(field, v) {
    const n = FIELDS[field].steps;
    const i = n ? Math.trunc(Math.fround(v + 0.5)) : Math.trunc(Math.fround(Math.fround(v * 16383) + 0.5));
    return Math.max(0, Math.min(n ? n - 1 : 16383, i));
}

// a drag sends a value a frame at most per field (the last one wins)
const pending = new Map();
let flushing = false, channel = 0;
export const setChannel = c => { channel = c; };

export function sendField(field, v) {
    pending.set(field, v);
    if (flushing) return;
    flushing = true;
    requestAnimationFrame(() => {
        flushing = false;
        for (const [f, x] of pending) {
            const n = fromValue(f, x), st = 0xB0 | channel;
            sendEach([[st, 99, f >> 7], [st, 98, f & 127], [st, 6, n >> 7], [st, 38, n & 127]]);
            handlers.traffic("nrpn-out", f, x);
        }
        pending.clear();
    });
}

export function programChange(slot) {           // bank (CC 0 and 32) * 128 + program; bank 2 the user slots
    const bank = slot >= 256 ? 2 : slot >> 7, program = slot >= 256 ? slot - 256 : slot & 127, st = 0xB0 | channel;
    sendEach([[st, 0, bank], [st, 32, bank], [0xC0 | channel, program]]);
}

const sel = Array.from({ length: 16 }, () => ({ msb: 0, lsb: 0, on: false, data: 0 }));

// a SysEx can come in pieces (Firefox on Windows: midir passes each 1024-byte WinMM buffer on as it is): a piece
// from F0 without F7 is held, and the pieces after it (data bytes first) joined until the F7
let partial = null;
function sysex(data) {
    if (data[0] === 0xF0) partial = null;
    const joined = partial ? Uint8Array.from([...partial, ...data]) : data;
    if (joined[joined.length - 1] !== 0xF7) { partial = joined.length < 65536 ? joined : null; return; }
    partial = null;
    handlers.traffic("in", joined);
    handlers.sysex(joined);
}

function receive(data) {
    if (data[0] === 0xF0 || (partial && data[0] < 0x80)) { sysex(data); return; }
    if ((data[0] & 0xF0) === 0xB0 && data.length >= 3) nrpnCC(data[0] & 15, data[1], data[2]);   // (one message an event)
}

function nrpnCC(c, cc, v) {
    const s = sel[c];
    if (cc === 99) { s.msb = v; s.on = true; return; }
    if (cc === 98) { s.lsb = v; s.on = true; return; }
    if (cc === 101 || cc === 100) { s.on = false; return; }
    if (cc !== 6 && cc !== 38) return;
    if (!s.on || (s.msb === 127 && s.lsb === 127)) return;
    const f = s.msb * 128 + s.lsb;
    if (f >= FIELDS.length) return;
    if (cc === 6) {
        s.data = v;
        if (FIELDS[f].steps) return;            // (a list waits for the LSB)
    }
    const x = toValue(f, cc === 6 ? v << 7 : (s.data << 7) | v);
    handlers.traffic("nrpn-in", f, x);
    handlers.nrpn(f, x);
}
