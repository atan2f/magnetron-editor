// SPDX-License-Identifier: GPL-3.0-only
// node editor/test/arrange.test.mjs: the staged arrangement's moves (js/arrange.js) and a file of several sounds
// read back (js/syxfile.js).
import assert from "node:assert/strict";
import { Arrangement, entryOf } from "../js/arrange.js";
import { soundsFile, readSounds } from "../js/syxfile.js";
import { FIELDS } from "../js/params.js";

const BASE = 256;
const device = layout => new Map([...layout].flatMap((c, i) => (c === "-" ? [] : [[BASE + i, { name: c, category: 0 }]])));
const made = layout => { const a = new Arrangement(layout.length, BASE); a.reset(device(layout)); return a; };
const shape = a => a.slots.map(e => (e ? e.name : "-")).join("");

{   // the mockup's move: three presets up three places; the ones in the way take the places they left
    const names = device("A-CDEFGHIJ---"), a = made("A-CDEFGHIJ---");
    assert.equal(a.move([5, 6, 7], 2), 2);
    assert.equal(shape(a), "A-FGHCDEIJ---");
    assert.deepEqual(a.changes(names), [2, 3, 4, 5, 6, 7]);
}
{   // down: the presets between close up into the place it left
    const a = made("ABCDE---");
    assert.equal(a.move([1], 4), 3);
    assert.equal(shape(a), "ACDBE---");
}
{   // down past the last one: the same, the empty slots after it untouched
    const names = device("ABCDE---"), a = made("ABCDE---");
    assert.equal(a.move([1], 5), 4);
    assert.equal(shape(a), "ACDEB---");
    assert.deepEqual(a.changes(names), [1, 2, 3, 4]);
}
{   // across empty slots: a nearer empty slot takes the push, the presets on the way stay where they are
    const a = made("AB--CD-");
    assert.equal(a.move([0], 5), 5);
    assert.equal(shape(a), "-B--CAD");
}
{   // one from each side of the place: both gaps used
    const a = made("ABCDEF");
    assert.equal(a.move([0, 5], 3), 2);
    assert.equal(shape(a), "BCAFDE");
}
{   // new sounds: the presets after the place move only as far as the empty slots reach
    const a = made("AB-C-DEF--");
    const at = a.insert([entryOf({ name: "x", category: 1 }), entryOf({ name: "y", category: 1 })], 1);
    assert.equal(at, 1);
    assert.equal(shape(a), "AxyBCDEF--");
}
{   // more than there are empty slots: refused, nothing moved
    const a = made("AB-C");
    assert.equal(a.insert([entryOf({ name: "x" }), entryOf({ name: "y" })], 0), -1);
    assert.equal(shape(a), "AB-C");
    assert.equal(a.free(), 1);
}
{   // at the end: back into the empty slots before it
    const a = made("A-B-");
    assert.equal(a.insert([entryOf({ name: "x" }), entryOf({ name: "y" })], 4), 2);
    assert.equal(shape(a), "ABxy");
}
{   // a delete is a change; a preset moved away and back is none
    const names = device("AB-"), a = made("AB-");
    a.remove([0]);
    assert.deepEqual(a.changes(names), [0]);
    const b = made("AB-");
    b.move([0], 3);
    b.move([2], 0);
    assert.deepEqual(b.changes(names), []);
}
{   // onto a slot: an empty one filled, a used one replaced, several each to the next slot
    const names = device("ABC-E"), a = made("ABC-E");
    assert.equal(a.take([0], 3), 3);
    assert.equal(shape(a), "-BCAE");
    assert.deepEqual(a.lost(names), []);
    assert.equal(a.take([1], 4), 4);
    assert.equal(shape(a), "--CAB");
    assert.deepEqual(a.lost(names), [BASE + 4]);
    const b = made("ABCDEF");
    assert.equal(b.take([0, 1], 4), 4);
    assert.equal(shape(b), "--CDAB");
    const c = made("ABCDEF");                   // (onto slots it partly holds already)
    assert.equal(c.take([1, 2], 2), 2);
    assert.equal(shape(c), "A-BCEF");
    assert.equal(c.take([4, 5], 5), -1);
    assert.equal(shape(c), "A-BCEF");
}
{   // onto a slot from outside: what it held is replaced
    const a = made("AB-D");
    assert.equal(a.replace([entryOf({ name: "x" }), entryOf({ name: "y" })], 1), 1);
    assert.equal(shape(a), "AxyD");
    assert.equal(a.replace([entryOf({ name: "z" }), entryOf({ name: "w" })], 3), -1);
}
{   // the presets an apply would end: deleted or replaced ones; a moved one is none
    const names = device("ABCD-"), a = made("ABCD-");
    a.move([0], 5);
    assert.deepEqual(a.lost(names), []);
    a.remove([3]);
    a.replace([entryOf({ name: "x" })], 1);
    assert.deepEqual(a.lost(names), [BASE + 1, BASE + 3]);
}
{   // several sounds in a file, with and without their slots
    const words = k => Float32Array.from(FIELDS, (f, i) => (i === k ? 0.25 : f.def));
    const got = readSounds(soundsFile([{ words: words(3), name: "One", category: 2, slot: 300 }, { words: words(9), name: "Two", category: 5, slot: null }]));
    assert.equal(got.length, 2);
    assert.deepEqual([got[0].name, got[0].category, got[0].slot, got[1].name, got[1].slot], ["One", 2, 300, "Two", null]);
    assert.deepEqual([...got[0].words], [...words(3)]);
    assert.deepEqual([...got[1].words], [...words(9)]);
}
console.log("ok");
