import { describe, expect, it } from 'vitest';
import {
  casparJoinOf,
  hostIsOursFor,
  resolveCatalogueHost,
  type CatalogueRow,
} from '../src/playout-catalogue.js';

/**
 * 🔴 `B-327` (`SERVERS-SIMPLIFY-01` T6) — **WHETHER THIS STATION'S CASPARCG JOINS THE PLAYOUT'S, IN BOTH PLACEMENTS.**
 *
 * The join is an exact string, and which string is right depends on WHERE CG Bridge sits: a loopback `casparHost` is
 * rewritten to the Playout's host only when CG Bridge's own Playout host is not loopback. So "the Playout's address"
 * is the right server A on a separate server and the wrong one on the Playout's machine. The owner confirmed it on
 * `.32`, where CG Bridge sits on the Playout's machine: A = `192.168.21.32` left the meter empty, A = `127.0.0.1`
 * brought it back. Here `192.0.2.32` (RFC 5737) stands for `.32`; nothing is dialled.
 */

const PLAYOUT_ROW: CatalogueRow = {
  id: 'ch-1',
  name: 'آپاسای',
  casparHost: '127.0.0.1',
  casparChannel: 1,
};

/** The Playout's list as THIS bridge's one reader holds it: rows resolved by its own Playout host. */
function rowsFor(playoutHost: string | undefined): CatalogueRow[] {
  return [resolveCatalogueHost(PLAYOUT_ROW, playoutHost)];
}

function joinFor(
  playoutHost: string | undefined,
  serverA: string,
): ReturnType<typeof casparJoinOf> {
  const hostIsOurs = hostIsOursFor(playoutHost, () => [serverA]);
  return casparJoinOf(rowsFor(playoutHost), (c) => c === 1, serverA, playoutHost, hostIsOurs);
}

describe('B-327 — placement 1: CG Bridge on the Playout’s machine (its Playout is 127.0.0.1)', () => {
  it('🔴 the owner’s `.32`: A = its own network address joins NOTHING — and the derived host is 127.0.0.1', () => {
    expect(joinFor('127.0.0.1', '192.0.2.32')).toEqual({
      casparHost: '192.0.2.32',
      playoutCasparHost: '127.0.0.1',
      joins: false,
    });
  });

  it('A = 127.0.0.1 joins', () => {
    expect(joinFor('127.0.0.1', '127.0.0.1')?.joins).toBe(true);
  });

  it('the owner’s first picture: A = his own PC joins nothing either', () => {
    expect(joinFor('127.0.0.1', '192.0.2.93')).toEqual({
      casparHost: '192.0.2.93',
      playoutCasparHost: '127.0.0.1',
      joins: false,
    });
  });
});

describe('B-327 — placement 2: CG Bridge on a separate server (its Playout is 192.0.2.32)', () => {
  it('🔴 A = 127.0.0.1 joins NOTHING — and the derived host is the Playout’s address', () => {
    expect(joinFor('192.0.2.32', '127.0.0.1')).toEqual({
      casparHost: '127.0.0.1',
      playoutCasparHost: '192.0.2.32',
      joins: false,
    });
  });

  it('A = the Playout’s address joins', () => {
    expect(joinFor('192.0.2.32', '192.0.2.32')?.joins).toBe(true);
  });
});

describe('B-327 — the ONE "is this host ours?", the one the meters read', () => {
  it('reads the configured hosts at CALL time: an applied server A is in force for the next reading', () => {
    let hosts: readonly string[] = ['192.0.2.93'];
    const ours = hostIsOursFor('127.0.0.1', () => hosts);
    // A meter reading names the Playout's own `casparHost`, raw.
    expect(ours('127.0.0.1'), 'the owner’s state: the reading is dropped').toBe(false);
    hosts = ['127.0.0.1'];
    expect(ours('127.0.0.1'), 'after `Use the Playout’s`: kept').toBe(true);
  });

  it('nothing to judge: no list, or no declared channel in it', () => {
    const ours = hostIsOursFor('127.0.0.1', () => ['127.0.0.1']);
    expect(casparJoinOf(null, () => true, '127.0.0.1', '127.0.0.1', ours)).toBeNull();
    expect(
      casparJoinOf(rowsFor('127.0.0.1'), (c) => c === 2, '127.0.0.1', '127.0.0.1', ours),
    ).toBeNull();
  });
});
