// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { clearPortals } from './support/dialog.js';
import { renderStationSetup, stationSetupStub } from './support/stationSetup.js';
import { signedInStub } from './support/authStub.js';

/**
 * 🔴 `OPERATOR-NAME-SWEEP-01` § 3(b) — **A SETTING A PRINCIPAL CANNOT COMMIT IS SHOWN AS A
 * VALUE, NOT AS AN INPUT.**
 *
 * ── WHAT `PLAYOUT-AUTHZ-01` LEFT, AND WHY IT WAS NOT ENOUGH ─────────────────
 *
 * That change made the COMMIT controls absent below `station-admin`: every section portals its
 * APPLY through one slot, so withholding the slot removed all of them. The hazard was closed —
 * nothing reached the bridge and came back refused — but the fields themselves still accepted
 * typing, so an operator could build a draft that had nowhere to go. A form that invites an
 * edit it will silently discard is a surface lying about what it is for.
 *
 * ── AND WHY THE FIX IS NOT `disabled` ───────────────────────────────────────
 *
 * 🔴 Golden rule 13. A greyed-out input reads as "not just now" — a transient condition the
 * operator might wait out. The truth is that this setting is not theirs to change at all, and
 * a fact is written as a fact. It is also the treatment `ChannelSection` already uses for the
 * video format (designer-owned, ADR 0009): one appearance, one meaning.
 */

afterEach(async () => {
  await act(async () => undefined);
  clearPortals();
  vi.restoreAllMocks();
});

const HOST = '10.0.0.7';

function config() {
  return {
    servers: { A: { host: HOST, amcpPort: 5250, oscPort: 6250 } },
    strategy: 'mirror-sync' as const,
    autoFailoverEnabled: false,
  };
}

describe('§3(b) — Station setup below station-admin', () => {
  /**
   * 🔴 The property: the values are READABLE and there is nothing to type into.
   *
   * ⭐ **ITS POSITIVE CONTROL IS THE SPEC BELOW**, which renders the SAME dialog for a
   * `station-admin` and finds the inputs present. Without it, "no inputs" would also be what a
   * dialog that failed to render looks like — and `PLAYOUT-AUTHZ-01`'s first e2e shipped
   * exactly that shape before a control caught it. An empty list is a measurement only when
   * something beside it proves the instrument was live.
   */
  it('an OPERATOR sees the settings as values, with no input to type into', async () => {
    stationSetupStub({ config: config(), auth: signedInStub('op', [1]) });
    const setup = await renderStationSetup({ section: 'servers' });

    // The value is THERE, and readable.
    const values = [...setup.querySelectorAll('[data-setup-readonly]')].map((n) => n.textContent);
    expect(values, 'no read-only values rendered at all').not.toEqual([]);
    expect(values.join(' '), 'the host is not shown').toContain(HOST);
    expect(values.join(' '), 'the AMCP port is not shown').toContain('5250');

    // …and there is nothing to type into.
    expect(
      setup.querySelector('[aria-label="Primary host"]'),
      'an operator was offered a host INPUT they can never save',
    ).toBeNull();

    /*
      🔴 ABSENT, not disabled — asserted explicitly, because `disabled` is the treatment a
      future author would most naturally reach for and it states the wrong fact.
    */
    expect(setup.querySelectorAll('input[disabled]')).toHaveLength(0);
  });

  /** ⭐ THE POSITIVE CONTROL — the same dialog, a principal who CAN commit. */
  it('a STATION-ADMIN gets the real inputs, and no read-only values', async () => {
    stationSetupStub({
      config: config(),
      auth: signedInStub('admin', [1], ['station-admin', 'operator', 'viewer']),
    });
    const setup = await renderStationSetup({ section: 'servers' });

    expect(
      setup.querySelector('[aria-label="Primary host"]'),
      'the admin lost the host input — every absence above is void',
    ).not.toBeNull();
    expect(setup.querySelectorAll('[data-setup-readonly]')).toHaveLength(0);
  });

  /**
   * ⭐ AND THE BYTE-IDENTICAL CONTROL: with auth OFF nothing about this dialog moves, because
   * a station that does not federate identity has no principal to scope to.
   */
  it('auth OFF is unchanged — real inputs, no read-only values', async () => {
    stationSetupStub({ config: config() });
    const setup = await renderStationSetup({ section: 'servers' });

    expect(setup.querySelector('[aria-label="Primary host"]')).not.toBeNull();
    expect(setup.querySelectorAll('[data-setup-readonly]')).toHaveLength(0);
  });
});
