// SPDX-License-Identifier: GPL-3.0-only
// The editor's state: the sound (its 561 field words, name, category), the layer the panels show, the sequencer
// step they edit, the device's settings. Changes go to listeners with where they came from ("ui": the editor's
// own controls, sent on to the device; "device": what came in, left there; "load": a whole sound).
import { FIELDS, P, fieldOf, STEP_FIELD } from "./params.js";
import { indexAt } from "./values.js";

const listeners = new Map();
export function on(event, fn) { (listeners.get(event) || listeners.set(event, []).get(event)).push(fn); }
function emit(event, ...args) { for (const fn of listeners.get(event) || []) fn(...args); }

export const sound = { words: new Float32Array(FIELDS.length), name: "Init", category: 0, edited: false, slot: null };
export const view = { layer: 0, step: 0 };
export const settings = {};                     // tag -> number, as the device last told
export const device = { connected: false, version: "", names: new Map() };   // slot -> {name, category}

export function resetSound() { FIELDS.forEach((fl, i) => { sound.words[i] = fl.def; }); }
resetSound();

export const field = index => sound.words[index];
export const value = p => sound.words[fieldOf(p, view.layer)];
export const valueIn = (p, layer) => sound.words[fieldOf(p, layer)];
export const stepValue = (step, k) => sound.words[STEP_FIELD + 4 * step + k];

export function setField(index, v, origin) {
    const was = sound.words[index];
    sound.words[index] = v;
    if (sound.words[index] === was) return;
    if (origin !== "load") sound.edited = true;
    emit("field", index, origin);
}
export const setParam = (p, v, origin) => setField(fieldOf(p, view.layer), v, origin);

export function loadSound(words, name, category, slot) {
    sound.words.set(words);
    sound.name = name; sound.category = category; sound.edited = false; sound.slot = slot;
    emit("sound");
}
export function setMeta(name, category) {
    sound.name = name; sound.category = category; sound.edited = true;
    emit("meta");
}
export function markSaved(slot) { sound.edited = false; sound.slot = slot; emit("meta"); }

// the layer the panels show and edit; while the patch plays one layer alone (Solo), that's the one (main.c
// show_layer: Play follows)
export function showLayer(layer) {
    if (layer === view.layer) return;
    view.layer = layer;
    emit("view");
    if (value(P.LYMD) < 3.5) setParam(P.LYMD, layer, "ui");
}
export function showStep(step) { view.step = step; emit("view"); }

export function setSettings(pairs, origin) {
    Object.assign(settings, pairs);
    emit("settings", origin);
}
export function setDevice(changes) { Object.assign(device, changes); emit("device"); }

export const seqLength = () => indexAt(P.SQLN, value(P.SQLN)) + 1;
export const listen = emit;                     // (other modules' events through the same hub)
