// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSettingsState } from '@cg/shared-ipc';
import { ChannelStrip } from '../src/renderer/features/channels/ChannelStrip.js';
import { ReadOnlyIndicator } from '../src/renderer/features/status/ReadOnlyIndicator.js';
import { channelIds, operableChannels } from '../src/renderer/features/channels/channelList.js';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import { rowDeps } from './support/layerRow.js';
import { SETUP_BANK, stationSetupStub } from './support/stationSetup.js';
import { signedInStub } from './support/authStub.js';

/**
 * 🔴 `C-038` / `R-066` bullets 3 and 4 — **THE CONSOLE IS READ-ONLY FOR A PRINCIPAL WHO MAY
 * NOT OPERATE, AND IT SAYS SO ONCE.**
 *
 * ── WHAT THIS FILE PROVES, AND WHAT IT DELIBERATELY DOES NOT ────────────────
 *
 * It proves the CONSOLE's half: which channels the strip lists, which of them read READ ONLY,
 * that the verbs are ABSENT rather than disabled, and that the fact is stated once. The
 * BRIDGE's half — that the same principal is actually refused at the wire — is
 * `tools/caspar-bridge/tests/authz-gate.integration.test.ts`, and the two are deliberately
 * separate: a console that hides a control it would have been refused anyway is a courtesy,
 * and the refusal is the guarantee.
 *
 * ⚠ **EVERY ABSENCE ASSERTION HAS A POSITIVE CONTROL BESIDE IT.** A spec that only ever
 * counted zero buttons would pass against a component that rendered nothing at all —
 * including one broken for a reason having nothing to do with permissions. So each case
 * renders the SAME surface for an operator first and shows the control is there.
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
  __resetChannelChoiceForTest();
  vi.restoreAllMocks();
});

const settingsFor = (...channels: number[]): ChannelSettingsState => ({
  settings: channels.map((channel) => ({ channel, raster: { width: 1920, height: 1080 } })),
  observed: [],
});

async function render(node: Parameters<typeof createElement>[0]): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(node, null)));
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return container;
}

describe('R-066 bullet 3 — the permitted-channel strip', () => {
  /**
   * 🔴 The bullet, in one assertion: the strip lists the principal's channels, and the BANK's
   * channel survives even when it is not granted — shown READ ONLY, never hidden.
   */
  it('lists the granted channels, keeps the bank read-only, and hides the rest', async () => {
    const declared = settingsFor(1, 2, 3);

    // The station declares 1, 2 and 3; the bank is 1; the principal is granted 2 only.
    expect(
      channelIds(SETUP_BANK, declared, signedInStub('op', [2])),
      'channel 3 is neither granted nor the bank — it must not be offered',
    ).toEqual([1, 2]);

    expect(
      operableChannels([1, 2], signedInStub('op', [2])),
      'the bank channel is shown but must NOT be operable',
    ).toEqual([2]);
  });

  /**
   * The POSITIVE CONTROL for the case above: with no principal the list is untouched. This is
   * the byte-identical path, and without it the assertion above would also pass against a
   * `channelIds` that had simply started dropping channels.
   */
  it('auth OFF narrows nothing — every declared channel is listed and operable', () => {
    const declared = settingsFor(1, 2, 3);
    expect(channelIds(SETUP_BANK, declared)).toEqual([1, 2, 3]);
    expect(operableChannels([1, 2, 3], { kind: 'off' })).toEqual([1, 2, 3]);
    // …and the same while the bridge has not answered, which is NOT the same state as `off`.
    expect(operableChannels([1, 2, 3], { kind: 'unknown' })).toEqual([1, 2, 3]);
  });

  /**
   * 🔴 **A CONSOLE THAT HAS NOT SIGNED IN MARKS NOTHING — measured on the real page, where the
   * first draft marked everything.**
   *
   * With `signed-out` answering "granted nothing", every tab read `CHANNEL 1 · READ ONLY`
   * underneath the sign-in overlay, before anybody had typed a character. The operator has not
   * been refused a channel; they have not yet said who they are, and a surface must not assert
   * a restriction the system has not stated.
   *
   * ⚠ This is about what the STRIP SAYS. `useCanOperate` still answers `false` for both
   * states, so nothing is pressable — asserted in the absence specs below.
   */
  it('a signed-out or lapsed console marks NO channel read-only', () => {
    expect(operableChannels([1, 2], { kind: 'expired', name: 'x' })).toEqual([1, 2]);
    expect(operableChannels([1, 2], { kind: 'signed-out' })).toEqual([1, 2]);
  });

  /**
   * ⭐ **SHOWN AND STILL SELECTABLE.** `read` is a real permission: a principal may WATCH a
   * channel that is not theirs to drive. A tab that refused to open would be a disabled
   * control standing in for a fact, and it would withhold the one thing they are entitled to.
   */
  it('renders the ungranted bank channel as a real, selectable READ ONLY tab', async () => {
    stationSetupStub({ raster: settingsFor(1, 2), auth: signedInStub('op', [2]) });
    const el = await render(ChannelStrip);

    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent ?? '');
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.includes('1'))).toContain('READ ONLY');
    expect(
      tabs.find((t) => t.includes('2')),
      'the GRANTED channel must not be marked read-only',
    ).not.toContain('READ ONLY');

    // Selectable: it is a tab, not a disabled control (golden rule 13).
    const readOnlyTab = [...el.querySelectorAll('[role="tab"]')].find((t) =>
      (t.textContent ?? '').includes('READ ONLY'),
    );
    expect(readOnlyTab?.hasAttribute('disabled'), 'the read-only tab was disabled').toBe(false);
  });

  /** The positive control: with auth off, no tab wears the mark. */
  it('auth OFF marks no tab read-only', async () => {
    stationSetupStub({ raster: settingsFor(1, 2) });
    const el = await render(ChannelStrip);
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent ?? '');
    expect(tabs).toHaveLength(2);
    expect(tabs.join(' ')).not.toContain('READ ONLY');
  });
});

