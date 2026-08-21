// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { SourceAssignments, SourceCatalog } from '@cg/shared-ipc';
import { LooksBindingsSection } from '../src/renderer/features/inspector/LooksBindingsSection.js';
import { colors } from '../src/renderer/theme.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { itemWith, templateWith } from './support/layerRow.js';

/**
 * ⭐ **SESSION BM-2 §2 / §3 — THE PER-LOOK INPUT LIST, AND THE HAZARD IT MUST NOT SHIP.**
 *
 * The hazard is stated in the section's own header and is the reason these are DOM tests
 * rather than a screenshot: an emergency patch (`R-048`, level 4) MASKS every per-look
 * binding (level 3) for that plate, so a list that renders the bindings faithfully can be
 * confidently wrong about what is on air. What has to be true is a property of the rendered
 * markup — the masked rows say so, and the patch can be ended from where it is seen — and a
 * picture cannot show that the CONTROL is still usable or that the label means "overridden"
 * rather than "disabled".
 */

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'studio-1', name: 'Studio 1', producer: { kind: 'route', channel: 2 } },
    { id: 'studio-2', name: 'Studio 2', producer: { kind: 'route', channel: 3 } },
    { id: 'studio-3', name: 'Studio 3', producer: { kind: 'route', channel: 4 } },
    { id: 'studio-5', name: 'Studio 5', producer: { kind: 'route', channel: 6 } },
  ],
  layerRange: { start: 30, end: 39 },
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'tpl-1', plateId: 'l-1', sourceId: 'studio-1' },
    { templateId: 'tpl-1', plateId: 'l-2', sourceId: 'studio-2' },
  ],
};

const rect = (x: number) => ({ x, y: 0, width: 640, height: 360 });

/** A 2-box / solo template: `two` shows both frames, `solo` shows `l-1` full frame. */
const TEMPLATE = templateWith({
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      { elementId: 'e1', sourceId: 'l-1', rect: rect(0), dynamic: false },
      { elementId: 'e2', sourceId: 'l-2', rect: rect(640), dynamic: false },
    ],
    looks: [
      {
        id: 'two',
        name: '2-box',
        entered: { mode: 'cut' },
        rects: { 'l-1': rect(0), 'l-2': rect(640) },
      },
      {
        id: 'solo',
        name: 'Solo',
        entered: { mode: 'cut' },
        rects: { 'l-1': { x: 0, y: 0, width: 1920, height: 1080 } },
      },
    ],
    defaultLookId: 'two',
  },
} as Partial<Parameters<typeof templateWith>[0]>);

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  __resetSourcesForTest();
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

