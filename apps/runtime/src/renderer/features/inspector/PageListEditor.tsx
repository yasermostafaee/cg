import { useState, type CSSProperties } from 'react';
import {
  PAGE_MAX_BYTES,
  PAGE_MAX_PIXELS,
  PAGE_MAX_SIDE,
  PAGES_MAX_PER_ROW,
  pageRefusalMessage,
  probeImage,
} from '@cg/shared-ipc';
import type { FieldValue } from '@cg/shared-schema';
import { naturalCompare } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Notice } from '../../ui/Notice.js';
import { rememberPicture } from '../book/pagePictures.js';

/**
 * `R-100` — **A ROW'S BOOK: the operator loads its pages as pictures.**
 *
 * In place of the list editor for a `list` field the author marked as a page list. `Load
 * pictures…` takes many files and `Load folder…` a whole folder; the files are put in natural
 * order (the one comparison the Designer uses too), each is checked here with the bridge's own
 * probe, limits and wording, and sent to CG Bridge one at a time. The resulting page list STAGES
 * like any field value — the operator applies it with Update — and names each picture by the hash
 * the bridge answered. Labels, a count, progress and a refusal sentence: nothing else is said.
 */
const PICTURE_EXT = /\.(png|jpe?g|webp)$/i;

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.35rem' } satisfies CSSProperties,
};

/** A page list value's length; with no value yet, the template's own pages. */
function countOf(value: FieldValue | undefined, defaultCount: number): number {
  return Array.isArray(value) ? value.length : defaultCount;
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

/** The bridge's checks, made here first so a refusal arrives before the bytes travel. */
function refusalOf(name: string, bytes: Uint8Array): string | null {
  if (bytes.byteLength > PAGE_MAX_BYTES) {
    return pageRefusalMessage('page-too-large', { name, bytes: bytes.byteLength });
  }
  const probe = probeImage(bytes);
  if (probe === null) return pageRefusalMessage('page-not-a-picture', { name });
  if (
    probe.width > PAGE_MAX_SIDE ||
    probe.height > PAGE_MAX_SIDE ||
    probe.width * probe.height > PAGE_MAX_PIXELS
  ) {
    return pageRefusalMessage('page-too-many-pixels', {
      name,
      width: probe.width,
      height: probe.height,
    });
  }
  return null;
}

export function PageListEditor({
  fieldId,
  value,
  defaultCount,
  onStage,
}: {
  fieldId: string;
  value: FieldValue | undefined;
  /** How many pages the template itself carries — shown until the operator loads a book. */
  defaultCount: number;
  onStage: (value: FieldValue) => void;
}): JSX.Element {
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const count = countOf(value, defaultCount);

  async function load(folder: boolean): Promise<void> {
    const picked = (await pickPictures(folder)).filter((f) => PICTURE_EXT.test(f.name));
    if (picked.length === 0) return;
    setRefusal(null);
    if (picked.length > PAGES_MAX_PER_ROW) {
      setRefusal(pageRefusalMessage('page-too-many', { count: picked.length }));
      return;
    }
    const files = [...picked].sort((a, b) => naturalCompare(orderName(a), orderName(b)));
    const pages: { id: string; kind: 'image'; media: string; name: string }[] = [];
    setBusy({ done: 0, total: files.length });
    try {
      for (const [i, file] of files.entries()) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const local = refusalOf(file.name, bytes);
        if (local !== null) {
          setRefusal(local);
          return;
        }
        const put = await window.cg.pages.put({ name: file.name, base64: toBase64(bytes) });
        if (!put.accepted || put.sha256 === undefined) {
          setRefusal(put.message ?? `${file.name} was not accepted by CG Bridge.`);
          return;
        }
        // `RUN-NEXT-VERSION-03` 1.1 — the bytes just sent, kept under the hash the bridge answered,
        // so PVW and the page tools draw this picture without asking the bridge for it back.
        rememberPicture(put.sha256, bytes);
        pages.push({
          id: `${String(i + 1)}-${put.sha256.slice(0, 12)}`,
          kind: 'image',
          media: put.sha256,
          name: file.name,
        });
        setBusy({ done: i + 1, total: files.length });
      }
    } finally {
      setBusy(null);
    }
    onStage(pages);
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
      {refusal !== null && <Notice noticeRole="refusal" text={refusal} />}
    </div>
  );
}
