/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ExportIssue } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import { TAG_MARKER } from '@cg/ui';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * 🔴 `TAG-NOT-BUTTON-07` §6 — **THE GUARD, DESIGNER SIDE.**
 *
 * `@cg/ui` is shared config and the Designer renders through it, so the tag contract is asserted
 * in BOTH apps or it is asserted in neither: a rule only one suite checks is a rule the other
 * app drifts away from.
 *
 * ── WHY THE STATUS BAR ───────────────────────────────────────────────────────────────────
 *
 * Because it is the one Designer surface that carries BOTH halves of the rule at once, which
 * makes it the only place the MATCH can be tested rather than just the ban:
 *
 *   - four readouts (`no project` / fps / duration / resolution) that do NOTHING when pressed
 *     and must therefore not be buttons, not be focusable, and carry no hover treatment; and
 *   - the ISSUES pill, which DOES something (it opens the issues panel) and must therefore stay
 *     a real `<button>` — chip-shaped and correctly so.
 *
 * A guard that only forbade would be satisfied by flattening the issues pill into text, taking
 * a working control away from every keyboard operator. Asserting both directions is what stops
 * the "fix" from being a regression.
 *
 * ⚠ jsdom has no layout and its cascade is not Chrome's (golden rule 12), so nothing here
 * asserts geometry or hover. Element type, ARIA role, focusability and the marker are real in
 * jsdom, and they are all this file claims.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const SCENE = {
  frameRate: 25,
  frameRange: { in: 0, out: 250 },
  resolution: { width: 1920, height: 1080 },
} as unknown as Scene;

const ISSUE = {
  severity: 'error',
  message: 'A live source overlaps another',
} as unknown as ExportIssue;

function render(issues: readonly ExportIssue[], scene: Scene | null = SCENE): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  act(() => {
    r.render(createElement(StatusBar, { scene, issues }));
  });
  return container;
}

describe('the Designer status bar', () => {
  /*
    BOTH BRANCHES, because the bar renders a different set of readouts in each and a sweep of
    one leaves the other unguarded: with a scene it shows fps + duration + resolution (3), and
    with none it shows the `no project` pill + resolution (2). The counts are measured, not
    rounded — each is the positive control for its own branch, so a bar that silently stopped
    rendering goes red here instead of passing a sweep of nothing.
  */
  it.each([
    ['with a scene', SCENE, 3],
    ['with no project', null, 2],
  ] as const)('renders its readouts %s as tags that cannot be pressed', (_label, scene, count) => {
    const host = render([], scene);
    const tags = [...host.querySelectorAll(`[${TAG_MARKER}]`)];

    expect(tags.length, 'the status bar rendered no tags — the sweep proves nothing').toBe(count);

    for (const el of tags) {
      expect(el.tagName, `${el.textContent ?? ''} must not be a button`).toBe('SPAN');
      expect(el.getAttribute('role')).not.toBe('button');
      expect((el as HTMLElement).tabIndex).toBeLessThan(0);
    }
  });

  it('leaves the issues pill a real, reachable button', () => {
    const host = render([ISSUE]);
    const pill = host.querySelector('button[aria-label="Show issues"]');

    expect(pill, 'the issues pill DOES something — it must stay a real button').not.toBeNull();
    expect(pill?.tagName).toBe('BUTTON');
    // A real control is not a tag: it must never pick up the inert contract by accident.
    expect(pill?.hasAttribute(TAG_MARKER)).toBe(false);
    // …and it is still reachable from the keyboard.
    expect((pill as HTMLElement).tabIndex).toBeGreaterThanOrEqual(0);
  });
});
