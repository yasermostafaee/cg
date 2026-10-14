import { acceptAttr, type PickKind } from '../shared/asset-types.js';

/**
 * D-067 / B-020 — open a multi-select file picker; resolves to the chosen files,
 * or `[]` when the picker is dismissed.
 *
 * A real selection settles via the input's `change` event. Cancellation settles
 * `[]` via the input's `cancel` event, which fires on dialog dismiss in every
 * browser the app targets (Chromium 113+, Firefox 91+, Safari 16.4+ — the same
 * matrix the File System Access fallbacks assume). `change` does NOT fire on
 * cancel, so without `cancel` the awaiting `pick()` — plus the detached `<input>`,
 * its listener and this promise — would leak on every open+cancel (the freeze
 * bug, D-069).
 *
 * Cancel-detection is `cancel` ALONE. An earlier fix paired it with an
 * UNCONDITIONAL 400ms window-focus fallback that resolved `[]`; on a real
 * selection the dialog's close fired `focus` first, and when its 400ms timer beat
 * the slightly-later `change`, it resolved `[]` and dropped the picked files — so
 * adding an image failed intermittently ("works after a few tries"), B-020. With
 * `cancel` handling dismissal there is nothing left to detect by timing, so the
 * race source is removed entirely: nothing pre-empts `change`.
 *
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-G` — **AND THE INPUT IS HELD UNTIL IT SETTLES.** It is never
 * attached to the document, and Chrome's open dialog does not keep it alive: with nothing else
 * referring to it, the collector could take it WHILE THE DIALOG WAS OPEN — and then neither `change`
 * nor `cancel` ever fired and the pick never settled. Nothing happened, no message: exactly the
 * owner's ten-frame multi-select and his folder pick, which give the collector seconds a quick
 * single pick does not (measured: a forced collection during an open chooser leaves "no node for
 * the backend id", `picker-held-input.spec.ts`). {@link PENDING} holds each input until its pick
 * settles either way.
 */
const PENDING = new Set<HTMLInputElement>();

export function pickFiles(
  kind?: PickKind,
  opts: { folder?: boolean; accept?: string } = {},
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // D-163 — a whole FOLDER of pictures (a book's pages) in one pick. The browser hands back
    // every file under it; the caller filters to the kind and orders them naturally.
    if (opts.folder === true) input.webkitdirectory = true;
    // D-128 — the video import modal is inherently ONE clip at a time (crop, fps
    // warning, progress, duplicate step), so the video picker is single-select so
    // the UI can't promise a batch it won't import. Every other kind stays
    // multi-select (image/font/lottie import as a batch).
    input.multiple = kind !== 'video';
    // `accept` is only a hint — bypassable via "All files". The selection is enforced
    // after the fact against the SAME source of truth (see partitionSupported, B-021).
    if (kind !== undefined) input.accept = acceptAttr(kind);
    // D-164 — an image sequence's PNG / TGA frames: a hint no kind gives.
    else if (opts.accept !== undefined) input.accept = opts.accept;

    let settled = false;
    function settle(files: File[]): void {
      if (settled) return;
      settled = true;
      PENDING.delete(input);
      resolve(files);
    }
    PENDING.add(input);

    // Both listeners are `{ once: true }`; the `settled` guard makes whichever fires
    // first win and the other a no-op. Once the picker closes either way the
    // <input> leaves PENDING, and it, its listeners and this promise are collectable.
    input.addEventListener(
      'change',
      () => settle(input.files !== null ? Array.from(input.files) : []),
      { once: true },
    );
    input.addEventListener('cancel', () => settle([]), { once: true });
    input.click();
  });
}
