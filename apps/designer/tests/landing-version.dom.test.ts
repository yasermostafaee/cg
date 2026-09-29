// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TAG_MARKER } from '@cg/ui';
import { LandingView } from '../src/renderer/features/shell/LandingView.js';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **CG DESIGNER NAMES ITS RELEASE IN ONE LINE**: its start screen,
 * under the line that says what the page is for — where it introduces itself, first on screen at every
 * launch. (Help → About names it too, since `D-161`: `about-version.dom.test.ts`.)
 *
 * The version is read from this app's own `package.json`, the same file the build stamp reads.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MANIFEST_VERSION = (
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
).version;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

async function renderLanding(): Promise<HTMLElement> {
  // The two reads the start screen makes on mount — nothing else of the bridge is touched.
  (window as unknown as { cg: unknown }).cg = {
    projects: { recent: () => Promise.resolve([]), starters: () => Promise.resolve([]) },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  await act(async () => {
    r.render(createElement(LandingView));
    await Promise.resolve();
  });
  return container;
}

describe('CLIENT-TEST-RELEASE-01 B1 — the version line on the Designer’s start screen', () => {
  it('reads "Version <the manifest’s version>", right under the page’s own line', async () => {
    const host = await renderLanding();
    const line = host.querySelector<HTMLElement>('[data-testid="app-version"]');
    expect(line).not.toBeNull();
    expect(line?.textContent).toBe(`Version ${MANIFEST_VERSION}`);
    // Positive control: the start screen rendered, and the line follows its tagline.
    expect(line?.previousElementSibling?.textContent).toMatch(/^Broadcast template builder/);
  });

  it('is a FACT, not a control — a Tag, not focusable — with the exact build in its title', async () => {
    const line = (await renderLanding()).querySelector<HTMLElement>('[data-testid="app-version"]');
    expect(line?.hasAttribute(TAG_MARKER)).toBe(true);
    expect(line?.tagName).toBe('SPAN');
    expect(line?.tabIndex).toBe(-1);
    expect(line?.getAttribute('title') ?? '').toMatch(
      new RegExp(`^${MANIFEST_VERSION.replaceAll('.', '\\.')} · [0-9a-z]+ · \\d{4}-\\d{2}-\\d{2}$`),
    );
  });
});
