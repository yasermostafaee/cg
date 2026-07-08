// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsyncButton } from '../src/renderer/ui/AsyncButton.js';
import { Button } from '../src/renderer/ui/Button.js';

/**
 * R-007 regression guard — the slice severed the stack buttons' click path.
 *
 * Root cause: `AsyncButton` created its controller once (guarded by `=== null`)
 * and disposed it in a `useEffect` cleanup. `main.tsx` wraps the app in
 * `<StrictMode>`, which in dev/test double-invokes effects (setup → cleanup →
 * setup); the cleanup disposed the controller and the re-setup did NOT recreate
 * it, so `press()` no-op'd every click. The e2e suite missed it because it runs
 * the PRODUCTION build, where StrictMode does not double-invoke effects.
 *
 * This mounts the primitive exactly as the app does (inside StrictMode) so the
 * dev lifecycle is reproduced: it FAILS against the broken slice and passes once
 * the controller is revived on re-setup.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

describe('AsyncButton dispatches after a StrictMode mount cycle', () => {
  it('calls run() on click (controller survives the StrictMode setup→cleanup→setup)', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const run = vi.fn(() => Promise.resolve({ accepted: true }));
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(StrictMode, null, createElement(AsyncButton, { run, children: 'GO' })),
      );
    });

    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    await act(async () => {
      btn?.click();
    });

    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.unmount();
    });
  });
});

describe('Button forwards onClick', () => {
  it('invokes the onClick handler on click, even under StrictMode', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onClick = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(StrictMode, null, createElement(Button, { onClick, children: 'X' })),
      );
    });
    const btn = container.querySelector('button');
    await act(async () => {
      btn?.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => {
      root.unmount();
    });
  });
});
