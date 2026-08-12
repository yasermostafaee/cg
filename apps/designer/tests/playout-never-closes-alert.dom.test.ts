/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Composition, Element, Scene } from '@cg/shared-schema';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { PlayoutSection } from '../src/renderer/features/inspector/PlayoutSection.js';

/**
 * R — the "won't auto-close" alert must track the CONSEQUENCE, not a special case of the cause.
 *
 * A content-driven hold is `Promise.all` over its effective drivers, so ONE infinite driver keeps
 * the graphic on air until `stop()`. The banner escalated on EVERY driver being infinite, so
 * ticking a FINITE driver (a `freeze` Lottie completes at its intro end) made it unmount — while
 * its headline claim was still true. An alert that disappears at the moment the operator acts
 * reads as confirmation that the action fixed the problem, which is worse than never showing it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = {
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 10, h: 10 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
} as const;

const font = {
  family: 'Vazirmatn',
  weight: 500,
  style: 'normal',
  size: 36,
  lineHeight: 1.4,
  letterSpacing: 0,
} as const;

function ticker(id: string, repeat: number | 'infinite'): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'ticker',
    font,
    color: '#FFFFFF',
    direction: 'rtl',
    speed: 100,
    gap: 10,
    repeat,
    cycleBoundary: 'seamless',
    items: [{ id: 'i', text: 'hello' }],
  } as unknown as Element;
}

function lottie(
  id: string,
  o: { drivesHold?: boolean; hold?: 'freeze' | 'idle-loop' } = {},
): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'lottie',
    assetId: 'asset-a',
    speed: 1,
    loopMode: 'none',
    holdBehavior: o.hold ?? 'freeze',
    ...(o.drivesHold === undefined ? {} : { drivesHold: o.drivesHold }),
  } as unknown as Element;
}

function instance(
  id: string,
  compositionId: string,
  holdOverrides?: Record<string, boolean>,
): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'composition',
    compositionId,
    ...(holdOverrides === undefined ? {} : { holdOverrides }),
  } as unknown as Element;
}

/** A scene whose playout SHOWS the checklist: an out-point, `auto-out`, content-driven hold. */
function scene(children: Element[], compositions?: Composition[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-r',
    name: 'r',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    lifecycle: { outPoint: 60 },
    playout: { mode: 'auto-out', holdSource: 'content-driven' },
    layers: [{ id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    ...(compositions === undefined ? {} : { compositions }),
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

function comp(id: string, children: Element[]): Composition {
  return {
    id,
    name: id,
    frameRange: { in: 0, out: 100 },
    layers: [
      { id: `${id}-L1`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
    ],
  } as unknown as Composition;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function render(s: Scene): void {
  act(() => {
    root.render(createElement(PlayoutSection, { scene: s }));
  });
}

/** The banner, found by the property that has already regressed once: its ALERT role. */
const alert = (): HTMLElement | null => host.querySelector('[role="alert"]');
const alertText = (): string => alert()?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('R — the never-closes alert tracks the consequence', () => {
  it('ONE infinite driver beside a finite one still shows it — the mixed case', () => {
    render(scene([ticker('Crawl', 'infinite'), lottie('Sting', { drivesHold: true })]));
    expect(alert()).not.toBeNull();
    // …and it NAMES the culprit rather than claiming "every".
    expect(alertText()).toContain('Crawl');
    expect(alertText()).toContain('won’t auto-close');
    expect(alertText()).not.toContain('every content driver');
  });

  it('THE OBSERVED TRANSITION: ticking a finite driver keeps the alert across the re-render', () => {
    // The whole defect in one test. Before: the tick added a finite driver, `every` stopped
    // holding, and the alert unmounted at the exact moment the operator acted.
    const s = scene([ticker('Crawl', 'infinite'), lottie('Sting')]);
    designerStore.setScene(s, null);
    const live = (): Scene => {
      const st = designerStore.get();
      return editSceneOf(st.scene, st.activeCompositionId)!;
    };
    render(live());
    expect(alert()).not.toBeNull();

    const box = host.querySelector<HTMLInputElement>('input[aria-label="Sting drives the hold"]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(false);
    act(() => box!.click());

    // Re-render from the store, exactly as the panel does when the scene changes.
    render(live());
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="Sting drives the hold"]')!.checked,
    ).toBe(true);
    expect(alert()).not.toBeNull();
    expect(alertText()).toContain('Crawl');
  });

  it('EVERY driver infinite still shows it, and names them all', () => {
    render(scene([ticker('Crawl', 'infinite'), ticker('Strap', 'infinite')]));
    expect(alert()).not.toBeNull();
    expect(alertText()).toContain('Crawl');
    expect(alertText()).toContain('Strap');
    expect(alertText()).toContain('repeat forever');
  });

  it('all drivers FINITE hides it', () => {
    render(scene([ticker('Crawl', 3), lottie('Sting', { drivesHold: true })]));
    expect(alert()).toBeNull();
  });

  it('NO effective drivers hides it — an unticked infinite driver cannot hold anything', () => {
    render(scene([ticker('Crawl', 'infinite'), lottie('Sting')]));
    expect(alert()).not.toBeNull(); // the ticker participates by default…
    render(scene([{ ...(ticker('Crawl', 'infinite') as object), drivesHold: false } as Element]));
    expect(alert()).toBeNull(); // …and excluded, nothing drives the hold
  });

  it('an infinite driver reachable only THROUGH a nested instance shows it; the override hides it', () => {
    const compositions = [comp('inner', [ticker('InnerCrawl', 'infinite')])];
    render(scene([instance('Home', 'inner'), ticker('Strap', 3)], compositions));
    expect(alert()).not.toBeNull();
    expect(alertText()).toContain('Home'); // named by its INSTANCE — a deeper driver has no row

    // D-112 — the per-instance override excludes it, and the consequence goes with it.
    render(
      scene([instance('Home', 'inner', { InnerCrawl: false }), ticker('Strap', 3)], compositions),
    );
    expect(alert()).toBeNull();
  });

  it('an IDLE-LOOP Lottie counts as infinite — the two media kinds spell it differently', () => {
    // A video's never-completing hold is `loop`; a Lottie's is `idle-loop`. The checklist tested
    // only `'loop'`, so an idle-loop Lottie was marked a finite CLOSER while the runtime holds it
    // until stop() ("like an infinite ticker").
    render(scene([lottie('Loop', { drivesHold: true, hold: 'idle-loop' })]));
    expect(alert()).not.toBeNull();
    expect(alertText()).toContain('Loop');
  });

  it('keeps BOTH the caution variant and the assertive role in every showing case', () => {
    // The property that already regressed once (#352's variant swap demoted the role to
    // `status`). Asserted directly, in the mixed case, because that is the case that used to
    // render nothing at all.
    render(scene([ticker('Crawl', 'infinite'), lottie('Sting', { drivesHold: true })]));
    const el = alert();
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('alert');
    expect(el!.className).toMatch(/caution/i);
  });
});
