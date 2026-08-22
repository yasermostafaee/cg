// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { toMenuItems } from '../src/renderer/ui/rowAction.js';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { LivePlateAudioDialog } from '../src/renderer/features/layers/LivePlateAudioDialog.js';
import { bindingFor, itemWith, rowDeps, templateWith } from './support/layerRow.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * C-015 phase 6 (6.5f) — **the operator surface for the RAISE half of the audio
 * rule.**
 *
 * Until this existed, every Live Source plate was permanently silent: the rule
 * creates every producer muted and says audio may be raised only by an explicit
 * recorded intent, and nothing recorded one. These assertions are about the two
 * things that make the surface usable rather than merely present — that it is
 * reachable from the ROW the operator is already looking at, and that it never
 * shows a state the bridge has not accepted.
 */

const TEMPLATE = templateWith({
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 0, y: 0, width: 400, height: 225 },
        dynamic: false,
      },
      {
        elementId: 'el-2',
        sourceId: 'guest-2',
        rect: { x: 600, y: 0, width: 400, height: 225 },
        dynamic: false,
      },
    ],
  },
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  clearPortals();
  vi.restoreAllMocks();
});

function renderDialog(
  onSetVolume: (
    plateId: string,
    volume: number,
  ) => Promise<{ ok: boolean; reason?: string | undefined }>,
  over: Parameters<typeof itemWith>[1] = {},
): void {
  host = document.createElement('div');
  document.body.append(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(LivePlateAudioDialog, {
        item: itemWith('on-air', over),
        template: TEMPLATE,
        onSetVolume,
        onClose: () => undefined,
      }),
    );
  });
}

/**
 * Drag the slider to `percent`, WITHOUT releasing it.
 *
 * React keeps a value TRACKER on every controlled input and skips its onChange when
 * the node value is assigned directly, because as far as the tracker is concerned
 * nothing changed. Going through the prototype setter is the standard way to defeat
 * it; a bare `el.value = …` silently dispatches nothing and the assertion below
 * would then pass for the wrong reason. A range input reports through `input`.
 */
function dragSlider(el: HTMLInputElement | undefined, percent: number): void {
  if (el === undefined) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, String(percent));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Release the slider.
 *
 * jsdom implements no `PointerEvent` constructor at all, so the event is built
 * with whichever constructor exists. React delegates on the native event TYPE, so
 * a plain `Event('pointerup')` reaches the same `onPointerUp` handler a real
 * release does — the fidelity gap is in the event OBJECT, not in the path.
 */
function releaseSlider(el: HTMLInputElement | undefined): void {
  const Ctor: new (type: string, init?: EventInit) => Event = globalThis.PointerEvent ?? Event;
  el?.dispatchEvent(new Ctor('pointerup', { bubbles: true }));
}

const sliders = (): HTMLInputElement[] => [
  ...(openDialog()?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []),
];
const muteButtons = (): HTMLButtonElement[] =>
  [...(openDialog()?.querySelectorAll('button') ?? [])].filter(
    (b) => b.textContent === 'MUTE',
  ) as HTMLButtonElement[];

describe('6.5f — the AUDIO verb is on the ROW, beside SOURCE', () => {
  it('a row whose template declares plates offers AUDIO', () => {
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), hasLivePlates: true }),
    );
    const audio = actions.find((a) => a.key === 'plate-audio');
    expect(audio, 'the AUDIO verb must be offered').toBeDefined();
    expect(audio?.disabled).toBe(false);
    expect(audio?.surface).toBe('menu');
    expect(toMenuItems(actions).some((i) => i.label === 'AUDIO')).toBe(true);
  });

  it('🔴 it sits BESIDE the source swap — one decision, one place', () => {
    // The owner's placement: under pressure, "which source" and "how loud" are one
    // decision. Asserted as ADJACENCY rather than as mere presence, because the
    // whole point of the decision was where it sits relative to SOURCE.
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), hasLivePlates: true }),
    );
    const keys = actions.map((a) => a.key);
    expect(Math.abs(keys.indexOf('plate-audio') - keys.indexOf('swap-source'))).toBe(1);
  });

  it('a template with NO live plates does not offer it at all', () => {
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), hasLivePlates: false }),
    );
    expect(actions.some((a) => a.key === 'plate-audio')).toBe(false);
  });

  it('it is offered on a row that is NOT yet on air — arming ahead of the take', () => {
    // The intent can be set before anything is seated; the take carries it. That is
    // what stops the operator having to chase a silent guest after the graphic is up.
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('loaded')), hasLivePlates: true }),
    );
    expect(actions.find((a) => a.key === 'plate-audio')?.disabled).toBe(false);
  });

  it('it is refused with the playout server unreachable — raising emits a MIXER', () => {
    const actions = layerRowActions(
      rowDeps({
        binding: bindingFor(itemWith('on-air')),
        hasLivePlates: true,
        casparReach: 'unreachable',
      }),
    );
    expect(actions.find((a) => a.key === 'plate-audio')?.disabled).toBe(true);
  });
});

