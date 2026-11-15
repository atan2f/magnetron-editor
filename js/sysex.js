// SPDX-License-Identifier: GPL-3.0-only
// Magnetron's SysEx (app/sysex.h): F0 7D 4D dev id ref <payload> cks F7, cks = (sum 7D .. last payload) & 7F;
// a 32-bit word as 5 bytes of 7 bits; a field its tag word and its value word (the float's bits).
// One request at a time: each waits for its answer (a dump's parts, the names' parts, a 0F) before the next.
import { FIELDS, FIELD } from "./params.js";
import { sendSysex } from "./midi.js";

export const ID = { SOUND: 0x10, GET: 0x11, GET_SLOT: 0x12, STORE: 0x13, DELETE: 0x14, NAMES: 0x20, NAMES_REPLY: 0x21,
    SETTINGS_GET: 0x30, SETTINGS: 0x31, TABLE: 0x50, TABLE_REPLY: 0x51, VERSION: 0x40, VERSION_REPLY: 0x41, RESPONSE: 0x0F };
export const CODES = ["ok", "empty slot", "bad slot", "checksum", "out of order", "bad part", "bad request", "busy"];
export const SLOTS = 384, USER = 256, USER_SLOTS = 128;
const MODEL = 0x4D, VERSION = 1, PER = 98, NAME = 24, TIMEOUT = 1000;

