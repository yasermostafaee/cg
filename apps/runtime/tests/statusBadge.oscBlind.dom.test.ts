// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBadge } from '../src/renderer/ui/StatusBadge.js';

/**
 * B-093 — an `unverified` row has TWO possible causes and they need opposite words.
 *
 * B-086/B-087: a link dropped. The graphic's fate is unknown and reconnecting is the fix.
 * B-093: the link is UP, but no OSC has ever arrived, so the bridge REFUSED to decide what
 * is on the layer and sent nothing — the graphic is almost certainly still on air, untouched.
 *
 * Reusing the link-loss wording there would mislead twice, both times toward the unsafe
 * reading: "WAS ON AIR" says the graphic is gone when it is probably live, and "reconnect to
 * re-verify" sends someone to restart a playout box that is working — which would take air
 * down. Same muted status and tone (the vocabulary the operator already knows); different
 * words.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

async function render(props: Record<string, unknown>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StatusBadge, props as never));
  });
  const el = container.querySelector<HTMLElement>('.cg-badge');
  if (el === null) throw new Error('badge not rendered');
  return el;
}

describe('StatusBadge — the blind-tap unverified reads as a question', () => {
  it('oscBlind: labels the open question and names the REAL fix', async () => {
    const el = await render({ status: 'unverified', pending: false, oscBlind: true });

    expect(el.textContent).toContain('ON AIR?');
    expect(el.textContent).not.toContain('WAS ON AIR');

    const title = el.getAttribute('title') ?? '';
    expect(title).toMatch(/no osc/i);
    expect(title).toMatch(/casparcg\.config/i);
    // It must NOT tell the operator to reconnect — that fixes nothing here and points at
    // a healthy playout box.
    expect(title).not.toMatch(/reconnect/i);
    // And it must not claim the graphic is gone.
    expect(title).toMatch(/still on air/i);
  });

  it('link-loss (B-086/B-087) keeps its own wording, unchanged', async () => {
    const caspar = await render({ status: 'unverified', pending: false });
    expect(caspar.textContent).toContain('WAS ON AIR');
    expect(caspar.getAttribute('title')).toMatch(/CasparCG link dropped/i);
    expect(caspar.getAttribute('title')).toMatch(/reconnect/i);

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();

    const bridge = await render({ status: 'unverified', pending: false, bridgeDown: true });
    expect(bridge.textContent).toContain('WAS ON AIR');
    expect(bridge.getAttribute('title')).toMatch(/bridge connection dropped/i);
  });

  it('the muted tone is shared — only the words differ, never the broadcast red', async () => {
    const blind = await render({ status: 'unverified', pending: false, oscBlind: true });
    const cls = blind.className;
    expect(cls).not.toContain('cg-badge--onair');

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();

    const linkLoss = await render({ status: 'unverified', pending: false });
    expect(linkLoss.className).toBe(cls); // identical tone, different wording
  });

  it('non-unverified statuses are untouched by the flag', async () => {
    const el = await render({ status: 'on-air', pending: false, oscBlind: true });
    expect(el.textContent).toContain('ON AIR');
    expect(el.textContent).not.toContain('ON AIR?');
    expect(el.getAttribute('title')).toBeNull();
  });
});
