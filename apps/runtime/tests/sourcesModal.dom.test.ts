// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSourceCatalog, type SourceCatalog } from '@cg/shared-ipc';
import { SourcesModal } from '../src/renderer/features/sources/SourcesModal.js';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * C-025 — the STREAM producer arm's operator surface, in the Sources modal.
 *
 * The finding the item records is that the gap was EXPRESSION, not capability: a
 * URL typed into "Media file" already produced the proven command, but nobody
 * could discover that and nothing validated it. These tests pin the surface half
 * of the fix — the fifth kind exists, it is labelled as a FEED and not a clip,
 * choosing it renders a URL field, and a scheme outside the client's allowlist
 * is refused with a sentence rather than silently accepted (or worse, refused
 * later by CasparCG, at take, on air).
 *
 * The stub's `setConfig` runs the REAL shared validator (`checkSourceCatalog`),
 * so every refusal asserted here is the one a real station gives — the same
 * reason the E2E drives the MockRuntime rather than a fiction.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

function stubBridge(): { sent: SourceCatalog[] } {
  const sent: SourceCatalog[] = [];
  const stub = {
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: (next: SourceCatalog) => {
        sent.push(next);
        const verdict = checkSourceCatalog(next, { fixedBank: null, reservedLayers: [] });
        return Promise.resolve(
          verdict.ok
            ? { ok: true }
            : { ok: false, reason: verdict.reason, message: verdict.message },
        );
      },
      assignments: () => Promise.resolve({ assignments: [] }),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: () => Promise.resolve({ ok: true }),
    },
    templates: { list: () => Promise.resolve([]) },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { sent };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function renderModal(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(SourcesModal, { onClose: () => undefined })),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('the Live sources dialog did not open');
  return dialog;
}

async function setInput(dialog: HTMLElement, ariaLabel: string, value: string): Promise<void> {
  const input = dialog.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (input === null) throw new Error(`input "${ariaLabel}" not rendered`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

async function selectKind(dialog: HTMLElement, name: string, kind: string): Promise<void> {
  const select = dialog.querySelector<HTMLSelectElement>(
    `select[aria-label="Producer kind for ${name}"]`,
  );
  if (select === null) throw new Error(`no kind picker for ${name}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, kind);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

/** Define one source through the modal's own Add flow — the real round-trip. */
async function addSource(dialog: HTMLElement, name: string): Promise<void> {
  await setInput(dialog, 'New source name', name);
  const add = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Add');
  if (add === undefined) throw new Error('no Add button');
  await act(async () => {
    add.click();
    await Promise.resolve();
  });
  await settle();
}

describe('C-025 — the fifth producer kind', () => {
  it('the kind picker offers FIVE options, the stream labelled as a feed and not a clip', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addSource(dialog, 'Studio A');

    const select = dialog.querySelector<HTMLSelectElement>(
      'select[aria-label="Producer kind for Studio A"]',
    );
    expect(select).not.toBeNull();
    const labels = [...(select?.options ?? [])].map((o) => o.textContent);
    // The order groups the four signal-bearing producers ahead of the one clip;
    // the stream sits with the signals it belongs to, and `media` stays last as
    // the odd one out ("the one producer that needs no signal").
    expect(labels).toEqual([
      'Route from a channel',
      'Decklink input',
      'NDI source',
      'Internet stream (URL)',
      'Media file',
    ]);
  });

  it('choosing stream renders the URL field, prefilled with an accepted-scheme example', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addSource(dialog, 'Studio A');
    await selectKind(dialog, 'Studio A', 'stream');

    const url = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Stream URL for Studio A"]',
    );
    expect(url, 'the URL field exists once the kind is stream').not.toBeNull();
    // The default must pass the allowlist, or the kind switch itself would be
    // refused by the validator and the operator could never reach the field.
    expect(url?.value).toMatch(/^rtmp:\/\//);
    // The summary reads as a stream, so a second operator can tell it from a clip.
    expect(dialog.textContent).toContain('stream rtmp://');
  });

  it('a URL outside the allowlist is REFUSED with the named sentence — never a silent accept', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addSource(dialog, 'Studio A');
    await selectKind(dialog, 'Studio A', 'stream');
    await setInput(dialog, 'Stream URL for Studio A', 'ftp://server/feed.ts');

    const region = dialog.querySelector('[data-modal-message]');
    expect(region, 'the refusal reaches the operator through the message region').not.toBeNull();
    // The RULE sentence (sourcesReasonMessage) …
    expect(region?.textContent).toContain('accepted scheme');
    // … and the validator's SPECIFICS, naming what was refused.
    expect(region?.textContent).toContain('ftp');
    // The catalog in force did not adopt it: the summary still shows the default.
    expect(dialog.textContent).toContain('stream rtmp://');
    expect(dialog.textContent).not.toContain('stream ftp://');
  });

  it('an accepted URL commits, and the standing refusal clears', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addSource(dialog, 'Studio A');
    await selectKind(dialog, 'Studio A', 'stream');
    await setInput(dialog, 'Stream URL for Studio A', 'ftp://server/feed.ts');
    await setInput(dialog, 'Stream URL for Studio A', 'srt://10.0.0.20:9000');

    expect(dialog.textContent).toContain('stream srt://10.0.0.20:9000');
    expect(dialog.querySelector('[data-notice="refusal"]')).toBeNull();
  });

  it('switching kinds DISCARDS the previous arm’s fields — emptyProducer’s documented rule', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addSource(dialog, 'Studio A');
    await setInput(dialog, 'Route channel for Studio A', '5');
    expect(dialog.textContent).toContain('route://5');

    await selectKind(dialog, 'Studio A', 'stream');
    await selectKind(dialog, 'Studio A', 'route');

    const channel = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Route channel for Studio A"]',
    );
    // Back to the fresh default — a URL and a channel number must never be
    // carried across arms, which is how a source comes to point at hardware
    // nobody chose.
    expect(channel?.value).toBe('1');
  });
});
