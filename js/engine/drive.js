// SPDX-License-Identifier: GPL-3.0-only
// The drive shaper (protein-fm1/src/protein_drive.c shape_channel, through pfm1_drive_channel's record
// {gain, amount, previous, curve}), for the drive views.
import { DRIVE_CURVES } from "../data/engine.js";

const f = Math.fround;
const fma = (a, b, c) => f(a * b + c);

export const driveCurveGain = curve => DRIVE_CURVES[curve > 4 ? 4 : curve];

// record: {gain, amount, previous, curve}; samples shaped in place
export function driveChannel(record, samples) {
    const amount = record.amount, k = f(f(amount * amount) * 128), gain = record.gain, bridge = f(f(amount - 0.125) * -8);
    const mode = record.curve, extra = [];
    if (amount < 0.125) for (let i = 0; i < samples.length; ++i) extra[i] = f(samples[i] * bridge);
    for (let i = 0; i < samples.length; ++i) {
        const x = samples[i];
        let u, y;
        if (mode === 3) {
            u = f(k * x); if (u < -1) u = -1;
            y = fma(u, 2, f(u * u)); if (y > 1) y = 1; y = f(y * gain);
        } else {
            const previous = record.previous;
            record.previous = x;
            if (mode === 1) {
                u = fma(f(x + previous), k, 0.7070000171661377);
                y = u <= 0 ? -gain : u >= 1 ? gain : f(f(gain + gain) * fma(u, u, -0.5));
            } else if (mode === 2) {
                u = fma(f(x + previous), k, 0.7070000171661377); u = fma(u, u, -0.5); if (u > 0.5) u = 0.5;
                y = f(f(gain * 4) * fma(-u, Math.abs(u), u));
            } else if (mode === 4) {
                u = f(f(x + previous) * k); u = f(u - Math.trunc(u)); if (u < 0) u = f(u + 1);
                u = fma(u, 2, -1); y = f(f(gain + gain) * fma(-Math.abs(u), u, u));
            } else {
                u = f(f(x + previous) * k);
                if (u < -1) y = -1;
                else if (u < 0) y = fma(u, 2, f(u * u));
                else if (u > 1) y = 1;
                else y = fma(-u, u, f(u + u));
                y = f(y * gain);
            }
        }
        samples[i] = y;
    }
    if (amount < 0.125) for (let i = 0; i < samples.length; ++i) samples[i] = f(samples[i] + extra[i]);
}
