// SPDX-License-Identifier: GPL-3.0-only
// The editor: finds the Magnetron on Web MIDI, reads its version, settings, preset names and edit buffer, and keeps
// the two in step. An edit here goes out as NRPN (the device's field numbers, on its Recv Ch); an edit on the
// panel comes in as NRPN, a setting changed there as SysEx 31.
import * as model from "./model.js";
import * as midi from "./midi.js";
import * as sysex from "./sysex.js";
import * as values from "./values.js";
import { PARAMS, paramOfField, STEP_FIELD } from "./params.js";
import { CATEGORIES } from "./data/fields.js";
import { soundFile, readSoundFile, download } from "./syxfile.js";
import { onTable, forget as forgetTables } from "./tables.js";
import { initSections } from "./ui/sections.js";
import { initMatrix } from "./ui/matrix.js";
import { initLayers } from "./ui/layers.js";
import { initFx } from "./ui/fx.js";
import { initPerform } from "./ui/perform.js";
import { initSettings } from "./ui/settings.js";
import { initLibrary, slotNumber } from "./ui/library.js";
import { startTooltips } from "./ui/tooltip.js";
import { ask, storeDialog } from "./ui/dialog.js";

const $ = id => document.getElementById(id);

// ---- status ----------------------------------------------------------------------------------------------------

function status(text, state = "") {
    $("status").textContent = text;
    $("dot").className = `dot ${state}`;
}

async function attempt(what, fn) {
    try { return await fn(); } catch (e) { status(e.message || `${what} failed.`, "err"); return undefined; }
}

// ---- rendering: once a frame at most ----------------------------------------------------------------------------

const settingsPut = pairs => attempt("Settings", async () => {
    await sysex.putSettings(pairs);
    model.setSettings(pairs, "ui");
});
const renders = [initLayers(), initSections(), initMatrix(), initFx(), initPerform(), initSettings(settingsPut)];
const library = initLibrary({ load, erase, importFile, exportFile });
let queued = false;
function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; renders.forEach(r => r()); top(); library.render(); });
}

$("cat").innerHTML = CATEGORIES.map((c, i) => `<option value="${i}">${c}</option>`).join("");
$("ch").innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i}">Ch ${i + 1}</option>`).join("");
function top() {
    if (document.activeElement !== $("nm")) $("nm").value = model.sound.name;
    $("cat").value = String(model.sound.category);
    $("edited").hidden = !model.sound.edited;
    const ok = model.device.connected;
    for (const id of ["get", "send", "store"]) $(id).disabled = !ok;
}
$("nm").addEventListener("input", () => model.setMeta($("nm").value, model.sound.category));
$("cat").addEventListener("change", () => model.setMeta(model.sound.name, +$("cat").value));

// the channel the editor sends on: the device's Recv Ch (with MPE on, channel 1, the zone's master); changeable
// here. (Its NRPN out comes on its Send Ch: any channel is taken.)
function channelFromSettings() {
    const c = model.settings.mpes ? 0 : model.settings.rchn ?? 0;
    $("ch").value = String(c);
    midi.setChannel(c);
}
$("ch").addEventListener("change", () => midi.setChannel(+$("ch").value));

// ---- the log line ----------------------------------------------------------------------------------------------

function describe(f, v) {
    const at = paramOfField(f);
    if (at) {
        const layer = at.layer >= 0 ? ` ${"ABCD"[at.layer]}` : "";
        return `NRPN ${f} <b>${PARAMS[at.p].name}${layer}</b> ${values.format(at.p, v)}`;
    }
    if (f >= STEP_FIELD && f < STEP_FIELD + 128) {
        const s = f - STEP_FIELD;
        return `NRPN ${f} <b>Step ${(s >> 2) + 1} ${["Pitch", "Velo", "Param 1", "Param 2"][s & 3]}</b>`;
    }
    return `NRPN ${f}`;
}
const logLine = (id, kind, f, v) => { $(id).innerHTML = `<span class="${kind}">${kind.toUpperCase()}</span> ${describe(f, v)}`; };

// ---- the model and MIDI -------------------------------------------------------------------------------------------

model.on("field", (f, origin) => {
    if (origin === "ui") { midi.sendField(f, model.field(f)); logLine("log-out", "out", f, model.field(f)); }
    else if (origin === "device") logLine("log-in", "in", f, model.field(f));
    schedule();
});
for (const e of ["sound", "meta", "view", "device"]) model.on(e, schedule);
model.on("settings", () => { channelFromSettings(); schedule(); });

midi.onMidi("nrpn", (f, v) => model.setField(f, v, "device"));
onTable(schedule);                                // (a wavetable arrived from the device)
midi.onMidi("sysex", data => sysex.receive(data));
midi.onMidi("ports", () => { ports(); connect(); });
sysex.onUnsolicited(m => {                        // a setting turned on the panel (ref 0)
    if (m[3] === sysex.ID.SETTINGS) model.setSettings(sysex.parseSettings(m), "device");
});

