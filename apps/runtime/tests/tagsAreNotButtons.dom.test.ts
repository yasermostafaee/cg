// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAG_MARKER } from '@cg/ui';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { installMemoryStorage } from './support/localStorage.js';
import {
  renderStationSetup,
  selectSetupTab,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';
import { clearPortals } from './support/dialog.js';
import { expectTagsAreNotButtons } from './support/tagShape.js';

/**
 * 🔴 `TAG-NOT-BUTTON-07` §6 — **THE GUARD. A SHAPE THAT CANNOT BE PRESSED MUST NOT BE A
 * BUTTON.**
 *
 * ── WHY A GUARD AND NOT A THIRD ROUND OF STYLE EDITS ──────────────────────────────────────
 *
 * The rule was already written down (`R-055`, generalised as golden rule 11) and the code went
 * on doing it anyway — the same shape as the `Tabs.tsx` defect this tree paid for, where the
 * mechanism was documented twelve lines above the code still doing it. Documentation adjacent
 * to a defect does not prevent it. Only a guard does.
 *
 * ── WHAT IT ASSERTS, AND WHERE ────────────────────────────────────────────────────────────
 *
 * The three questions live in `support/tagShape.ts`; this file supplies the SURFACES, as the
 * app renders them — the whole console under the mock bridge, and every tab of the real
 * Station setup dialog. That placement is the point: a spec that mounted only `Tag` would stay
 * green forever while the app quietly stopped using it.
 *
 * ⚠ WHAT THIS FILE CANNOT SEE, on purpose. jsdom has no layout and its cascade is not
 * Chrome's (golden rule 12), so CURSOR and HOVER are not asserted here — they are measured in
 * a real engine by `tests/e2e/tag-not-button.spec.ts`. What IS real in jsdom is the element
 * type, the ARIA role, focusability and the marker, which is exactly what this file asks.
 *
 * 🔴 **AND THE BLIND SPOT THAT IS NOT ABOUT JSDOM — A SURFACE THIS HARNESS NEVER RENDERS
 * IS ONE THIS GUARD CANNOT SPEAK FOR.** Recorded as an explicit boundary rather than left
 * merely true, because a guard whose limits are unwritten reads as total — the same reason
 * `control-bytes`' `EXEMPT_PATHS` is pinned EMPTY rather than assumed so.
 *
 * This file mounts the console under the MOCK bridge. Any component that returns `null` in
 * test mode is therefore absent from the sweep, and its absence looks exactly like passing:
 * the tally simply gets smaller. The known member of that set is **`FailoverBanner`**, which
 * returns `null` on an `offline-mock` link by design (`R-006`: a banner shouting "PRIMARY A
 * unhealthy" about hardware that does not exist is a fresh implication that a real server is
 * broken). Its two server chips sat as hand-styled `<span>`s — no marker AND no tag class, so
 * invisible to both of this guard's questions — until `INSPECTOR-AUDIT-05`'s close-out.
 *
 * ⭐ **THE COMPLEMENT IS A TEST, NOT A NOTE.** `failoverBanner.dom.test.ts` renders that strip
 * on a LIVE link and runs `expectTagsAreNotButtons` over it — the same three questions, from
 * the same module. **If you add a component that suppresses itself in test mode, it owes the
 * same treatment: render it where it is real and sweep it there.** Do not widen this file's
 * mock to make such a surface appear; the suppression is the behaviour under test two files
 * over.
 */

class NoopResizeObserver {
  observe(): void {
    /* geometry is measured in Playwright */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the console surface', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let cg: RuntimeBridge;

  beforeEach(async () => {
    (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
    installMemoryStorage();
    __resetDraftsForTest();
    cg = createMockBridge();
    (globalThis as unknown as { cg: RuntimeBridge }).cg = cg;
    host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    root = r;
    await act(async () => {
      r.render(createElement(App));
      await Promise.resolve();
    });
    await act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
  });

  afterEach(async () => {
    if (root !== null) {
      const r = root;
      await act(async () => {
        r.unmount();
      });
    }
    root = null;
    host?.remove();
    host = null;
    clearPortals();
  });

  it('renders no tag that is a button, focusable, or unmarked', () => {
    /*
      TWO, measured — not a round number picked to be safe. A freshly booted mock console has
      no rows and no server, so the status bar renders exactly its two test-mode pills
      ("TEST MODE (mock)…" and "NO SERVER — SIMULATED"); the other nine appear only once
      there is health to report. The floor is a control on the surface STILL RENDERING, so
      that a selector typo or a bar that failed to mount goes red instead of passing a sweep
      of nothing. It is deliberately not a census of the bar — what the bar contains is other
      specs' subject; this one is about SHAPE.
    */
    const n = expectTagsAreNotButtons(document.body, 'console', 2);
    expect(n).toBeGreaterThan(0);
  });
});

describe('Station setup', () => {
  beforeEach(() => {
    installMemoryStorage();
    stationSetupStub();
  });

  afterEach(async () => {
    await unmountStationSetup();
    clearPortals();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * Every tab, because only ONE section is mounted at a time (`STATION-CHROME-01` §2) — a
   * sweep of the default tab would leave four fifths of the dialog unguarded, and `Optional`,
   * `Apply separately` and the layer summary tags all live on tabs that are not the default.
   */
  it.each([
    ['channel', 1],
    ['servers', 1],
    ['sources', 1],
    ['delimiters', 1],
    ['candidate-layers', 1],
  ] as const)('renders no pressable tag on the %s tab', async (section, atLeast) => {
    const dialog = await renderStationSetup({ section: 'channel' });
    if (section !== 'channel') await selectSetupTab(dialog, section);
    expectTagsAreNotButtons(dialog, `Station setup / ${section}`, atLeast);
  });

  /**
   * The complement, and the reason this guard is a MATCH rather than a ban: the address chips
   * DO fill the field when pressed, so they must stay real buttons. A guard that only forbade
   * would be discharged by flattening every chip into text, which would break these.
   */
  it('leaves a chip that DOES something a real, reachable button', async () => {
    const dialog = await renderStationSetup({ section: 'channel' });
    const chips = [...dialog.querySelectorAll('.cg-setup-chip')];
    for (const chip of chips) {
      expect(chip.tagName, 'an address chip fills the field — it must be a real button').toBe(
        'BUTTON',
      );
      expect(chip.hasAttribute(TAG_MARKER), 'a real control is not a tag').toBe(false);
    }
  });
});
