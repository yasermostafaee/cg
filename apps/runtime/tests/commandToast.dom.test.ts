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
import { clearRefusal, getRefusal } from '../src/renderer/features/status/refusalStore.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA R — THE TOAST IS THE CONFIRMATION SURFACE, AND ONLY THAT.
 *
 * It used to render both halves of `commandFeedback` from one box: a success in green and a
 * refusal in red, sharing an auto-dismiss. The shared timer was the owner's defect — a
 * confirmation SHOULD go on its own, and a refusal must not. Refusals now live on
 * `RefusalBanner` (persistent, dismissible, coalescing); what these tests hold is the
 * BOUNDARY between the two, from this side of it.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  // The refusal store is module state and outlives a test — see the adapter in
  // `commandFeedback`, which had to stop replaying it for exactly this reason.
  clearRefusal();
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

/** The toast's box. `status`, not `alert`: a confirmation is announced politely. */
function alert(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[role="status"]');
}

describe('CommandToast', () => {
  it('renders nothing until a message is reported', async () => {
    const el = await mount();
    expect(alert(el)).toBeNull();
  });

  it('shows a SUCCESS message as a green "Command success" alert', async () => {
    const el = await mount();
    await act(async () => {
      reportCommandSuccess('Imported · Breaking News');
      await Promise.resolve();
    });
    const node = alert(el);
    expect(node?.getAttribute('aria-label')).toBe('Command success');
    expect(node?.textContent).toBe('Imported · Breaking News');
  });

  /*
    🔴 SUPERSEDED BY `CONSOLE-LOOK-06` DELTA R, and REPLACED rather than deleted so the change
    is visible here. These two used to assert that this toast rendered a refusal in red, and
    that a later refusal replaced an earlier success on it.

    That shared surface WAS the owner's defect: "it hides itself so quickly the operator has no
    chance to read it." A toast's auto-dismiss is right for a confirmation and wrong for a
    refusal, so refusals moved to `RefusalBanner`, which persists until dismissed. What is
    asserted now is the BOUNDARY — because a test that only pinned the banner would be
    satisfied by a build that had quietly put refusals back on a timer here.
  */
  it('🔴 DELTA R — a REFUSAL does not appear on this surface at all', async () => {
    const el = await mount();
    await act(async () => {
      reportCommandError('Bridge disconnected — command rejected. Not sent to CasparCG.');
      await Promise.resolve();
    });
    expect(alert(el), 'a refusal must not ride the transient toast').toBeNull();
    // …and it went somewhere: the persistent surface is holding it.
    expect(getRefusal()?.message).toBe(
      'Bridge disconnected — command rejected. Not sent to CasparCG.',
    );
  });

  it('🔴 DELTA R — a refusal cannot displace a success, because they no longer share a box', async () => {
    const el = await mount();
    await act(async () => {
      reportCommandSuccess('Imported · X');
      reportCommandError('Removal refused.');
      await Promise.resolve();
    });
    const node = alert(el);
    expect(node?.getAttribute('aria-label')).toBe('Command success');
    expect(node?.textContent, 'the confirmation survived the refusal').toBe('Imported · X');
    expect(getRefusal()?.message).toBe('Removal refused.');
  });
});
