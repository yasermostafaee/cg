import { useState, type CSSProperties } from 'react';
import {
  PAGE_MAX_BYTES,
  PAGES_MAX_PER_ROW,
  REFERENCE_RASTER,
  pageRefusalMessage,
} from '@cg/shared-ipc';
import type { FieldValue } from '@cg/shared-schema';
import { naturalCompare } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Notice } from '../../ui/Notice.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { rememberPicture } from '../book/pagePictures.js';
import { fitLine, fitPicture, type Raster } from '../book/fitPicture.js';
import { bookPagesOf, withPicturesReplaced } from '../book/bookPages.js';

/**
 * `R-100` — **A ROW'S BOOK: the operator loads its pages as pictures.**
 *
 * In place of the list editor for a `list` field the author marked as a page list. `Load
 * pictures…` takes many files and `Load folder…` a whole folder; the files are put in natural
 * order (the one comparison the Designer uses too), each is FITTED to the row's channel
 * (`RUN-NEXT-VERSION-03` 1.2 — `fitPicture`: scaled to the frame, re-encoded under the cap, never
 * refused for being large) and sent to CG Bridge one at a time. One line says what fitting did; only
 * a picture still over the cap after fitting — or one that is not a picture — is refused, by name,
 * and the others load. The resulting page list STAGES like any field value — the operator applies it
 * with Update — and names each picture by the hash the bridge answered. Labels, a count, progress and
 * those lines: nothing else is said.
 */
const PICTURE_EXT = /\.(png|jpe?g|webp)$/i;

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.35rem' } satisfies CSSProperties,
};

/** A page list value's length; with no value yet, the template's own pages. */
function countOf(value: FieldValue | undefined, defaults: readonly unknown[]): number {
  return Array.isArray(value) ? value.length : defaults.length;
}

function orderName(file: File): string {
  return file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name;
}