describe('6.5f — the dialog states the rule and commits one decision at a time', () => {
  it('says every plate starts SILENT, and why', () => {
    renderDialog(() => Promise.resolve({ ok: true }));
    const text = openDialog()?.textContent ?? '';
    expect(text).toContain('silent');
    // The REASON, not just the state: a plate carries a guest's live microphone.
    expect(text).toMatch(/microphone/i);
    // …and that it is per-row and durable, so the operator knows what they changed.
    expect(text).toMatch(/this row/i);
  });

  it('shows one control per plate, and says which are audible', () => {
    renderDialog(() => Promise.resolve({ ok: true }), { plateVolumes: { 'guest-1': 1 } });
    expect(sliders()).toHaveLength(2);
    const text = openDialog()?.textContent ?? '';
    expect(text).toContain('guest-1');
    expect(text).toContain('guest-2');
    // Audio is the one property of a graphic an operator cannot SEE, so the row
    // has to say it in words.
    expect(text).toContain('audible on air');
    expect(text).toContain('100%');
  });

  it('🔴 MUTE commits 0 in one press — the urgent direction is one gesture', () => {
    // Dragging a slider to exactly zero under pressure is a worse gesture than
    // pressing one button, and an open microphone is the failure with seconds on it.
    const onSetVolume = vi.fn(() => Promise.resolve({ ok: true }));
    renderDialog(onSetVolume, { plateVolumes: { 'guest-1': 1 } });

    act(() => {
      muteButtons()[0]?.click();
    });

    expect(onSetVolume).toHaveBeenCalledWith('guest-1', 0);
  });

  it('MUTE is disabled on a plate that is already silent', () => {
    renderDialog(() => Promise.resolve({ ok: true }), { plateVolumes: { 'guest-1': 1 } });
    const [first, second] = muteButtons();
    expect(first?.disabled).toBe(false);
    // `guest-2` has no intent at all, so it is silent and there is nothing to mute.
    expect(second?.disabled).toBe(true);
  });

  it('🔴 the slider commits on RELEASE, not on every drag frame', () => {
    // One AMCP command per decision rather than one per pixel.
    const onSetVolume = vi.fn(() => Promise.resolve({ ok: true }));
    renderDialog(onSetVolume);
    const slider = sliders()[0];

    act(() => {
      dragSlider(slider, 60);
    });
    expect(onSetVolume, 'dragging must not commit').not.toHaveBeenCalled();

    act(() => {
      releaseSlider(slider);
    });
    expect(onSetVolume).toHaveBeenCalledWith('guest-1', 0.6);
  });

  it('🔴 an explicit 0 reads as 0%, NOT as an unset plate — zero is falsy', () => {
    // A plate the operator deliberately muted and a plate nobody has spoken about
    // both show 0%; what must not happen is the explicit 0 being dropped and the
    // control falling back to some other value.
    renderDialog(() => Promise.resolve({ ok: true }), {
      plateVolumes: { 'guest-1': 0, 'guest-2': 1 },
    });
    expect(sliders()[0]?.value).toBe('0');
    expect(sliders()[1]?.value).toBe('100');
    expect(muteButtons()[0]?.disabled, 'nothing to mute on an already-silent plate').toBe(true);
  });

  it('🔴 a REFUSED change does not leave the control showing a value the bridge rejected', async () => {
    const onSetVolume = vi.fn(() => Promise.resolve({ ok: false, reason: 'disconnected' }));
    renderDialog(onSetVolume);
    const slider = sliders()[0];

    await act(async () => {
      dragSlider(slider, 80);
      releaseSlider(slider);
      await Promise.resolve();
    });

    // The optimistic position is dropped and the PUBLISHED value stands. Showing a
    // level the bridge refused would be the optimistic-UI lie this project rejects
    // everywhere else — and for audio it means believing a guest is muted when
    // they are not.
    expect(sliders()[0]?.value).toBe('0');
    expect(openDialog()?.textContent).toMatch(/refused, not queued/i);
  });
});
