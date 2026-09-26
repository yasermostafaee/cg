// @vitest-environment jsdom
import { StrictMode, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { MonitorPanel } from '../src/renderer/features/monitors/MonitorPanel.js';
import type { ProgramReturn } from '../src/renderer/hooks/useProgramReturn.js';

/**
 * 🔴 `FIELD-FIXES-01` H — **THE PROGRAM PICTURE ASKS FOR ITS STREAM IN A DEVELOPMENT BUILD TOO.**
 *
 * On `pnpm dev:station` the pane read "No return signal" beside a working feed, and the relay
 * logged no viewer: the `<img>` had NO `src`. Its cleanup removed `src` (the abort on unmount),
 * and React's StrictMode — every development build, which is what Vite's dev server serves —
 * mounts, unmounts and mounts again without re-applying an unchanged prop. The installed app and
 * every e2e on the built `dist` run production React, which never does that, so nothing that
 * loaded `dist` could see it. Measured in a real browser through Vite by `dev-station-pgm.spec.ts`;
 * pinned here at the component, where the attribute is a DOM fact jsdom answers exactly.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = '/pgm/2?v=0';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  const r = root;
  root = null;
  if (r !== null) {
    await act(async () => {
      r.unmount();
    });
  }
  host?.remove();
  host = null;
});

function pane(programReturn: ProgramReturn): ReactElement {
  return createElement(MonitorPanel, {
    id: 'pgm',
    title: 'PROGRAM (PGM)',
    word: 'PROGRAM',
    channel: 2,
    onAirRows: 0,
    programReturn,
  });
}

async function mount(element: ReactElement): Promise<HTMLImageElement | null> {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(element);
  });
  return host.querySelector<HTMLImageElement>('[data-pgm-picture]');
}

const connecting: ProgramReturn = { src: SRC, signal: 'none', onError: () => undefined };

describe('FIELD-FIXES-01 H — the PROGRAM picture requests its stream', () => {
  it('🔴 under StrictMode — a development build, the dev station’s — the picture still carries its URL', async () => {
    const img = await mount(createElement(StrictMode, null, pane(connecting)));
    expect(img, 'the picture is mounted while there is a URL').not.toBeNull();
    expect(img?.getAttribute('src')).toBe(SRC);
  });

  it('CONTROL — a production-shaped mount (no StrictMode) carries it too', async () => {
    const img = await mount(pane(connecting));
    expect(img?.getAttribute('src')).toBe(SRC);
  });

  it('unmounting still ABORTS the request: the picture it leaves behind has no URL', async () => {
    const img = await mount(createElement(StrictMode, null, pane(connecting)));
    expect(img?.getAttribute('src')).toBe(SRC);
    const r = root;
    root = null;
    await act(async () => {
      r?.unmount();
    });
    expect(img?.hasAttribute('src')).toBe(false);
  });

  it('CONTROL — with no URL there is no picture to request with', async () => {
    const img = await mount(
      createElement(
        StrictMode,
        null,
        pane({ src: null, signal: 'none', onError: () => undefined }),
      ),
    );
    expect(img).toBeNull();
  });
});
