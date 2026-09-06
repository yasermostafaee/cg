// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSourceCatalog, type SourceCatalog } from '@cg/shared-ipc';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  setSetupInput,
  settleSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * C-025 — the STREAM producer arm's operator surface, in the Live sources section of
 * Station setup (it was the `Live sources` dialog until `STATION-SETUP-02`).
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

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

function stubBridge(): { sent: SourceCatalog[] } {
  const sent: SourceCatalog[] = [];
  stationSetupStub({
    sourcesSetConfig: (next: SourceCatalog) => {
      sent.push(next);
      const verdict = checkSourceCatalog(next, { fixedBank: null, reservedLayers: [] });
      return Promise.resolve(
        verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason, message: verdict.message },
      );
    },
  });
  return { sent };
}

async function renderSources(): Promise<{ dialog: HTMLElement; section: HTMLElement }> {
  const dialog = await renderStationSetup({ section: 'sources' });
  return { dialog, section: sectionOf(dialog, 'sources') };
}

async function selectKind(section: HTMLElement, name: string, kind: string): Promise<void> {
  const select = section.querySelector<HTMLSelectElement>(
    `select[aria-label="Producer kind for ${name}"]`,
  );
  if (select === null) throw new Error(`no kind picker for ${name}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, kind);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settleSetup();
}

/** Define one source through the section's own Add flow — the real round-trip. */
async function addSource(section: HTMLElement, name: string): Promise<void> {
  await setSetupInput(section, 'New source name', name);
  const add = [...section.querySelectorAll('button')].find((b) => b.textContent === 'Add');
  if (add === undefined) throw new Error('no Add button');
  await act(async () => {
    add.click();
    await Promise.resolve();
  });
  await settleSetup();
}

describe('C-025 — the fifth producer kind', () => {
  it('the kind picker offers FIVE options, the stream labelled as a feed and not a clip', async () => {
    stubBridge();
    const { section } = await renderSources();
    await addSource(section, 'Studio A');

    const select = section.querySelector<HTMLSelectElement>(
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
    const { section } = await renderSources();
    await addSource(section, 'Studio A');
    await selectKind(section, 'Studio A', 'stream');

    const url = section.querySelector<HTMLInputElement>(
      'input[aria-label="Stream URL for Studio A"]',
    );
    expect(url, 'the URL field exists once the kind is stream').not.toBeNull();
    // The default must pass the allowlist, or the kind switch itself would be
    // refused by the validator and the operator could never reach the field.
    expect(url?.value).toMatch(/^rtmp:\/\//);
    // The summary reads as a stream, so a second operator can tell it from a clip.
    expect(section.textContent).toContain('stream rtmp://');
  });

  it('a URL outside the allowlist is REFUSED with the named sentence — never a silent accept', async () => {
    stubBridge();
    const { dialog, section } = await renderSources();
    await addSource(section, 'Studio A');
    await selectKind(section, 'Studio A', 'stream');
    await setSetupInput(section, 'Stream URL for Studio A', 'ftp://server/feed.ts');

    const region = dialog.querySelector('[data-modal-message]');
    expect(region, 'the refusal reaches the operator through the message region').not.toBeNull();
    // The RULE sentence (sourcesReasonMessage) …
    expect(region?.textContent).toContain('accepted scheme');
    // … and the validator's SPECIFICS, naming what was refused.
    expect(region?.textContent).toContain('ftp');
    // The catalog in force did not adopt it: the summary still shows the default.
    expect(section.textContent).toContain('stream rtmp://');
    expect(section.textContent).not.toContain('stream ftp://');
  });

  it('an accepted URL commits, and the standing refusal clears', async () => {
    stubBridge();
    const { dialog, section } = await renderSources();
    await addSource(section, 'Studio A');
    await selectKind(section, 'Studio A', 'stream');
    await setSetupInput(section, 'Stream URL for Studio A', 'ftp://server/feed.ts');
    await setSetupInput(section, 'Stream URL for Studio A', 'srt://10.0.0.20:9000');

    expect(section.textContent).toContain('stream srt://10.0.0.20:9000');
    expect(dialog.querySelector('[data-notice="refusal"]')).toBeNull();
  });

  it('switching kinds DISCARDS the previous arm’s fields — emptyProducer’s documented rule', async () => {
    stubBridge();
    const { section } = await renderSources();
    await addSource(section, 'Studio A');
    await setSetupInput(section, 'Route channel for Studio A', '5');
    expect(section.textContent).toContain('route://5');

    await selectKind(section, 'Studio A', 'stream');
    await selectKind(section, 'Studio A', 'route');

    const channel = section.querySelector<HTMLInputElement>(
      'input[aria-label="Route channel for Studio A"]',
    );
    // Back to the fresh default — a URL and a channel number must never be
    // carried across arms, which is how a source comes to point at hardware
    // nobody chose.
    expect(channel?.value).toBe('1');
  });
});
