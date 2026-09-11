// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSourceCatalog, type SourceCatalog } from '@cg/shared-ipc';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals, openDialog } from './support/dialog.js';
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
 * Station setup.
 *
 * The finding the item records is that the gap was EXPRESSION, not capability: a URL typed
 * into "Media file" already produced the proven command, but nobody could discover that and
 * nothing validated it. These tests pin the surface half of the fix — the fifth kind exists,
 * it is labelled as a FEED and not a clip, choosing it renders a URL field, and a scheme
 * outside the client's allowlist is refused with a sentence rather than silently accepted
 * (or worse, refused later by CasparCG, at take, on air).
 *
 * ── ⭐ `STATION-CHROME-01` §5/§6 CHANGED WHERE THESE FIELDS LIVE ─────────────
 *
 * Every guarantee above is unchanged; the surface moved. The kind picker and its per-kind
 * fields are in the small second dialog every Add and Edit opens, not inline on the row, and
 * the row shows the kind's fields as LABELLED PARTS rather than one derived string. So the
 * assertions drive the dialog and read the row's parts — and one of them got STRONGER as a
 * result: the draft now reaches the bridge only on the confirming press, so "an unaccepted
 * URL is not adopted" can be checked against the catalogue rather than against a summary
 * line.
 *
 * The stub's `setConfig` runs the REAL shared validator (`checkSourceCatalog`), so every
 * refusal asserted here is the one a real station gives.
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

async function click(scope: HTMLElement, label: string): Promise<void> {
  const button = [...scope.querySelectorAll('button')].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`no “${label}” button`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settleSetup();
}

