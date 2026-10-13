import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalisePlayoutAddress, splitHostPort } from '../src/index.js';

/**
 * 🔴 `RELEASE-0111-01` Part A — **ONE TABLE FOR TWO IMPLEMENTATIONS.** CG Setup's separate-server page
 * (Rust, `tools/setup-ui/src/address.rs`) refuses what CG Bridge's engine would refuse, and it cannot
 * call this TypeScript — the engine is inside the installer, unpacked only to install. So both read
 * `fixtures/playout-addresses.json`: this side proves the table is what the ENGINE'S rules answer, and
 * the Rust side proves the page answers the same. A row only one of them passes is a page that refuses
 * what the engine accepts, or the reverse. `stricter` names what the page refuses on purpose although
 * the engine accepts it — proved accepted here, so the list can never claim a strictness that is not.
 */

interface Table {
  readonly playout: readonly { typed: string; address: string | null }[];
  readonly host: readonly { typed: string; host: string | null }[];
  readonly stricter: readonly { typed: string; rule: 'playout' | 'host'; why: string }[];
}

const table = JSON.parse(
  fs.readFileSync(new URL('./fixtures/playout-addresses.json', import.meta.url), 'utf8'),
) as Table;

/** A bare host (no port, no scheme), by the engine's own `splitHostPort`. */
const bareHost = (typed: string): string | null => {
  const parts = splitHostPort(typed);
  return parts !== null && parts.port === null ? parts.host : null;
};

describe('the Playout address table is what the engine answers', () => {
  it.each(table.playout)('normalisePlayoutAddress($typed) = $address', ({ typed, address }) => {
    expect(normalisePlayoutAddress(typed)).toBe(address);
  });

  it.each(table.host)('a bare host: $typed = $host', ({ typed, host }) => {
    expect(bareHost(typed)).toBe(host);
  });

  it.each(table.stricter)(
    'the engine ACCEPTS $typed — the page refuses it: $why',
    ({ typed, rule }) => {
      expect(rule === 'playout' ? normalisePlayoutAddress(typed) : bareHost(typed)).not.toBeNull();
    },
  );
});