function ports() {
    const p = midi.ports(), sel = $("port");
    sel.replaceChildren(...(p.outputs.length ? p.outputs : ["No MIDI ports"]).map(n => new Option(n, n)));
    if (p.output) sel.value = p.output;
}
$("port").addEventListener("change", () => {
    const name = $("port").value, p = midi.ports();
    midi.usePorts(p.inputs.find(n => n === name) || p.inputs.find(n => n.startsWith(name.slice(0, 8))) || null, name);
});

let connecting = false;
async function connect() {
    if (!midi.ready()) {
        model.setDevice({ connected: false });
        status("No Magnetron found. Connect it by USB and pick its port.", "err");
        return;
    }
    if (connecting || model.device.connected) return;
    connecting = true;
    forgetTables();                               // (this build's tables, asked as they're shown)
    status("Connecting…", "busy");
    try {
        const version = await sysex.getVersion();
        model.setDevice({ connected: true, version });
        model.setSettings(await sysex.getSettings(), "device");
        status(`${version} · reading presets…`, "busy");
        model.setDevice({ names: await sysex.getNames() });
        const s = await sysex.getEditBuffer();
        model.loadSound(s.words, s.name, s.category, null);
        status(`${version} · USB`, "on");
    } catch (e) {
        model.setDevice({ connected: false });
        status(e.message, "err");
    } finally { connecting = false; }
}

// ---- actions ---------------------------------------------------------------------------------------------------

async function keepChanges(what) {             // true: go ahead (no edits, or the user lets them go)
    if (!model.sound.edited) return true;
    return (await ask("Discard changes?", `${model.sound.name} has changes that aren't stored. ${what} anyway?`, ["Cancel", what])) === 1;
}

async function load(slot) {
    if (!(await keepChanges("Load"))) return;
    await attempt("Load", async () => {
        midi.programChange(slot);                 // (the device plays it, as a program change from a keyboard would)
        const s = await sysex.getSlot(slot);
        model.loadSound(s.words, s.name, s.category, slot);
        library.reveal();
    });
}

async function erase(slot) {
    const e = model.device.names.get(slot);
    if (!e || (await ask("Delete preset?", `Delete ${slotNumber(slot)} ${e.name}? This can't be undone.`, ["Cancel", "Delete"])) !== 1) return;
    await attempt("Delete", async () => {
        await sysex.deleteSlot(slot);
        model.device.names.delete(slot);
        if (model.sound.slot === slot) model.sound.slot = null;
        model.setDevice({});
    });
}

async function importFile(file) {
    if (!(await keepChanges("Import"))) return;
    await attempt("Import", async () => {
        const s = readSoundFile(new Uint8Array(await file.arrayBuffer()));
        model.loadSound(s.words, s.name, s.category, null);
        model.sound.edited = true;
        if (model.device.connected) await sysex.sendEditBuffer(s.words, s.name, s.category);
        schedule();
    });
}

function exportFile() {
    const name = (model.sound.name || "Sound").replace(/[^\w\- ]+/g, "").trim() || "Sound";
    download(soundFile(model.sound.words, model.sound.name, model.sound.category), `${name}.syx`);
}

$("get").addEventListener("click", async () => {
    if (!(await keepChanges("Get"))) return;
    await attempt("Get", async () => {
        const s = await sysex.getEditBuffer();
        model.loadSound(s.words, s.name, s.category, null);
    });
});
$("send").addEventListener("click", () => attempt("Send", async () => {
    await sysex.sendEditBuffer(model.sound.words, model.sound.name, model.sound.category);
    status(`${model.device.version} · sent ${model.sound.name}`, "on");
}));
$("store").addEventListener("click", async () => {
    const r = await storeDialog();
    if (!r) return;
    await attempt("Store", async () => {
        await sysex.storeSlot(r.slot, model.sound.words, r.name, r.category);
        model.sound.name = r.name; model.sound.category = r.category;
        model.device.names.set(r.slot, { name: r.name, category: r.category });
        midi.programChange(r.slot);               // (the device on the stored preset, as the editor is)
        model.markSaved(r.slot);
        library.reveal();
        status(`${model.device.version} · stored ${slotNumber(r.slot)} ${r.name}`, "on");
    });
});

// ---- start -----------------------------------------------------------------------------------------------------

const head = document.querySelector(".top");     // (where the preset rail pins)
new ResizeObserver(() => document.documentElement.style.setProperty("--head", `${head.offsetHeight}px`)).observe(head);
addEventListener("resize", schedule);
document.fonts.ready.then(schedule);
startTooltips($("help"));
schedule();
midi.start().then(() => { ports(); connect(); }, e => status(e.message, "err"));
