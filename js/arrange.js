// SPDX-License-Identifier: GPL-3.0-only
// The user slots as the editor arranges them before anything is sent: each slot empty (null) or an entry
// {name, category, from, words}: from the device slot whose preset it is (a user slot, or a factory preset copied
// in; null once it's only here), words its 561 fields when the editor holds them (a file's sound, or one read for
// the sending). A slot differs from the device's when its entry isn't that slot's own preset.
// Presets dropped between two slots push their neighbours along only as far as the nearest empty slots; dropped
// onto a slot they take it, replacing what it held.

export class Arrangement {
    constructor(count, base) { this.count = count; this.base = base; this.slots = new Array(count).fill(null); }

    // as the device has them: names a Map of slot -> {name, category}
    reset(names) {
        for (let i = 0; i < this.count; ++i) {
            const e = names.get(this.base + i);
            this.slots[i] = e ? { name: e.name, category: e.category, from: this.base + i, words: null } : null;
        }
    }

    changed(i, names) {
        const e = this.slots[i];
        return e ? e.from !== this.base + i : names.has(this.base + i);
    }
    changes(names) { return this.slots.map((_, i) => i).filter(i => this.changed(i, names)); }
    free() { return this.slots.filter(e => !e).length; }
    // the device's user presets that are in no slot here: gone once this is applied
    lost(names) {
        const kept = new Set(this.slots.filter(Boolean).map(e => e.from));
        return [...names.keys()].filter(s => s >= this.base && s < this.base + this.count && !kept.has(s));
    }

    // entries put in at the boundary before index at (0 .. count), in their order; the presets in the way move
    // towards the nearest empty slots: the side (or both) that takes up the most of the slots in prefer (the ones
    // a move just left: a list's reorder), then the fewest slots moved. The index the first one landed on, or -1
    // (not that many empty slots: nothing changed)
    insert(entries, at, prefer = []) {
        const k = entries.length, s = this.slots, fwd = [], back = [];
        if (!k) return at;
        for (let i = at; i < this.count; ++i) if (!s[i]) fwd.push(i);
        for (let i = at - 1; i >= 0; --i) if (!s[i]) back.push(i);
        let best = null;
        for (let f = 0; f <= k; ++f) {
            if (f > fwd.length || k - f > back.length) continue;
            const end = f ? fwd[f - 1] : at - 1, start = k - f ? back[k - f - 1] : at;
            const kept = prefer.filter(i => i >= start && i <= end).length;
            if (!best || kept > best.kept || (kept === best.kept && end - start <= best.end - best.start)) best = { start, end, kept };
        }
        if (!best) return -1;
        const before = s.slice(best.start, at).filter(Boolean), after = s.slice(at, best.end + 1).filter(Boolean);
        [...before, ...entries, ...after].forEach((e, i) => { s[best.start + i] = e; });
        return best.start + before.length;
    }

    // the presets at these indices taken out and put in at the boundary before index at, in slot order
    move(indices, at) {
        const order = [...indices].sort((a, b) => a - b).filter(i => this.slots[i]);
        const entries = order.map(i => this.slots[i]);
        for (const i of order) this.slots[i] = null;
        return this.insert(entries, at, order);
    }

    // the presets at these indices taken out and put onto the slots from index at (one each, in slot order),
    // whatever those held; the slots they left are empty. The index at, or -1 (past the last slot)
    take(indices, at) {
        const from = [...indices].sort((a, b) => a - b).filter(i => this.slots[i]);
        if (at + from.length > this.count) return -1;
        const entries = from.map(i => this.slots[i]);
        for (const i of from) this.slots[i] = null;
        return this.replace(entries, at);
    }
    // entries onto the slots from index at, whatever those held. The index at, or -1 (past the last slot)
    replace(entries, at) {
        if (at + entries.length > this.count) return -1;
        entries.forEach((e, n) => { this.slots[at + n] = e; });
        return at;
    }

    remove(indices) { for (const i of indices) this.slots[i] = null; }
    put(i, entry) { this.slots[i] = entry; }
}

export const entryOf = (sound, from = null) => ({ name: sound.name, category: sound.category, from, words: sound.words || null });
