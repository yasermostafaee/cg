/** @vitest-environment jsdom */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TAG_MARKER } from '@cg/ui';
import { releaseVersion } from '../../../tools/release/src/release-version.mjs';
import { AboutModal } from '../src/renderer/features/shell/AboutModal.js';
import { TopToolbar } from '../src/renderer/features/shell/TopToolbar.js';
import { designerStore } from '../src/renderer/state/store.js';

/**
 * 🔴 `D-161` (`RELEASE-091-01` §4) — **Help → About names CG Designer, the release and the build.**
 *
 * The release is read through `tools/release` — the one reader of the nine files that carry it, which
 * refuses a build where they disagree — never from this app's `package.json` alone. `turbo.json`
 * hashes those files for this task, so a version bump in any of them re-runs this spec.
 *
 * The check is a FUNCTION so its control can run it too: a dialog planted with a wrong version must
 * fail the very check the real one passes.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RELEASE: string = releaseVersion(REPO);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function mount(element: JSX.Element): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  act(() => r.render(element));
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="dialog"][aria-label="About"]');

function click(el: Element | null | undefined): void {
  expect(el, 'the control to press exists').toBeTruthy();
  act(() => (el as HTMLElement).click());
}

/** THE CHECK: the dialog names this release. */
function namesTheRelease(d: Element): void {
  expect(d.querySelector('[data-testid="about-version"]')?.textContent).toBe(`Version ${RELEASE}`);
}

describe('D-161 — Help → About', () => {
  it('🔴 opens from the Help menu and names CG Designer, Version <the release>, and the build', () => {
    mount(createElement(TopToolbar, { scene: null, projectPath: null }));
    const help = [...(container?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === 'Help',
    );
    click(help);
    const about = [...(container?.querySelectorAll('[role="menuitem"]') ?? [])].find(
      (b) => b.textContent?.trim() === 'About',
    );
    expect((about as HTMLButtonElement | undefined)?.disabled).toBe(false);
    click(about);

    const d = dialog();
    expect(d, 'the About dialog opened').not.toBeNull();
    if (d === null) return;
    expect(d.querySelector('[data-testid="about-name"]')?.textContent).toBe('CG Designer');
    namesTheRelease(d);
    expect(d.querySelector('[data-testid="about-build"]')?.textContent).toMatch(
      /^Build [0-9a-z]+ · \d{4}-\d{2}-\d{2}$/,
    );
    // Facts, not controls: each a Tag, none focusable.
    for (const id of ['about-name', 'about-version', 'about-build']) {
      const fact = d.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      expect(fact?.hasAttribute(TAG_MARKER), id).toBe(true);
      expect(fact?.tabIndex, id).toBe(-1);
    }

    // It closes with its own close…
    click(d.querySelector('button[aria-label="Close"]'));
    expect(dialog()).toBeNull();
    // …and with Escape.
    click(help);
    click(
      [...(container?.querySelectorAll('[role="menuitem"]') ?? [])].find(
        (b) => b.textContent?.trim() === 'About',
      ),
    );
    expect(dialog()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
  });

  it('🔴 CONTROL — a dialog planted with a wrong version fails the same check', () => {
    mount(createElement(AboutModal, { onClose: () => undefined, version: '0.0.1' }));
    const d = dialog();
    expect(d).not.toBeNull();
    if (d === null) return;
    expect(RELEASE).not.toBe('0.0.1');
    expect(() => {
      namesTheRelease(d);
    }).toThrow();
  });
});
