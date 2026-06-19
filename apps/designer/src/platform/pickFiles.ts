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
 */
export function pickFiles(kind?: 'image' | 'font' | 'lottie' | 'video'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (kind === 'image') input.accept = 'image/*';
    else if (kind === 'font')
      input.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    else if (kind === 'lottie') input.accept = 'application/json,.json';
    else if (kind === 'video') input.accept = 'video/*';

    let settled = false;
    function settle(files: File[]): void {
      if (settled) return;
      settled = true;
      resolve(files);
    }

    // Both listeners are `{ once: true }`; the `settled` guard makes whichever fires
    // first win and the other a no-op. Once the picker closes either way the
    // detached <input>, its listeners and this promise are all collectable.
    input.addEventListener(
      'change',
      () => settle(input.files !== null ? Array.from(input.files) : []),
      { once: true },
    );
    input.addEventListener('cancel', () => settle([]), { once: true });
    input.click();
  });
}
