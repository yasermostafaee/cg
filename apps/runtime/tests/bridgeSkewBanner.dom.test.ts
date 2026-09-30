// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { versionMismatchRefusal } from '@cg/shared-ipc';
import { BridgeSkewBanner } from '../src/renderer/features/status/BridgeSkewBanner.js';
import { colors, cssVars } from '../src/renderer/theme.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — deletion guard item 5, the bridge-skew banner (`B-153`).
 *
 * 🔴 THIS SURFACE HAD NO TEST. `bridgeSkew.test.ts` covers the message shaping and the
 * connect-time handshake in `shared/bridgeSkew.ts` and never renders the banner; in Phase 9's
 * plant pass the banner's render was made unreachable and 1318 tests stayed green. This file
 * is what makes that plant red.
 *
 * What is asserted is the PROPERTY, not the artefact:
 *   1. it appears when, and only when, the bridge reports missing commands — `null` (no skew
 *      known, the handshake unanswered) and `[]` both render nothing, because an unanswered
 *      handshake is not evidence of a mismatch;
 *   2. it follows the bridge's pushes, so a skew discovered after mount is not missed;
 *   3. it names the count and the remedy in the operator's words and keeps the channel names
 *      OFF the sentence (`B-152` — an internal id is relocated to `title`, never deleted);
 *   4. 🔴 AMBER, NEVER RED — alarm severity by air-criticality is the owner's decision on
 *      record (`A4`, `design.md` §3 item 5). Asserted by TOKEN IDENTITY, never by hex: the
 *      band fills with the caution role's ground and with none of the three alarm fills.
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

type Listener = (missing: readonly string[] | null) => void;
type VersionListener = (line: string | null) => void;

async function mount(
  initial: readonly string[] | null,
  mismatch: string | null = null,
): Promise<{
  el: HTMLElement;
  push: (next: readonly string[] | null) => Promise<void>;
  pushVersion: (next: string | null) => Promise<void>;
}> {
  const listeners = new Set<Listener>();
  const versionListeners = new Set<VersionListener>();
  const stub = {
    link: {
      skew: () => initial,
      onSkewChanged: (l: Listener) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      // `CENTRAL-BRIDGE-01` — the release-line mismatch the same banner reports.
      versionMismatch: () => mismatch,
      onVersionMismatchChanged: (l: VersionListener) => {
        versionListeners.add(l);
        return () => versionListeners.delete(l);
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(BridgeSkewBanner)));
  });
  return {
    el: container,
    push: async (next) => {
      await act(async () => {
        for (const l of listeners) l(next);
      });
    },
    pushVersion: async (next) => {
      await act(async () => {
        for (const l of versionListeners) l(next);
      });
    },
  };
}

const banner = (el: HTMLElement): HTMLElement | null =>
  el.querySelector('[data-bridge-skew-banner]');

/**
 * A token, in the form the DOM reads it back (`#352d1e` → `rgb(53, 45, 30)`), so an assertion
 * can NAME the token and still compare like with like — the repo's `asRendered` pattern.
 */
function asRendered(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  return probe.style.color;
}

describe('guard item 5 — the bridge-skew banner renders under its condition and stays amber', () => {
  it('renders NOTHING while no skew is known (null) and nothing for an empty skew', async () => {
    const { el, push } = await mount(null);
    expect(banner(el)).toBeNull();
    await push([]);
    expect(banner(el)).toBeNull();
  });

  it('appears when the bridge reports missing commands, and says how many and what to do', async () => {
    const { el } = await mount(['stack.setActiveLook', 'stack.swapLiveSource']);
    const b = banner(el);
    expect(b, 'the banner did not render for a reported skew').not.toBeNull();
    expect(b?.getAttribute('role')).toBe('alert');
    expect(b?.textContent).toContain('BRIDGE IS OUT OF DATE');
    expect(b?.textContent).toContain('2 commands');
    expect(b?.textContent).toContain('Restart the bridge');
    expect(b?.textContent).toContain('nothing has been sent to CasparCG');
  });

  it('follows the bridge: a skew pushed after mount shows, and a cleared one hides', async () => {
    const { el, push } = await mount(null);
    expect(banner(el)).toBeNull();
    await push(['stack.setActiveLook']);
    expect(banner(el)?.textContent).toContain('1 command ');
    await push([]);
    expect(banner(el)).toBeNull();
  });

  it('B-152 — the channel names are relocated to a title, never in the sentence', async () => {
    const { el } = await mount(['stack.setActiveLook']);
    const b = banner(el);
    expect(b?.textContent).not.toContain('stack.setActiveLook');
    expect(b?.querySelector('[title*="stack.setActiveLook"]')).not.toBeNull();
  });

  it('🔴 AMBER, NEVER RED — the band takes the caution ground and none of the alarm fills', async () => {
    const { el } = await mount(['stack.setActiveLook']);
    const b = banner(el);
    expect(b).not.toBeNull();
    const fill = (b as HTMLElement).style.backgroundColor;
    // A red-first assertion against an absent token is `expect(undefined).toBe(undefined)`:
    // pin non-emptiness first, then identity (PROMPT.md §11).
    expect(fill).not.toBe('');
    expect(cssVars['--r-caution-bg']).toBeTruthy();
    expect(fill).toBe(asRendered(cssVars['--r-caution-bg']));
    for (const alarm of [colors.alarmFill, cssVars['--r-danger-bg'], cssVars['--r-danger']]) {
      expect(alarm).toBeTruthy();
      expect(fill).not.toBe(asRendered(alarm));
    }
    expect((b as HTMLElement).dataset['tone']).toBe('caution');
  });
});

describe('CENTRAL-BRIDGE-01 — another release than CG Bridge is one line, and it outranks a skew', () => {
  const LINE = versionMismatchRefusal('0.10.0', '0.9.1');
  const mismatchBanner = (el: HTMLElement): HTMLElement | null =>
    el.querySelector('[data-version-mismatch-banner]');

  it('shows the one line — both versions, nothing sent, the remedy — and no skew list beside it', async () => {
    const { el } = await mount(['stack.setActiveLook'], LINE);
    const b = mismatchBanner(el);
    expect(b, 'the mismatch line did not render').not.toBeNull();
    expect(b?.getAttribute('role')).toBe('alert');
    expect(b?.textContent).toContain('0.10.0');
    expect(b?.textContent).toContain('0.9.1');
    expect(b?.textContent).toContain('nothing is sent');
    // It outranks the skew: this console sends nothing, so a list of what it cannot send is moot.
    expect(banner(el)).toBeNull();
  });

  it('follows the connect-time answer: a mismatch learned after mount shows; control: cleared, the skew is back', async () => {
    const { el, pushVersion } = await mount(['stack.setActiveLook']);
    expect(mismatchBanner(el)).toBeNull();
    expect(banner(el)).not.toBeNull();
    await pushVersion(LINE);
    expect(mismatchBanner(el)).not.toBeNull();
    await pushVersion(null);
    expect(mismatchBanner(el)).toBeNull();
    expect(banner(el)).not.toBeNull();
  });
});
