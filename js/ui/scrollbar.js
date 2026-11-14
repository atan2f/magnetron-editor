// SPDX-License-Identifier: GPL-3.0-only
// A list's own thin scroll bar in a column beside it (the native one is hidden: Windows draws it over the text):
// the thumb follows the list; drag it, or click the track to move a page.
export function attachScrollbar(list, track, thumb) {
    const sync = () => {
        const h = list.clientHeight, sh = list.scrollHeight, th = track.clientHeight;
        track.hidden = sh <= h + 1;
        const len = Math.max(24, th * h / sh);
        thumb.style.height = `${len}px`;
        thumb.style.top = `${sh > h ? (th - len) * list.scrollTop / (sh - h) : 0}px`;
    };
    list.addEventListener("scroll", sync);
    new ResizeObserver(sync).observe(list);
    new MutationObserver(sync).observe(list, { childList: true });
    thumb.addEventListener("pointerdown", e => {
        e.preventDefault(); e.stopPropagation();
        thumb.setPointerCapture(e.pointerId); thumb.classList.add("drag");
        const y0 = e.clientY, s0 = list.scrollTop;
        const move = m => {
            const free = track.clientHeight - thumb.offsetHeight;
            list.scrollTop = s0 + (m.clientY - y0) * (list.scrollHeight - list.clientHeight) / (free || 1);
        };
        const up = () => { thumb.classList.remove("drag"); thumb.removeEventListener("pointermove", move); thumb.removeEventListener("pointerup", up); };
        thumb.addEventListener("pointermove", move); thumb.addEventListener("pointerup", up);
    });
    track.addEventListener("pointerdown", e => {
        if (e.target !== track) return;
        list.scrollBy({ top: (e.offsetY < thumb.offsetTop ? -1 : 1) * list.clientHeight * 0.9 });
    });
    return sync;
}
