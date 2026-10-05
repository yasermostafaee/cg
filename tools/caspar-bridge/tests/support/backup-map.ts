import type { BackupChannelMap } from '../../src/server-b-line.js';

/**
 * `RELEASE-0113-01` (`B-316`) — **A FIXED BACKUP CHANNEL MAP, FOR A SUITE WITH NO PLAYOUT.** A runtime with a
 * server B sends it nothing until it is told where each channel's mirror is; in production that comes from the
 * backup engine's D4 (`BackupChannels`). A suite that drives the pair's mechanics on two mocks names the mirror
 * HERE, explicitly — `{ 2: 4 }` is "the station's channel 2 is mirrored at server B's channel 4" — and a suite
 * whose two mocks share numbers by construction says so with `{ 1: 1, 2: 2 }`.
 */
export function mirrorMap(pairs: Readonly<Record<number, number>>): BackupChannelMap {
  const toB = new Map(Object.entries(pairs).map(([n, m]) => [Number(n), m]));
  return {
    channelOnB: (channel) => toB.get(channel) ?? null,
    channelOnBAtTake: (channel) => toB.get(channel) ?? null,
    stationChannelOf: (onB) => {
      for (const [channel, m] of toB) if (m === onB) return channel;
      return null;
    },
    release: () => undefined,
  };
}

/**
 * For a suite whose subject is the pair's MECHANICS — failover, reachability, the sweep, a restart — on two
 * mocks that carry the SAME channel numbers by construction: B's channels 1 and 2 are the station's 1 and 2.
 * SAID here, never defaulted: the runtime sends a server B nothing until it is told. B's own numbering is
 * `backup-channel-map.integration.test.ts`'s subject.
 */
export const SAME_NUMBERS_ON_B = mirrorMap({ 1: 1, 2: 2 });

/** The station line as server B gets it under {@link mirrorMap}: its first channel token rewritten. */
export function onServerB(line: string, pairs: Readonly<Record<number, number>>): string {
  return line.replace(/^(\S+ )(\d+)(?=[- ]|$)/, (whole, verb: string, n: string) => {
    const m = pairs[Number(n)];
    return m === undefined ? whole : `${verb}${String(m)}`;
  });
}
