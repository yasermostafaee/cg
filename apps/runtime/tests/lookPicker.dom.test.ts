// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import {
  LookPicker,
  frameCountLabel,
  lookOptionsOf,
} from '../src/renderer/features/layers/LookPicker.js';
import { lookSwitchRefusal } from '../src/renderer/features/layers/lookSwitch.js';
import {
  gridTemplateColumns,
  minWidthFor,
  VERB_COUNT,
  VERBS_WIDTH_PX,
} from '../src/renderer/features/layers/layerTable.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 **§14.5 / `tasks.md` 7.1–7.2 (LOOKS Stage E) — THE LOOK PICKER.**
 *
 * The control that IS the on-air readout and the switch in one object. §12.8 decided this
 * underneath two reversals and it survived both: **always visible, state-carrying, no
 * menu**, because the client's requirement is that the operator cannot be mistaken about
 * what is on air.
 *
 * ── WHAT IS PINNED HERE, AND WHAT IS NOT ────────────────────────────────────
 *
 * Here: which look reads as live, that one-of-N is unrepresentable otherwise, the
 * absent-vs-empty rule that decides whether a picker exists at all, and §7.2's DENSITY
 * arithmetic. The wire — that pressing a segment moves producers and tells the page — is
 * `tools/caspar-bridge/tests/look-picker-operator.integration.test.ts`; a DOM test cannot
 * see AMCP and should not pretend to.
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
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const LOOKS = [
  { id: 'left', label: 'Left pair', frames: [] },
  { id: 'right', label: 'Right pair', frames: [] },
  { id: 'all', label: 'All four', frames: [] },
];

async function render(
  over: {
    activeId?: string | undefined;
    refusal?: string | undefined;
    target?: 'air' | 'preview';
  } = {},
): Promise<{ el: HTMLDivElement; onPick: ReturnType<typeof vi.fn> }> {
  const onPick = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(LookPicker, {
          looks: LOOKS,
          activeId: 'activeId' in over ? over.activeId : 'left',
          refusal: over.refusal,
          onPick,
          rowName: 'Layer 1',
          target: over.target ?? 'air',
        }),
      ),
    );
  });
  return { el: container, onPick };
}

const seg = (el: HTMLElement, lookId: string): HTMLButtonElement | null =>
  el.querySelector(`[data-look-id="${lookId}"]`);

const pressed = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[data-look-id]')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('data-look-id') ?? '');

// ── 7.1 — the readout ─────────────────────────────────────────────────────────

