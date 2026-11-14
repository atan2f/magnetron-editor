// SPDX-License-Identifier: GPL-3.0-only
// The effects' fields in their units (app/ui/fxunits.c), from the engine's own mappings.
import * as units from "./units.js";
import { P } from "./params.js";
import { REVERB_T60_MS } from "./data/fields.js";

const f = Math.fround;
const clip = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const power2 = e => f(Math.pow(2, e));

export function rateHz(p, v) {
    const c = clip(v);
    switch (p) {
    case P.CHSP: return f(f(f(c * c) * 19.999) + 0.001);
    case P.FLSP: return f(f(f(f(f(c * c) * c) * c) * 20) + 0.001);
    case P.PHSP: return f(f(f(c * c) * 5) + 0.01);
    case P.TRSP: return f(f(f(c * c) * 39.9) + 0.1);
    default: return 0;
    }
}

export function predelayMs(v) {
    const c = clip(v);
    let n = Math.trunc(f(f(c * 16370) * f(1 + c)));
    n = n > 32736 ? 32736 : n;
    return f(((n >> 4) * 16) / 44.1);
}

export function decayMs(v) { return REVERB_T60_MS[Math.trunc(f(f(clip(v) * 127) + 0.5))]; }

const ms = x => Math.trunc(f(x + 0.5));

// the value in its unit, or null (a field without one)
export function format(p, v) {
    const c = clip(v);
    switch (p) {
    case P.CHSP: case P.FLSP: case P.PHSP: case P.TRSP: return units.hz(rateHz(p, v));
    case P.CHDP: return units.time(ms(f(f(f(f(c * c) * c) * 882) / 44.1)));
    case P.CHCE: return units.time(ms(f(f(f(c * c) * 8820) / 44.1)));
    case P.FLCE: return units.time(ms(f(f(f(f(c * c) * 1102.5) + 1) / 44.1)));
    case P.FLPD: case P.PHPD: case P.TRPD: return units.degrees(f(c * 360));
    case P.DRGA: return units.db(f(f(c * 40) - 20));
    case P.CPRA: return units.ratio(f(f(f(f(c * c) * c) * 99) + 1));
    case P.CPTH: return units.db(f(f(1 - c) * -50));
    case P.CPIG: case P.CPOG: return units.db(f(f(c * 60) - 30));
    case P.CPAT: return units.time(ms(f(c * 200)));
    case P.CPRL: return units.time(ms(f(c * 2000)));
    case P.CPLA: return units.time(ms(f((Math.trunc(f(c * 87)) & ~3) / 44.1)));
    case P.EQGA: case P.EQLG: case P.EQMG: case P.EQNG: case P.EQHG: return units.db(f(f(c - 0.5) * 40));
    case P.EQLF: return units.hz(power2(f(f(c * 3.906890392303467) + 4.906890392303467)));
    case P.EQMF: case P.EQNF: return units.hz(power2(f(f(c * 5.129283905029297) + 7.643856048583984)));
    case P.EQHF: return units.hz(power2(f(f(c * 3.7369632720947266) + 10.55074691772461)));
    case P.EQMQ: case P.EQNQ: return units.decimal(power2(f(f(c * 7.321928024291992) - 3.321928024291992)));
    case P.RVPD: return units.time(ms(predelayMs(v)));
    case P.RVTI: return units.time(decayMs(v));
    default: return null;
    }
}