async function render(
  over: Parameters<typeof itemWith>[1] = {},
  props: { rehearsing?: boolean } = {},
): Promise<HTMLElement> {
  initSources({
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve(ASSIGNMENTS),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
    },
  } as unknown as Parameters<typeof initSources>[0]);
  await act(async () => {
    await Promise.resolve();
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const item = itemWith('on-air', { activeLookId: 'two', ...over });
  await act(async () => {
    root?.render(createElement(LooksBindingsSection, { item, info: TEMPLATE, ...props }));
  });
  return host;
}

it('🔴 §6.5 — the LIVE look is distinguishable from the others, in the markup', async () => {
  const el = await render();

  // Both looks are listed — the point of the section is seeing them at the same time.
  expect(el.querySelector('[data-look-row="two"]')).not.toBeNull();
  expect(el.querySelector('[data-look-row="solo"]')).not.toBeNull();
  // …and exactly ONE is marked live, the one the row is actually showing.
  expect(el.querySelector('[data-look-live="two"]')).not.toBeNull();
  expect(el.querySelector('[data-look-live="solo"]')).toBeNull();
  expect(el.querySelectorAll('[data-look-live]')).toHaveLength(1);
  // The mark says ON AIR NOW in words, not by colour alone.
  expect(el.querySelector('[data-look-live="two"]')?.textContent).toContain('ON AIR');
});

it('each look lists ONLY its own frames — solo has one, 2-box has two', async () => {
  const el = await render();
  expect(el.querySelector('[data-look-binding="two:l-1"]')).not.toBeNull();
  expect(el.querySelector('[data-look-binding="two:l-2"]')).not.toBeNull();
  expect(el.querySelector('[data-look-binding="solo:l-1"]')).not.toBeNull();
  // `l-2` is not in solo, so solo must not offer an input for it.
  expect(el.querySelector('[data-look-binding="solo:l-2"]')).toBeNull();
});

it('🔴 §6.3 — an emergency patch is VISIBLE on every row it masks, and says what is on air', async () => {
  /*
    THE HAZARD, asserted. Without this the list would show `solo → studio-3` in good faith
    while studio-5 was on air in every look — a surface that is confidently wrong.
  */
  const el = await render({
    sourceOverride: { 'l-1': 'studio-5' },
    lookSourceOverride: { solo: { 'l-1': 'studio-3' } },
  });

  // The patch is on `l-1`, so BOTH looks' `l-1` rows are masked — it is in force everywhere.
  for (const key of ['two:l-1', 'solo:l-1']) {
    const select = el.querySelector(`[data-look-binding="${key}"]`);
    expect(select?.hasAttribute('data-look-binding-masked'), key).toBe(true);
    // 🔴 STRUCK THROUGH, NOT DISABLED. Grey reads as "this control is broken"; the operator
    // must be able to tell "overridden" from "unavailable", and must still be able to edit.
    expect((select as HTMLSelectElement | null)?.disabled, `${key} stays usable`).toBe(false);
    expect((select as HTMLElement | null)?.style.textDecoration).toBe('line-through');
  }
  // …and the row NAMES what is actually on air, in words.
  const note = el.querySelector('[data-look-binding-patched="l-1"]');
  expect(note?.textContent).toContain('not in force');
  expect(note?.textContent).toContain('Studio 5');

  // `l-2` has no patch, so its row is untouched — masking is per PLATE, not per row.
  expect(
    el.querySelector('[data-look-binding="two:l-2"]')?.hasAttribute('data-look-binding-masked'),
  ).toBe(false);
});

it('🔴 §6.4 — CLEAR PATCH sits on the masked row, and ends the patch in ONE action', async () => {
  const swapLiveSource = vi.fn(() => Promise.resolve({ ok: true }));
  (globalThis as unknown as { window: { cg: unknown } }).window.cg = {
    stack: { swapLiveSource },
  };
  const el = await render({
    sourceOverride: { 'l-1': 'studio-5' },
    lookSourceOverride: { solo: { 'l-1': 'studio-3' } },
  });

  const clear = el.querySelector('[data-clear-patch="l-1"]') as HTMLButtonElement | null;
  expect(clear, 'reachable from where the patch is shown').not.toBeNull();
  await act(async () => {
    clear?.click();
    await Promise.resolve();
  });

  /*
    ONE action, and `null` is the whole payload: the patch is REMOVED rather than replaced,
    which is what puts the per-look bindings underneath it back in force. It applies
    immediately because the patch it undoes did too — `R-048` is an on-air emergency, not a
    draft, and making its removal wait for UPDATE would put the two halves of one decision on
    different clocks.
  */
  expect(swapLiveSource).toHaveBeenCalledTimes(1);
  expect(swapLiveSource).toHaveBeenCalledWith({
    itemId: 'item-1',
    plateId: 'l-1',
    sourceId: null,
  });
});

it('🔴 §2.3 — editing a MASKED binding is ACCEPTED and staged, and says it waits', async () => {
  /*
    The third option §2.3 rejects is silence: an edit that does nothing, or one that silently
    clears the patch. Both leave the operator with a surface that did not do what it looked
    like it did. The edit stages, and the chip says what it is waiting for.
  */
  const el = await render({
    sourceOverride: { 'l-1': 'studio-5' },
  });

  const select = el.querySelector('[data-look-binding="solo:l-1"]') as HTMLSelectElement | null;
  expect(select).not.toBeNull();
  await act(async () => {
    if (select !== null) {
      select.value = 'studio-3';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // It took the edit…
  expect((el.querySelector('[data-look-binding="solo:l-1"]') as HTMLSelectElement).value).toBe(
    'studio-3',
  );
  // …marked it unapplied, and said WHY it will not be seen yet — VISIBLY, not as an
  // accessible name only (`DraftChip` renders fixed text and carries its label on aria).
  expect(el.querySelector('[data-look-binding-waiting="l-1"]')).not.toBeNull();
  expect(el.textContent).toContain('takes effect when the patch is cleared');
});

// ───────── `B-156` — THE BADGE SAYS WHAT IS TRUE, IN EACH OF THE THREE ROW STATES ─────────

/**
 * 🔴 **SESSION BP §2.3 — THE EXPECTED COLOUR, PUT THROUGH THE SAME NORMALISER THE DOM USES.**
 *
 * The assertion has to name the TOKEN (`colors.onAir`), never the hex, or the test pins a
 * literal and goes on passing while the badge and the row's own mark drift apart — which is
 * the exact failure `B-156` was, one layer down, on a predicate instead of a colour. But
 * `HTMLElement.style.color` reads back in the browser's canonical form (`rgb(44, 255, 122)`),
 * so comparing a raw token string to it fails for reasons that have nothing to do with the
 * badge. Running the token through a scratch element normalises both sides identically, and
 * the assertion still names the token.
 */
function asRendered(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  return probe.style.color;
}

/**
 * The label used to read `ON AIR NOW` whenever `activeLookOf` picked the look — and that
 * function answers *which look the ROW is set to*, never *whether the row is playing*. So a
 * merely LOADED row claimed air, which the owner met with a screenshot: `ON AIR NOW` in the
 * Inspector beside `READY` in the layer table.
 *
 * One test per state, because the defect was that two of the three were never distinguished.
 */
it('🔴 B-156 — a LOADED row does NOT claim air: the badge says a take would show it', async () => {
  const el = await render({ status: 'loaded' });
  const badge = el.querySelector('[data-look-live="two"]');
  expect(badge, 'the selected look is still marked').not.toBeNull();
  expect(badge?.textContent, 'but it must not claim air').not.toContain('ON AIR');
  expect(badge?.textContent).toContain('TAKE');
  expect(badge?.getAttribute('data-look-badge')).toBe('not-on-air');
  /*
    🔴 SESSION BP §1.3 — …and it wears READY's own sky, because READY is precisely the row
    state this badge is describing. ⚠ `colors.ready`, NOT `--r-accent`: identical value,
    opposite rule (the accent is explicitly not a state colour). See `theme.ts`.
  */
  expect((badge as HTMLElement | null)?.style.color).toBe(asRendered(colors.ready));
});

it('B-156 — an ON-AIR row DOES say so, which is the state the label was right about', async () => {
  const el = await render({ status: 'on-air' });
  const badge = el.querySelector('[data-look-live="two"]');
  expect(badge?.textContent).toContain('ON AIR NOW');
  expect(badge?.getAttribute('data-look-badge')).toBe('on-air');
  /*
    🔴 SESSION BP §1.3 — GREEN, and this reverses a decision the file shipped with. Amber was
    right while the badge was gated on `activeLookOf` and therefore meant something other than
    "playing"; `B-156` rewired it to `isOnAir`, the layer table's own predicate, and the two
    meanings merged. The badge and the row's green mark now make ONE claim from ONE derivation
    in ONE colour, which is the whole argument for taking the sacred hue here.
  */
  expect((badge as HTMLElement | null)?.style.color).toBe(asRendered(colors.onAir));
});

it('🔴 B-156 — a REHEARSING row says PVW, the distinction session BL shipped on the row', async () => {
  /*
    BL gave the row's own picker `PVW LOOK` vs `LOOK`, decided from `rehearsing`; this section
    never learned it — the `B-151` shape, one surface knowing a state and its neighbour not.
    `rehearsing` arrives as a PROP from the caller, which reads the canonical
    `isRehearsing(rehearsals, itemId)`, so the badge and the row picker answer to ONE
    derivation rather than two that agree until they do not.
  */
  const el = await render({ status: 'on-air' }, { rehearsing: true });
  const badge = el.querySelector('[data-look-live="two"]');
  expect(badge?.textContent).toContain('PVW');
  expect(badge?.textContent).not.toContain('ON AIR');
  /*
    ⚠ REHEARSING WINS OVER ON-AIR HERE, and that ordering is safe because `R-022`'s interlock
    makes the pair unreachable — a rehearse is refused for an on-air row and a take for a
    rehearsing one. The interlock itself is asserted on the WIRE in
    `live-look-reconcile.integration.test.ts`; this asserts only what the badge does with the
    answer, rather than assuming the pair cannot occur.

    🔴 **SESSION BP — THE TONE IS NOW ITS OWN VALUE, `rehearsing`, NOT `not-on-air`.** Two
    states sharing one attribute value was the same collapse `B-156` fixed in the WORDS: a
    reader (or a test, or a screenshot diff) could not tell a rehearsing row from a merely
    loaded one, which is precisely the distinction session BL shipped on the row and this
    section was missing. The attribute now carries all three.
  */
  expect(badge?.getAttribute('data-look-badge')).toBe('rehearsing');
  /*
    🔴 SESSION BP §1.3 — `R-022`'s violet, the same hue the row's own REHEARSING mark wears,
    so the two cannot disagree about which row is rehearsing. The token's rule in `theme.ts`
    was widened for this deliberately: it bans CONTROLS that advertise availability, and a
    badge naming the mode is a state INDICATOR in the same category as that mark.
  */
  expect((badge as HTMLElement | null)?.style.color).toBe(asRendered(colors.rehearsing));
});