describe('7.1 — the picker IS the on-air readout', () => {
  it('🔴 marks the live look, and EXACTLY one', async () => {
    const { el } = await render({ activeId: 'right' });

    // One-of-N is the whole safety argument: over-lit and all-off are not defended
    // against here, they are unrepresentable, which is what let §12.9.1's count-shaped
    // refusal family retire rather than move.
    expect(pressed(el)).toEqual(['right']);
  });

  it('offers every AUTHORED look and nothing else — no "none" entry', async () => {
    /*
      Deliberately no off-air entry. Taking the row off air is the STOP/CLEAR verbs' job
      and always was; a second, quieter way to do it hidden in a look strip is exactly the
      kind of surface an operator reaches for by accident under pressure.
    */
    const { el } = await render();

    expect(
      [...el.querySelectorAll('[data-look-id]')].map((b) => b.getAttribute('data-look-id')),
    ).toEqual(['left', 'right', 'all']);
  });

  it('one press is the whole action', async () => {
    const { el, onPick } = await render({ activeId: 'left' });

    await act(async () => {
      seg(el, 'right')?.click();
      await Promise.resolve();
    });

    expect(onPick).toHaveBeenCalledWith('right');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('🔴 re-pressing the LIVE look IS sent — it is the remedy the bridge names', async () => {
    /*
      ── REVERSED, AND THE FIRST VERSION OF THIS FILE HAD IT WRONG ──────────────

      The tempting guard is to drop a press on the already-marked look: re-issuing it would
      run a reconcile and a CG UPDATE for an unchanged picture. But the bridge RECORDS the
      look before the reconcile and KEEPS it when the reconcile or the CG UPDATE is refused —
      so after a half-failed switch the segment is already marked while the fills or the holes
      did not move.

      That is exactly when the bridge’s own refusals say “Re-issue it once the server is back”
      and “Re-issue the switch”. The guard would have made the one remedy they name
      unreachable, on the control they name it about. A redundant re-assert of an unchanged
      picture is cheap; a dead escape from a half-failed switch is not.
    */
    const { el, onPick } = await render({ activeId: 'left' });

    await act(async () => {
      seg(el, 'left')?.click();
      await Promise.resolve();
    });

    expect(onPick).toHaveBeenCalledWith('left');
  });

  it('🔴 the accessible name carries the look id and says which is CURRENT — never “on air”', async () => {
    // The label is an ordinal an operator can call over talkback; the id is the authored
    // handle. Both are needed and neither belongs in the other's place.
    const { el } = await render({ activeId: 'right' });

    expect(seg(el, 'right')?.getAttribute('aria-label')).toBe('Look Right pair (right) — current');
    expect(seg(el, 'left')?.getAttribute('aria-label')).toBe('Look Left pair (left)');
  });

  it('an unresolved active look marks nothing rather than guessing', async () => {
    // Should not happen — the bridge resolves through one chain and always answers when a
    // template has looks — but marking a segment on a guess would be the readout lying.
    const { el } = await render({ activeId: undefined });
    expect(pressed(el)).toEqual([]);
  });
});

// ── 7.1 — the refusal, present-but-disabled ───────────────────────────────────

describe('7.1 — an unreachable server DISABLES the picker; it never removes it', () => {
  it('🔴 stays present, goes disabled, and says why', async () => {
    /*
      The opposite treatment from the live-sources tab's layer-state gate, and the
      distinction is the one the station tab documents: a MISSING picker means "this
      template has no looks", a permanent fact. Unreachability is transient and returns
      with the link, so removing the control would make the row look like a different kind
      of row every time the link blinks.
    */
    const { el, onPick } = await render({ refusal: 'CasparCG is not reachable.' });

    const s = seg(el, 'right');
    expect(s, 'still there').not.toBeNull();
    expect(s?.disabled).toBe(true);
    expect(s?.getAttribute('title')).toBe('CasparCG is not reachable.');

    await act(async () => {
      s?.click();
      await Promise.resolve();
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('still SHOWS which look is live while it cannot switch', async () => {
    // The readout half survives the disabled half: an operator who cannot switch still has
    // to know what is on air, and that is most of what this control is for.
    const { el } = await render({ activeId: 'all', refusal: 'Not connected.' });
    expect(pressed(el)).toEqual(['all']);
  });
});

// ── the absent-vs-empty rule ──────────────────────────────────────────────────

describe('🔴 whether a picker exists at all — absent is NOT empty', () => {
  // `B-151` — `lookOptionsOf` takes the CARRIER now, not a whole `TemplateInfo`: PVW has
  // the carrier and no TemplateInfo, and a sibling that read a different field would have
  // been a second answer to "which looks does this template have".
  const tpl = (liveSources: TemplateInfo['liveSources']): TemplateInfo['liveSources'] =>
    liveSources;

  it('a template with NO look group gets no picker', () => {
    /*
      `buildTemplateLiveSources` spreads `looks` only when the scene HAS a look group, so
      `undefined` means "authored before LOOKS, or against the arrangement carrier". Those
      templates work perfectly and must never be treated as broken.
    */
    expect(
      lookOptionsOf(
        tpl({
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [],
        }),
      ),
    ).toBeNull();
  });

  it('a group authoring ZERO looks also gets no picker — the refusal is the take’s job', () => {
    // `[]` is the positive statement "this group authors none". It IS broken, but it is
    // refused at the take door where it can be explained; a picker with no segments would
    // be a dead control on a row that should not have gone to air.
    expect(
      lookOptionsOf(
        tpl({
          resolution: { width: 1920, height: 1080 },
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          sources: [],
          looks: [],
        }),
      ),
    ).toBeNull();
  });

  it('a group with looks gets one segment each, labelled by the AUTHORED name', () => {
    const opts = lookOptionsOf(
      tpl({
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
        sources: [],
        looks: [
          { id: 'a', name: 'A', entered: { mode: 'cut' }, rects: {} },
          { id: 'b', name: 'B', entered: { mode: 'cut' }, rects: {} },
        ],
        defaultLookId: 'a',
      }),
    );
    expect(opts).toEqual([
      { id: 'a', label: 'A', frames: [] },
      { id: 'b', label: 'B', frames: [] },
    ]);
  });

  it('no carrier at all gets no picker', () => {
    // A template the registry has not answered for yet, and one that declares no live
    // sources, are the same answer here: nothing to pick.
    expect(lookOptionsOf(undefined)).toBeNull();
  });
});

// ── `RUNTIME-REDESIGN-01` §4 — THE SET IS THE TEMPLATE'S OWN ─────────────────

describe('🔴 §4 — frame count, look count and look id are three different things', () => {
  /*
    A SIX-frame template declaring FIVE looks of 1, 2, 3, 4 and 6 frames — no 5-frame look —
    with word ids whose membership is irregular (`pair` places frames 2 and 5). Built so that
    no one of the three can stand in for another: a picker that invented a look per frame
    count would produce a sixth entry; one that numbered looks would lose `pair`; one that
    read a count out of an id would have nothing to read.
  */
  const SCENE = { width: 1920, height: 1080 };
  const cell = (i: number) => ({
    x: (i % 3) * 640,
    y: Math.floor(i / 3) * 540,
    width: 640,
    height: 540,
  });
  const KEYS = ['l-1', 'l-2', 'l-3', 'l-4', 'l-5', 'l-6'];
  const rects = (ks: string[]) =>
    Object.fromEntries(ks.map((k) => [k, cell(KEYS.indexOf(k))] as const));
  const look = (id: string, name: string, ks: string[]) => ({
    id,
    name,
    entered: { mode: 'cut' as const },
    rects: rects(ks),
  });
  const sixFrames = (): TemplateInfo['liveSources'] => ({
    resolution: SCENE,
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: KEYS.map((k, i) => ({
      elementId: `el-${k}`,
      sourceId: k,
      rect: cell(i),
      dynamic: false,
    })),
    looks: [
      {
        id: 'solo',
        name: 'Solo',
        entered: { mode: 'cut' as const },
        rects: { 'l-1': { x: 0, y: 0, width: 1920, height: 1080 } },
      },
      look('pair', 'Pair', ['l-2', 'l-5']),
      look('trio', 'Trio', ['l-1', 'l-3', 'l-5']),
      look('quad', 'Quad', ['l-1', 'l-2', 'l-4', 'l-6']),
      look('panel', 'Panel', KEYS),
    ],
    defaultLookId: 'trio',
  });

  it('🔴 renders exactly the looks the template declares — five, in authored order, not six', () => {
    const opts = lookOptionsOf(sixFrames());
    // Non-empty first, then identity.
    expect(opts).not.toBeNull();
    expect(opts?.map((o) => o.id)).toEqual(['solo', 'pair', 'trio', 'quad', 'panel']);
    expect(opts?.map((o) => o.label)).toEqual(['Solo', 'Pair', 'Trio', 'Quad', 'Panel']);
    // Six frames, FIVE looks: no look is invented from the frame count.
    expect(opts?.length).toBe(5);
    expect(sixFrames()?.sources.length).toBe(6);
  });

  it('🔴 each look carries ITS OWN frames — a count per look, and membership, never the template’s', () => {
    const opts = lookOptionsOf(sixFrames()) ?? [];
    expect(opts.map((o) => o.frames.length)).toEqual([1, 2, 3, 4, 6]);
    // No look has five frames, and nothing here can produce one.
    expect(opts.some((o) => o.frames.length === 5)).toBe(false);
    // `pair` is frames 2 and 5 — the id says nothing about which, and the count says nothing
    // about which either; only the look's own rects do.
    expect(opts[1]?.frames.map((f) => f.plateId)).toEqual(['l-2', 'l-5']);
    expect(opts[3]?.frames.map((f) => f.plateId)).toEqual(['l-1', 'l-2', 'l-4', 'l-6']);
  });

  it('a frame is normalised to the SCENE, so the thumbnail draws the look’s real arrangement', () => {
    const opts = lookOptionsOf(sixFrames()) ?? [];
    // `solo`: the same PLATE as trio's first frame, at a different rect — the whole raster.
    expect(opts[0]?.frames[0]).toEqual({ plateId: 'l-1', x: 0, y: 0, w: 1, h: 1 });
    // `pair`: frame 2 is the top-middle cell, frame 5 the bottom-middle — a 3 × 2 grid.
    expect(opts[1]?.frames[0]).toEqual({ plateId: 'l-2', x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 });
    expect(opts[1]?.frames[1]).toEqual({ plateId: 'l-5', x: 1 / 3, y: 0.5, w: 1 / 3, h: 0.5 });
  });

  it('🔴 the rendered strip has one segment per declared look, each thumbnail with that look’s cells', async () => {
    const opts = lookOptionsOf(sixFrames()) ?? [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(
        createElement(LookPicker, {
          looks: opts,
          activeId: 'trio',
          refusal: undefined,
          onPick: vi.fn(),
          rowName: 'Bed 1',
          target: 'air',
        }),
      );
    });
    const segs = [...container.querySelectorAll<HTMLElement>('[data-look-id]')];
    expect(segs.map((s) => s.getAttribute('data-look-id'))).toEqual([
      'solo',
      'pair',
      'trio',
      'quad',
      'panel',
    ]);
    expect(segs.map((s) => s.getAttribute('data-look-frames'))).toEqual(['1', '2', '3', '4', '6']);
    expect(segs.map((s) => s.querySelectorAll('[data-look-frame]').length)).toEqual([
      1, 2, 3, 4, 6,
    ]);
    expect(
      [...(segs[1]?.querySelectorAll('[data-look-frame]') ?? [])].map((c) =>
        c.getAttribute('data-look-frame'),
      ),
    ).toEqual(['l-2', 'l-5']);
    // The tooltip names the look's own frame count in the operator's words, then the id.
    expect(segs[0]?.getAttribute('title')).toBe('1 frame · solo');
    expect(segs[1]?.getAttribute('title')).toBe('2 frames · pair');
    // The thumbnail is decoration for a control that already names its frames.
    expect(segs[0]?.querySelector('[data-look-thumb]')?.getAttribute('aria-hidden')).toBe('true');
    expect(pressed(container)).toEqual(['trio']);
  });

  it('frameCountLabel — one frame, N frames', () => {
    expect(frameCountLabel(1)).toBe('1 frame');
    expect(frameCountLabel(6)).toBe('6 frames');
  });
});

// ── 5.5 / 7.2 — DENSITY ───────────────────────────────────────────────────────

describe('🔴 5.5 / 7.2 — the second line costs the column model NOTHING', () => {
  /*
    ── THE INVARIANT WITH A RECORDED ON-AIR FAILURE BEHIND IT ────────────────────

    `VERB_COUNT` drives BOTH the header's word row and the row's button row from one
    `gridTemplateColumns(density)` call. The last time a control was added without
    updating it, every header word from NEXT rightward sat above the WRONG glyph — in a
    product where STOP (graceful) and CLEAR (hard kill) are the inverse of the reference
    product's. That is why the picker went on a SECOND LINE spanning `1 / -1` rather than
    into the grid as a column.
  */

  it('VERB_COUNT is still six and the verb block is still its width', () => {
    expect(VERB_COUNT).toBe(6);
    expect(VERBS_WIDTH_PX).toBe(6 * 48 + 5 * 12);
  });

  it('🔴 the density arithmetic is untouched — a spanning row adds no column', () => {
    // `minWidthFor` sums rigid columns + flexible floors + gaps + padding. A `1 / -1`
    // child contributes none of those, which is exactly why `resolveDensity` stays correct
    // on a row that has a picker.
    // `B-224` widened the state column to 150 and lifted the alias floor to 150 (both
    // measured, see `layerTable.test.ts`); the SUM is what this case pins, not the widths.
    expect(minWidthFor('full')).toBe(34 + 150 + VERBS_WIDTH_PX + 150 + 160 + 4 * 12 + 24);
    // FOUR columns at tight (rowNum, state icon, alias floor 0, verbs) ⇒ THREE gaps.
    expect(minWidthFor('tight')).toBe(34 + 34 + VERBS_WIDTH_PX + 0 + 3 * 12 + 24);
  });

  it('the tightest density still ends with the full verb block', () => {
    // The picker must not be able to squeeze the controls: at `tight` the ALIAS floor is
    // already 0 because text gives way before a button ever does.
    expect(gridTemplateColumns('tight')).toBe(
      `34px 34px minmax(0px, 1fr) ${String(VERBS_WIDTH_PX)}px`,
    );
  });

  it('🔴 the picker line SPANS every column and can never widen the row', async () => {
    /*
      `1 / -1` rather than a numeric end, because the column COUNT changes with density —
      five at `full`, four once the template column drops. And `overflow-x: auto` with
      `min-width: 0` so an unusually long look strip scrolls INSIDE the line instead of
      pushing the grid wider and clipping the verbs.
    */
    const { el } = await render();
    const line = el.querySelector<HTMLElement>('[data-look-picker]');

    expect(line).not.toBeNull();
    expect(line?.style.gridColumn).toBe('1 / -1');
    expect(line?.style.overflowX).toBe('auto');
    // jsdom normalises a unitless zero to `0`, not `0px`.
    expect(line?.style.minWidth).toBe('0');
  });

  it('the strip is a labelled group, so its segments are not loose buttons on the row', async () => {
    const { el } = await render();
    const line = el.querySelector('[data-look-picker]');
    expect(line?.getAttribute('role')).toBe('group');
    expect(line?.getAttribute('aria-label')).toBe('Look for Layer 1');
  });
});

// ── the refusal wording ───────────────────────────────────────────────────────

describe('lookSwitchRefusal — the bridge’s sentence first', () => {
  it('🔴 prefers the bridge’s message, which carries the specifics', () => {
    // Only the bridge knows WHICH template is already on air and with how many boxes.
    expect(lookSwitchRefusal('multibox-already-on-air', 'the news 3-box is already on air')).toBe(
      'the news 3-box is already on air',
    );
  });

  it('falls back to the stack vocabulary when there is no message', () => {
    // `errorCodeMessage` is the STACK's table and already words `disconnected`; a second
    // table for looks would be that vocabulary spelled twice.
    expect(lookSwitchRefusal('disconnected', undefined)).toContain('Not connected to CasparCG');
  });

  it('words the two multi-box refusals that had NO sentence before this session', () => {
    expect(lookSwitchRefusal('multibox-already-on-air', undefined)).toContain(
      'Another multi-box graphic is already on air',
    );
    expect(lookSwitchRefusal('looks-none-authored', undefined)).toContain('no looks authored');
  });

  it('an unknown code is surfaced verbatim rather than swallowed', () => {
    // The B-070 stance: a code the operator can quote beats a generic dead end.
    expect(lookSwitchRefusal('weird-new-code', undefined)).toContain('weird-new-code');
  });

  it('and a refusal with neither still says something', () => {
    expect(lookSwitchRefusal(undefined, undefined)).toBe('The look switch was not accepted.');
  });
});

// ── `B-151` — WHAT THIS PRESS CHANGES, said on the control itself ─────────────

describe('B-151 — the picker names its TARGET, because one control serves two', () => {
  /*
    The owner's correction to session BL removed a duplicate picker above PVW: the row's LOOK
    buttons already drove the preview, and two controls for one operation is this repo's
    two-spellings defect. That leaves ONE control whose effect follows the ROW's state — the
    preview while rehearsing, air otherwise — and the client's requirement is that the
    operator cannot be mistaken about which.

    The row's state cell already says REHEARSING or ON AIR. This puts the same answer on the
    control the hand is on, so it is legible at the point of action rather than three columns
    away.
  */
  it('🔴 an ON-AIR row’s picker says LOOK, and does not claim to be a preview', async () => {
    const { el } = await render({ target: 'air' });
    expect(el.textContent).toContain('LOOK');
    expect(el.textContent).not.toContain('PVW LOOK');
    expect(el.querySelector('[data-look-target="air"]')).not.toBeNull();
  });

  it('🔴 a REHEARSING row’s picker says PVW LOOK', async () => {
    const { el } = await render({ target: 'preview' });
    expect(el.textContent).toContain('PVW LOOK');
    expect(el.querySelector('[data-look-target="preview"]')).not.toBeNull();
  });

  it('the ACCESSIBLE name carries the target too — the answer is not colour or layout', async () => {
    // A sighted operator reads the label; a screen-reader operator must get the same fact,
    // and neither should have to infer it from where the control sits.
    const { el } = await render({ target: 'preview' });
    expect(el.querySelector('[data-look-picker]')?.getAttribute('aria-label')).toBe(
      'Preview look for Layer 1',
    );
    expect(seg(el, 'left')?.getAttribute('aria-label')).toContain('Preview look');
  });

  /**
   * 🔴 `B-168` — the picker SAYS it commits immediately.
   *
   * Owner's decision 2026-08-25 (option b): the look pick stays immediate rather than becoming
   * staged, because a staged look lets the row SHOW one look while the picker CLAIMS another —
   * the confidently-wrong-surface class this product fears most. What was missing was that
   * nothing on the control said so, while every field beside it on that panel waits for UPDATE.
   */
  it('🔴 B-168: the label says the press applies NOW — on air', async () => {
    const { el } = await render({ target: 'air' });
    expect(el.textContent).toContain('NOW');
  });

  it('🔴 B-168: …and on preview, where the press is equally immediate', async () => {
    // A rehearsing row's press reaches PVW at once for the same reason. Asserted separately
    // rather than looped, because the harness tears down per test.
    const { el } = await render({ target: 'preview' });
    expect(el.textContent).toContain('NOW');
  });

  it('🔴 B-168: the reason names the CONTRAST — it does not wait for UPDATE', async () => {
    // "Applies immediately" alone is not the useful half. The operator's question is why this
    // control differs from the fields beside it, so the sentence has to name UPDATE.
    const { el } = await render();
    const label = [...el.querySelectorAll('[title]')]
      .map((n) => n.getAttribute('title') ?? '')
      .find((t) => t.includes('IMMEDIATELY'));
    expect(label).toBeDefined();
    expect(label).toMatch(/does not wait for UPDATE/i);
    expect(label).toMatch(/cut/i);
  });
});
