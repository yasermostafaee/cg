// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RehearsalStage } from '../src/renderer/features/monitors/RehearsalStage.js';
import type { RehearsalSubject } from '../src/renderer/features/monitors/rehearsalFrames.js';
import type { PvwPage } from '../src/shared/pvwPage.js';

/**
 * 🔴 `RELEASE-091-01` §1 (`B-288`) — **A ROW WITH NO PAGE SAYS WHY, IN ONE LINE THAT NAMES ITS
 * TEMPLATE**, and never again "re-import it in this browser": the page comes from the bridge now, so
 * there is nothing to re-import here. The words only; the real render is `pvw-from-bridge.spec.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function subject(itemId: string, channel: number): RehearsalSubject {
  return {
    itemId,
    layer: 99,
    channel,
    rowName: 'Layer 99',
    fields: {},
  } as unknown as RehearsalSubject;
}

function render(
  pages: Record<string, PvwPage | null>,
  names: Record<string, string | null>,
): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(RehearsalStage, {
        subjects: Object.keys(pages).map((id) => subject(id, 2)),
        pageByItem: new Map(Object.entries(pages)),
        templateNames: new Map(Object.entries(names)),
        raster: { width: 1920, height: 1080 },
      }),
    );
  });
  return host;
}

describe('RELEASE-091-01 §1 — the one line for a row with no page', () => {
  it('🔴 names the template and the reason, for each reason', () => {
    const el = render(
      {
        a: { kind: 'missing', reason: 'not-listed' },
        b: { kind: 'missing', reason: 'no-file' },
        c: { kind: 'missing', reason: 'unreachable' },
      },
      { a: 'زیرنویس خبر', b: 'Logo', c: 'Score' },
    );
    const lines = [...el.querySelectorAll('[data-pvw-missing]')].map((l) => l.textContent);
    expect(lines).toEqual([
      'زیرنویس خبر is not on CH 2’s list.',
      'The bridge holds no page for Logo on CH 2.',
      'Score: the bridge cannot be reached, and this browser holds no copy of its page.',
    ]);
    // Each name is isolated for the bidi algorithm (golden rule 11).
    expect(el.querySelector('[data-pvw-missing="not-listed"] bdi')?.textContent).toBe(
      'زیرنویس خبر',
    );
  });

  it('CONTROL — the old sentence is gone, and a row still being read shows no sentence at all', () => {
    const el = render(
      { a: { kind: 'missing', reason: 'no-file' }, b: null },
      { a: 'Logo', b: 'Score' },
    );
    expect(el.textContent ?? '').not.toMatch(/re-import it in this browser/i);
    expect(el.textContent ?? '').not.toMatch(/unavailable in this browser/i);
    expect(el.querySelectorAll('[data-pvw-missing]')).toHaveLength(1);
  });
});
