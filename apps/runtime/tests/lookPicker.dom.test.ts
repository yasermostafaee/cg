// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { LookPicker, lookOptionsOf } from '../src/renderer/features/layers/LookPicker.js';
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
  { id: 'left', label: '1' },
  { id: 'right', label: '2' },
  { id: 'all', label: '3' },
];

async function render(
  over: {
    activeId?: string | undefined;
    refusal?: string | undefined;
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

  it('🔴 re-pressing the LIVE look sends nothing', async () => {
    /*
      A no-op re-press would run a reconcile and a CG UPDATE for a picture that is not
      changing — and on a cut that is a visible re-assert. Dropped at the control rather
      than at the bridge, so the wire never sees it at all.
    */
    const { el, onPick } = await render({ activeId: 'left' });

    await act(async () => {
      seg(el, 'left')?.click();
      await Promise.resolve();
    });

    expect(onPick).not.toHaveBeenCalled();
  });

  it('the accessible name carries the look id AND says which is on air', async () => {
    // The label is an ordinal an operator can call over talkback; the id is the authored
    // handle. Both are needed and neither belongs in the other's place.
    const { el } = await render({ activeId: 'right' });

    expect(seg(el, 'right')?.getAttribute('aria-label')).toBe('Look 2 (right) — on air');
    expect(seg(el, 'left')?.getAttribute('aria-label')).toBe('Look 1 (left)');
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
  const tpl = (liveSources: TemplateInfo['liveSources']): TemplateInfo =>
    ({ templateId: 't', templateType: 'clock', fields: [], liveSources }) as TemplateInfo;

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

  it('a group with looks gets one segment each, labelled by ordinal', () => {
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
      { id: 'a', label: '1' },
      { id: 'b', label: '2' },
    ]);
  });

  it('a null template gets no picker', () => {
    expect(lookOptionsOf(null)).toBeNull();
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
    expect(minWidthFor('full')).toBe(34 + 132 + VERBS_WIDTH_PX + 132 + 160 + 4 * 12 + 24);
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