/** Click by ACCESSIBLE NAME — for the icon-only row actions, which carry no text. */
async function clickByLabel(scope: HTMLElement, label: string): Promise<void> {
  const button = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (button === null) throw new Error(`no button named “${label}”`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settleSetup();
}

/** The Add/Edit dialog — the SECOND dialog, so the last one in the document. */
function subDialog(): HTMLElement {
  const all = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
  const last = all[all.length - 1];
  if (last === undefined || all.length < 2) throw new Error('the sub-dialog is not open');
  return last;
}

/**
 * Choose a producer kind.
 *
 * ⭐ `SETTINGS-MATCH-02` §8b — the control is a RADIO GROUP now, not a `<select>`: the kind is
 * the one field whose value changes the FORM, and a select hid four of five answers behind a
 * press. The group keeps the accessible name `Source kind`, which is what this finds it by, so
 * only the press changed.
 */
async function selectKind(scope: HTMLElement, kind: string): Promise<void> {
  const group = scope.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Source kind"]');
  const option = group?.querySelector<HTMLInputElement>(`input[type="radio"][value="${kind}"]`);
  if (option === undefined || option === null) throw new Error('no kind picker');
  await act(async () => {
    option.click();
  });
  await settleSetup();
}

describe('C-025 — the fifth producer kind, in the Add dialog', () => {
  it('the kind picker offers FIVE options, the stream labelled as a feed and not a clip', async () => {
    stubBridge();
    const { section } = await renderSources();
    await click(section, 'Add source');

    /*
      ⭐ `SETTINGS-MATCH-02` §8b — A RADIO GROUP, not a `<select>`. The kind is the one field
      whose value changes the FORM, and a select hid four of five answers behind a press. The
      group keeps the name `Source kind`; the options keep their full labels as the accessible
      NAME of each radio, and show the short badge word.

      ⚠ **The reference draws THREE (DeckLink · NDI · Stream) and this asserts FIVE.**
      `SourceProducer` has five kinds and a picker that cannot express a stored value is a
      defect rather than a simplification — the same argument that kept the strategy select's
      third option.
    */
    const group = subDialog().querySelector<HTMLElement>(
      '[role="radiogroup"][aria-label="Source kind"]',
    );
    expect(group).not.toBeNull();
    const options = [...(group?.querySelectorAll('input[type="radio"]') ?? [])];
    /*
      The order groups the signal-bearing producers ahead of the one clip, and `media` stays
      LAST as the odd one out ("the one producer that needs no signal").

      ⭐ DECKLINK IS FIRST NOW, where `route` used to be: §5's subject is that a station's
      sources are mostly SDI inputs, and the first option is the one an operator reaches for.
    */
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual([
      'DeckLink (SDI input)',
      'NDI',
      'Stream (URL)',
      'Route (another channel)',
      'Media clip',
    ]);
    // …and exactly one is chosen at a time, which is what a radio GROUP buys over buttons.
    expect(options.filter((o) => (o as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('choosing stream renders the URL field, prefilled with an accepted-scheme example', async () => {
    stubBridge();
    const { section } = await renderSources();
    await click(section, 'Add source');
    await selectKind(subDialog(), 'stream');

    const url = subDialog().querySelector<HTMLInputElement>('input[aria-label="Stream URL"]');
    expect(url, 'the URL field exists once the kind is stream').not.toBeNull();
    // The default must pass the allowlist, or the confirming press would be refused before
    // the operator had typed anything — a form that rejects its own initial state.
    expect(url?.value).toMatch(/^rtmp:\/\//);
    // …and the field is LABELLED. §5's whole complaint was a value with no label.
    expect(subDialog().textContent).toContain('URL');
  });

  it('a URL outside the allowlist is REFUSED with the named sentence — never a silent accept', async () => {
    stubBridge();
    const { dialog, section } = await renderSources();
    await click(section, 'Add source');
    await setSetupInput(subDialog(), 'Source name', 'Backhaul');
    await selectKind(subDialog(), 'stream');
    await setSetupInput(subDialog(), 'Stream URL', 'ftp://server/feed.ts');
    await click(subDialog(), 'Add source');

    /*
      ⭐ THE REFUSAL LANDS IN THE SECTION'S REGION, not the sub-dialog's, and that is the
      honest place for THIS one: it comes from the BRIDGE's validator after the record was
      committed, so by the time it exists the form is gone. The sub-dialog's own region
      carries the refusals it can answer itself (an empty name, a duplicate).
    */
    const region = dialog.querySelector('[data-modal-message]');
    expect(region, 'the refusal reaches the operator through a message region').not.toBeNull();
    // The RULE sentence (sourcesReasonMessage) …
    expect(region?.textContent).toContain('accepted scheme');
    // … and the validator's SPECIFICS, naming what was refused.
    expect(region?.textContent).toContain('ftp');
    // 🔴 And the catalogue in force did NOT adopt it — the strongest form of this
    // assertion, now that the row shows the stored record rather than a draft.
    expect(sectionOf(dialog, 'sources').textContent).not.toContain('ftp://');
  });

  it('an accepted URL commits, and the row names the URL as a URL', async () => {
    stubBridge();
    const { dialog, section } = await renderSources();
    await click(section, 'Add source');
    await setSetupInput(subDialog(), 'Source name', 'Backhaul');
    await selectKind(subDialog(), 'stream');
    await setSetupInput(subDialog(), 'Stream URL', 'srt://10.0.0.20:9000');
    await click(subDialog(), 'Add source');

    const parts = sectionOf(dialog, 'sources').querySelector('[data-source-parts]');
    expect(parts?.textContent).toContain('URL');
    expect(parts?.textContent).toContain('srt://10.0.0.20:9000');
    // …and the kind is named as a word, never left to the URL's scheme to imply.
    expect(
      sectionOf(dialog, 'sources').querySelector('[data-source-kind="stream"]'),
    ).not.toBeNull();
    expect(dialog.querySelector('[data-notice="refusal"]')).toBeNull();
  });

  it('switching kinds DISCARDS the previous arm’s fields — emptyProducer’s documented rule', async () => {
    stubBridge();
    const { section } = await renderSources();
    await click(section, 'Add source');
    await selectKind(subDialog(), 'route');
    await setSetupInput(subDialog(), 'Route source channel', '5');
    await selectKind(subDialog(), 'stream');
    await selectKind(subDialog(), 'route');

    const channel = subDialog().querySelector<HTMLInputElement>(
      'input[aria-label="Route source channel"]',
    );
    // Back to the fresh default — a URL and a channel number must never be carried across
    // arms, which is how a source comes to point at hardware nobody chose.
    expect(channel?.value).toBe('1');
  });
});

describe('§5 — the columns depend on the kind', () => {
  it('a DeckLink shows a DEVICE, an NDI source a NAME, a stream a URL — each labelled', async () => {
    stubBridge();
    const { dialog, section } = await renderSources();

    const add = async (name: string, kind: string, field: string, value: string): Promise<void> => {
      await click(sectionOf(dialog, 'sources'), 'Add source');
      await setSetupInput(subDialog(), 'Source name', name);
      await selectKind(subDialog(), kind);
      await setSetupInput(subDialog(), field, value);
      await click(subDialog(), 'Add source');
    };

    await add('Studio A', 'decklink', 'DeckLink device index', '2');
    await add('Ingest', 'ndi', 'NDI source name', 'CG-INGEST (Studio 2)');
    await add('Backhaul', 'stream', 'Stream URL', 'srt://ingest.example:9000');

    const rows = [...sectionOf(dialog, 'sources').querySelectorAll('[data-source-parts]')];
    expect(rows).toHaveLength(3);
    /*
      🔴 THE ASSERTION IS THE LABEL, not the value. One "Address" column showed `2`,
      `CG-INGEST (Studio 2)` and `srt://…` under one heading that fitted none of them — an
      operator reading `2` could not tell a device index from a channel from a layer.
    */
    expect(rows[0]?.textContent).toContain('Device');
    expect(rows[0]?.textContent).toContain('2');
    expect(rows[1]?.textContent).toContain('Source name');
    expect(rows[1]?.textContent).toContain('CG-INGEST (Studio 2)');
    expect(rows[2]?.textContent).toContain('URL');
    expect(rows[2]?.textContent).toContain('srt://ingest.example:9000');

    // NEGATIVE CONTROL: no row wears another kind's label.
    expect(rows[1]?.textContent).not.toContain('Device');
    expect(rows[2]?.textContent).not.toContain('Source name');
    expect(section).toBeDefined();
  });

  it('EDIT opens the same dialog, on the record — §6’s "one way to add anything"', async () => {
    stubBridge();
    const { dialog } = await renderSources();
    await click(sectionOf(dialog, 'sources'), 'Add source');
    await setSetupInput(subDialog(), 'Source name', 'Studio A');
    await click(subDialog(), 'Add source');
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    /*
      ⚠ `STATION-CHROME-02` §3 — the row's two actions are ICONS in the table's actions
      column now, so there is no button whose TEXT is `Edit`. Found by its accessible name,
      which is what an operator's screen reader says and what the icon has always carried —
      a stronger anchor than the label was, and the one the mockup's own row uses.
    */
    await clickByLabel(sectionOf(dialog, 'sources'), 'Edit Studio A');
    // The SAME dialog shape, carrying the record rather than a blank.
    expect(openDialog()).not.toBeNull();
    const name = subDialog().querySelector<HTMLInputElement>('input[aria-label="Source name"]');
    expect(name?.value).toBe('Studio A');
    expect(subDialog().textContent).toContain('Edit live source');
  });
});