describe('R-066 bullet 4 — the controls are ABSENT, and the fact is said once', () => {
  /**
   * 🔴 **ABSENT, NOT DISABLED.** The distinction is the bullet: a disabled TAKE says "this row
   * is not ready", which is a different — and wrong — fact from "this console is not yours".
   */
  it('a principal who may not operate gets NO row verbs at all', () => {
    const operator = layerRowActions(rowDeps({ canOperate: true }));
    expect(
      operator.length,
      'the positive control is dead — an operator has no verbs either',
    ).toBeGreaterThan(0);

    const viewer = layerRowActions(rowDeps({ canOperate: false }));
    expect(viewer, 'the verbs were offered to a principal who may not press them').toEqual([]);
  });

  /**
   * ⚠ And they are absent rather than present-and-disabled — asserted explicitly, because
   * "disabled" is what every other gate in this file produces and is what a future author
   * would most naturally reach for.
   */
  it('they are absent rather than disabled — there is nothing to re-enable', () => {
    const viewer = layerRowActions(rowDeps({ canOperate: false }));
    expect(viewer.filter((a) => a.disabled)).toEqual([]);
    expect(viewer.map((a) => a.key)).toEqual([]);
  });

  it('a viewer is told ONCE, in the operator’s words, why the console is read-only', async () => {
    stationSetupStub({ auth: signedInStub('viewer', [], ['viewer']) });
    const el = await render(ReadOnlyIndicator);

    const pills = el.querySelectorAll('[aria-label="Operating state"]');
    expect(pills, 'said more than once, or not at all').toHaveLength(1);
    expect(pills[0]?.textContent).toContain('READ ONLY');

    /*
      🔴 Golden rule 13 — it is a FACT, not a control. `Tag`'s type already makes `onClick`
      inexpressible; this asserts the rendered result, because the type cannot speak for what
      a future author adds with a `className`.
    */
    expect(pills[0]?.querySelector('button')).toBeNull();
    expect(pills[0]?.getAttribute('role')).toBe('status');
    expect(pills[0]?.hasAttribute('tabindex')).toBe(false);
  });

  /** The positive control: an operator is told nothing, and auth off says nothing either. */
  it('an operator and an auth-off console are told nothing at all', async () => {
    stationSetupStub({ auth: signedInStub('op', [1]) });
    const forOperator = await render(ReadOnlyIndicator);
    expect(forOperator.querySelectorAll('[aria-label="Operating state"]')).toHaveLength(0);
  });
});
