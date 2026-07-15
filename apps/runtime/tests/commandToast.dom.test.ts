// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { CommandToast } from '../src/renderer/features/status/CommandToast.js';
import {
  reportCommandError,
  reportCommandSuccess,
} from '../src/renderer/features/status/commandFeedback.js';

/**
 * The command toast renders BOTH an error (red) and a success (green) from the same
 * `commandFeedback` mechanism — the surface every inline message now routes to.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

async function mount(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(CommandToast)));
    await Promise.resolve();
  });
  return container;
}

function alert(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[role="alert"]');
}

describe('CommandToast', () => {
  it('renders nothing until a message is reported', async () => {
    const el = await mount();
    expect(alert(el)).toBeNull();
  });

  it('shows a SUCCESS message as a green "Command success" alert', async () => {
    const el = await mount();
    await act(async () => {
      reportCommandSuccess('Imported “Breaking News”.');
      await Promise.resolve();
    });
    const node = alert(el);
    expect(node?.getAttribute('aria-label')).toBe('Command success');
    expect(node?.textContent).toBe('Imported “Breaking News”.');
  });

  it('shows an ERROR message as a red "Command error" alert', async () => {
    const el = await mount();
    await act(async () => {
      reportCommandError('Bridge disconnected — command rejected. Not sent to CasparCG.');
      await Promise.resolve();
    });
    const node = alert(el);
    expect(node?.getAttribute('aria-label')).toBe('Command error');
    expect(node?.textContent).toBe('Bridge disconnected — command rejected. Not sent to CasparCG.');
  });

  it('last-write wins: a later error replaces an earlier success', async () => {
    const el = await mount();
    await act(async () => {
      reportCommandSuccess('Imported “X”.');
      reportCommandError('Removal refused.');
      await Promise.resolve();
    });
    const node = alert(el);
    expect(node?.getAttribute('aria-label')).toBe('Command error');
    expect(node?.textContent).toBe('Removal refused.');
  });
});