/** Open the browser's own picker: many files, or one folder. `[]` when dismissed. */
function pickPictures(folder: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (folder) input.webkitdirectory = true;
    else input.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
    let settled = false;
    const settle = (files: File[]): void => {
      if (settled) return;
      settled = true;
      resolve(files);
    };
    input.addEventListener('change', () => settle(input.files === null ? [] : [...input.files]), {
      once: true,
    });
    input.addEventListener('cancel', () => settle([]), { once: true });
    input.click();
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** `notes.png, b.png` — the operator's own file names, in the order they were picked. */
function namesOf(names: readonly string[]): string {
  return names.join(', ');
}

/**
 * `RUN-NEXT-VERSION-03` 1.2 — the sentence naming the pictures that did not load: the ones still over
 * the cap after fitting, and the ones that are not pictures at all.
 */
export function notLoadedLine(
  tooLarge: readonly string[],
  notPictures: readonly string[],
): string | null {
  const parts: string[] = [];
  if (tooLarge.length > 0) {
    const mb = String(PAGE_MAX_BYTES / (1024 * 1024));
    parts.push(
      `${namesOf(tooLarge)} could not be made smaller than ${mb} MB and ${tooLarge.length === 1 ? 'was' : 'were'} not loaded.`,
    );
  }
  for (const name of notPictures) parts.push(pageRefusalMessage('page-not-a-picture', { name }));
  return parts.length === 0 ? null : parts.join(' ');
}

export function PageListEditor({
  fieldId,
  value,
  defaults,
  channel,
  onStage,
}: {
  fieldId: string;
  value: FieldValue | undefined;
  /**
   * The pages the template itself carries — the book until the operator loads one, and the text
   * pages a load keeps in place (`RUN-NEXT-VERSION-03` 1.6).
   */
  defaults: readonly unknown[];
  /** `RUN-NEXT-VERSION-03` 1.2 — the row's channel, whose frame a page is fitted to. */
  channel?: number | undefined;
  onStage: (value: FieldValue) => void;
}): JSX.Element {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [fitted, setFitted] = useState<string | null>(null);
  const count = countOf(value, defaults);
  const settings = useChannelSettings().settings;
  const raster: Raster = settings.find((s) => s.channel === channel)?.raster ?? REFERENCE_RASTER;

  async function load(folder: boolean): Promise<void> {
    const picked = (await pickPictures(folder)).filter((f) => PICTURE_EXT.test(f.name));
    if (picked.length === 0) return;
    setRefusal(null);
    setFitted(null);
    if (picked.length > PAGES_MAX_PER_ROW) {
      setRefusal(pageRefusalMessage('page-too-many', { count: picked.length }));
      return;
    }
    const files = [...picked].sort((a, b) => naturalCompare(orderName(a), orderName(b)));
    const pages: { id: string; kind: 'image'; media: string; name: string }[] = [];
    const tooLarge: string[] = [];
    const notPictures: string[] = [];
    let resized = 0;
    let reencoded = 0;
    setBusy({ done: 0, total: files.length });
    try {
      for (const [i, file] of files.entries()) {
        // `RUN-NEXT-VERSION-03` 1.2 — FITTED, not refused: a picture larger than the channel, or
        // over the cap, is scaled and re-encoded here; only what is still over the cap is named.
        const fit = await fitPicture(file, new Uint8Array(await file.arrayBuffer()), raster);
        setBusy({ done: i + 1, total: files.length });
        if (!fit.ok) {
          (fit.reason === 'too-large-after-fit' ? tooLarge : notPictures).push(file.name);
          continue;
        }
        if (fit.resized) resized += 1;
        if (fit.reencoded) reencoded += 1;
        const put = await window.cg.pages.put({ name: file.name, base64: toBase64(fit.bytes) });
        if (!put.accepted || put.sha256 === undefined) {
          // The bridge's own check is the guard: its refusal stops the load, in its own words.
          setRefusal(put.message ?? `${file.name} was not accepted by CG Bridge.`);
          return;
        }
        // `RUN-NEXT-VERSION-03` 1.1 — the bytes just sent, kept under the hash the bridge answered,
        // so PVW and the page tools draw this picture without asking the bridge for it back.
        rememberPicture(put.sha256, fit.bytes);
        pages.push({
          id: `${String(pages.length + 1)}-${put.sha256.slice(0, 12)}`,
          kind: 'image',
          media: put.sha256,
          name: file.name,
        });
      }
    } finally {
      setBusy(null);
    }
    setFitted(fitLine(resized, reencoded, raster));
    setRefusal(notLoadedLine(tooLarge, notPictures));
    // `RUN-NEXT-VERSION-03` 1.6 — the PICTURE pages are replaced; each text page keeps its place.
    if (pages.length > 0) {
      onStage(
        withPicturesReplaced(
          bookPagesOf(Array.isArray(value) ? value : defaults),
          pages,
        ) as FieldValue,
      );
    }
  }

  return (
    <div data-page-list="" style={styles.wrap}>
      <div className="cg-book-row">
        <span className="cg-book-count" data-testid={`page-count-${fieldId}`}>
          {count === 1 ? '1 page' : `${String(count)} pages`}
        </span>
        <Button
          variant="neutral"
          aria-label={`Load pictures for ${fieldId}`}
          disabled={busy !== null}
          onClick={() => void load(false)}
        >
          {busy === null
            ? 'Load pictures…'
            : `Loading ${String(busy.done)} / ${String(busy.total)}…`}
        </Button>
        <Button
          variant="neutral"
          aria-label={`Load a folder for ${fieldId}`}
          disabled={busy !== null}
          onClick={() => void load(true)}
        >
          Load folder…
        </Button>
      </div>
      {fitted !== null && (
        <span className="cg-book-count" data-testid="page-fit-line">
          {fitted}
        </span>
      )}
      {refusal !== null && <Notice noticeRole="refusal" text={refusal} />}
    </div>
  );
}
