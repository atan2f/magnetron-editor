// SPDX-License-Identifier: GPL-3.0-only
// The effects' dB-to-gain table lookup (protein-fm1/src/protein_math.c pfm1_fx_gain).
import { FX_GAIN } from "../data/engine.js";

const f = Math.fround;

export function fxGain(db) {
    const coordinate = f(f(f(db - -200) / 300) * 1024);
    if (coordinate < 0) return FX_GAIN[0];
    if (coordinate >= 1023) return FX_GAIN[1023];
    const index = Math.trunc(coordinate), fraction = f(coordinate - index);
    return f(FX_GAIN[index] * f(1 - fraction) + f(fraction * FX_GAIN[index + 1]));
}