export const put5 = w => [(w >>> 28) & 127, (w >>> 21) & 127, (w >>> 14) & 127, (w >>> 7) & 127, w & 127];
export const get5 = (m, i) => ((m[i] << 28) | (m[i + 1] << 21) | (m[i + 2] << 14) | (m[i + 3] << 7) | m[i + 4]) >>> 0;
const view = new DataView(new ArrayBuffer(4));
const bitsOf = v => { view.setFloat32(0, v); return view.getUint32(0); };
const floatOf = w => { view.setUint32(0, w); return view.getFloat32(0); };
export const tagWord = s => ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
export const tagText = w => String.fromCharCode(w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
const TAG_WORDS = FIELDS.map(f => tagWord(f.tag));
const INDEX_OF_WORD = new Map(TAG_WORDS.map((w, i) => [w, i]));

let ref = Math.floor(Math.random() * 128);         // (apart from the device's own count: a 0F is matched by ref)
export function message(id, payload, r = ++ref & 127) {
    const body = [0x7D, MODEL, 0, id, r, ...payload];
    const cks = body.reduce((a, b) => a + b, 0) & 127;
    return Uint8Array.from([0xF0, ...body, cks, 0xF7]);
}

// a received message's bytes between F0 and F7 (m[0] 7D .. m[n - 1] the checksum), or null (another device's, or corrupt)
export function unwrap(data) {
    if (data.length < 8 || data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) return null;
    const m = data.subarray(1, data.length - 1);
    if (m[0] !== 0x7D || m[1] !== MODEL) return null;
    let s = 0;
    for (let i = 0; i + 1 < m.length; ++i) s += m[i];
    return (s & 127) === m[m.length - 1] ? m : null;
}

const nameBytes = name => { const b = new Array(NAME).fill(0); [...name].slice(0, NAME).forEach((c, i) => { b[i] = c.charCodeAt(0) & 127; }); return b; };
const nameOf = (m, at) => { let s = ""; for (let i = 0; i < NAME && m[at + i]; ++i) s += String.fromCharCode(m[at + i]); return s; };

// a sound as dump messages (10 to the edit buffer, 13 to a user slot)
export function dumpMessages(words, name, category, slot = null) {
    const total = Math.ceil(FIELDS.length / PER), out = [], r = ++ref & 127;
    for (let part = 1, f = 0; part <= total; ++part) {
        const p = slot === null ? [] : [slot >> 7, slot & 127];
        p.push(total, part);
        if (part === 1) p.push(VERSION, category & 127, ...nameBytes(name));
        for (let i = 0; i < PER && f < FIELDS.length; ++i, ++f) p.push(...put5(TAG_WORDS[f]), ...put5(bitsOf(words[f])));
        out.push(message(slot === null ? ID.SOUND : ID.STORE, p, r));
    }
    return out;
}

// a dump being received (10s, or 13s from a file): parts in order, part 1 resets to the defaults
export class DumpReader {
    constructor() { this.words = null; }
    // m unwrapped; true when the dump is complete
    add(m) {
        let at = m[3] === ID.STORE ? 7 : 5;
        const total = m[at], part = m[at + 1];
        at += 2;
        if (part === 1) {
            this.words = Float32Array.from(FIELDS, f => f.def);
            this.category = m[at + 1]; this.name = nameOf(m, at + 2); this.part = 0;
            this.slot = m[3] === ID.STORE ? (m[5] << 7) | m[6] : null;
            at += 2 + NAME;
        }
        if (!this.words || part !== this.part + 1) throw new Error("A sound dump arrived out of order.");
        this.part = part;
        for (; at + 10 <= m.length - 1; at += 10) {
            const f = INDEX_OF_WORD.get(get5(m, at));
            if (f !== undefined) this.words[f] = floatOf(get5(m, at + 5));
        }
        return part >= total;
    }
}

// ---- requests ------------------------------------------------------------------------------------------------

const queue = [];
let current = null, unsolicited = () => {};
export const onUnsolicited = fn => { unsolicited = fn; };

// send messages, then feed each reply to accept(m): it returns true when the request is done, false to wait for
// more, undefined if the message isn't its; a 0F for one of its messages with a code other than 0 fails it.
// makeAccept() makes the request's accept.
function request(messages, makeAccept) {
    return new Promise((resolve, reject) => {
        queue.push({ messages, makeAccept, resolve, reject, ref: messages[0][5] });
        if (!current) next();
    });
}

function next() {
    current = queue.shift() || null;
    if (!current) return;
    const c = current;
    c.accept = c.makeAccept();
    c.pending = c.accept.paced ? c.messages.slice(1) : [];
    send(c.accept.paced ? [c.messages[0]] : c.messages);
}

function send(msgs) {
    for (const msg of msgs) if (!sendSysex(msg)) { fail(new Error("The Magnetron isn't connected.")); return; }
    arm();
}

function arm() {
    clearTimeout(current.timer);
    current.timer = setTimeout(() => fail(new Error("The Magnetron didn't answer. Is it connected by USB?")), TIMEOUT);
}

function fail(err) { const c = current; clearTimeout(c.timer); c.reject(err); next(); }
function done(value) { const c = current; clearTimeout(c.timer); c.resolve(value); next(); }

export function receive(data) {
    const m = unwrap(data);
    if (!m) return;
    if (current) {
        const response = m[3] === ID.RESPONSE;
        if (response && m[4] !== current.ref) { unsolicited(m); return; }   // (a 0F for a message not ours)
        if (response && ((m[5] << 7) | m[6]) !== 0) { fail(new Error(`The Magnetron answered: ${CODES[(m[5] << 7) | m[6]] || "error"}.`)); return; }
        let r;
        try { r = current.accept(m, current); } catch (e) { fail(e); return; }
        if (r === true) { done(current.value); return; }
        if (r === false) { arm(); return; }
    }
    unsolicited(m);
}

// each part of a dump to the device waits for its 0F
function paced() {
    const accept = (m, c) => {
        if (m[3] !== ID.RESPONSE) return undefined;
        if (!c.pending.length) return true;
        send([c.pending.shift()]);
        return null;                              // (send() armed the timer)
    };
    accept.paced = true;
    return accept;
}

function readDump() {
    const reader = new DumpReader();
    return (m, c) => {
        if (m[3] !== ID.SOUND) return undefined;
        if (reader.add(m)) { c.value = { words: reader.words, name: reader.name, category: reader.category }; return true; }
        return false;
    };
}

export const getEditBuffer = () => request([message(ID.GET, [])], readDump);
export const getSlot = slot => request([message(ID.GET_SLOT, [slot >> 7, slot & 127])], readDump);
export const sendEditBuffer = (words, name, category) => request(dumpMessages(words, name, category), paced);
export const storeSlot = (slot, words, name, category) => request(dumpMessages(words, name, category, slot), paced);
export const deleteSlot = slot => request([message(ID.DELETE, [slot >> 7, slot & 127])], () => m => (m[3] === ID.RESPONSE ? true : undefined));

export function getNames(start = 0, count = SLOTS) {
    return request([message(ID.NAMES, [start >> 7, start & 127, count >> 7, count & 127])], () => (m, c) => {
        if (m[3] !== ID.NAMES_REPLY) return undefined;
        const total = m[5], part = m[6];
        let slot = (m[7] << 7) | m[8];
        c.value = c.value || new Map();
        for (let at = 9; at + 32 <= m.length - 1; at += 32, ++slot) {
            const name = nameOf(m, at);
            if (name) c.value.set(slot, { name, category: m[at + NAME] });
        }
        return part >= total;
    });
}

// a wavetable as an oscillator's Table at position (0..63) plays it: {name, halves: 64 frames x 64 bytes, the
// engine's half frames}; the bytes come in groups of 7 after a byte of their high bits
export function getTable(position) {
    return request([message(ID.TABLE, [position & 63])], () => (m, c) => {
        if (m[3] !== ID.TABLE_REPLY || m[7] !== position) return undefined;
        const total = m[5], part = m[6], first = m[8], count = m[9];
        c.value = c.value || { name: nameOf(m.subarray(0, 26), 10), halves: new Uint8Array(64 * 64) };
        let at = 26;
        for (let f = first; f < first + count && f < 64; ++f)
            for (let i = 0; i < 64; i += 7) {
                const g = Math.min(7, 64 - i), high = m[at++];
                for (let b = 0; b < g; ++b) c.value.halves[f * 64 + i + b] = m[at++] | (((high >> b) & 1) << 7);
            }
        return part >= total;
    });
}

export function getVersion() {
    return request([message(ID.VERSION, [])], () => (m, c) => {
        if (m[3] !== ID.VERSION_REPLY) return undefined;
        c.value = nameOf(m.subarray(0, 21), 5);      // (16 bytes of text)
        return true;
    });
}

// settings: {tag: number}
export const parseSettings = m => {
    const out = {};
    for (let at = 5; at + 10 <= m.length - 1; at += 10) out[tagText(get5(m, at))] = get5(m, at + 5);
    return out;
};
export function getSettings() {
    return request([message(ID.SETTINGS_GET, [])], () => (m, c) => {
        if (m[3] !== ID.SETTINGS) return undefined;
        c.value = parseSettings(m);
        return true;
    });
}
export function putSettings(pairs) {
    const p = [];
    for (const [tag, v] of Object.entries(pairs)) p.push(...put5(tagWord(tag)), ...put5(v >>> 0));
    return request([message(ID.SETTINGS, p)], () => m => (m[3] === ID.RESPONSE ? true : undefined));
}

export const isUser = slot => slot >= USER && slot < USER + USER_SLOTS;
export { FIELD };
