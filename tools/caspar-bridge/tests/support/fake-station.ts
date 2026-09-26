import type { MockHandle, MockOptions } from '@cg/amcp-mock';
import type { FakePgmFeed, FakePgmFeedOptions } from './fake-pgm-feed.js';
import type { FakePlayout, FakePlayoutOptions } from './fake-playout.js';

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A1 — **A WHOLE FAKE STATION, ON LOOPBACK**: the Playout, a CasparCG
 * behind the Playout's own AMCP allow list serving channels 1 and 2, and each channel's programme
 * feed. `pnpm dev:station --fake` runs exactly this function (it loads the fakes by path and hands
 * them in), and `fake-station.integration.test.ts` drives the same function against a real bridge —
 * so what the owner checks in the browser and what the suite proves are one composition.
 *
 * ── WHY THE FAKES ARE INJECTED, NOT IMPORTED ─────────────────────────────────────────
 *
 * The dev station runs this file under Node's type stripping, which rewrites no `.js` specifier to
 * a `.ts` file. So the only imports here are TYPE imports, which stripping erases; the three fakes
 * arrive as arguments. It also keeps the product out of it: nothing here reaches the bridge, and
 * the bridge learns about this station only the way it learns about a real one — the Playout's
 * address, and the CasparCG host and port first-run writes.
 *
 * ── WHAT EACH PART IS, AND WHY IT IS HERE ────────────────────────────────────────────
 *
 *   - THE PLAYOUT, with `sealOnLoopback: false`. The fake's real-rule default SEALS the automatic
 *     path on a loopback first contact and records it PENDING (`fake-playout.ts`, C8), and the fake
 *     has no approve button — so on a station where everything is loopback, no dev bridge could
 *     ever be let in, and the check's AMCP line ended on the approval sentence. The default stays
 *     what it is for every suite; only the dev station opts out, here.
 *   - CASPARCG: `@cg/amcp-mock` on the port the connection check probes and first-run writes
 *     (5250), sending OSC to the station's own UDP port (6250), with `admit` wired to the Playout's
 *     allow list — so it refuses this machine exactly until the station-admin's sign-in lets it in,
 *     as a 2.8.54 Playout's firewall does.
 *   - THE PROGRAMME FEEDS on `pgmPort(1)` and `pgmPort(2)` (9250, 9251) of the Playout's host, where
 *     the bridge reads them, so SHOW MONITORS shows a picture. A feed whose port is taken is SAID
 *     (one line) and the station runs without it: the monitors say "No return signal" there, which
 *     is true.
 *
 * Every port is passed explicitly — none is left to a fake's default.
 */

/** The three fakes, as the dev station loads them and as the suite imports them. */
export interface FakeStationModules {
  startFakePlayout(options: FakePlayoutOptions): Promise<FakePlayout>;
  createMock(options: MockOptions): Promise<MockHandle>;
  startFakePgmFeed(options: FakePgmFeedOptions): Promise<FakePgmFeed>;
}

export interface FakeStationPorts {
  /** Where CasparCG listens: the port the connection check probes and first-run writes. */
  readonly amcp: number;
  /** Where CasparCG sends OSC: the station's own UDP port, which the bridge listens on. */
  readonly osc: number;
  /** Each channel's programme feed, in channel order — `pgmPort(n)`. */
  readonly pgm: readonly number[];
}

export const FAKE_STATION_HOST = '127.0.0.1';
/** The fake Playout's catalogue names channel 1 and channel 2 on this host. */
export const FAKE_STATION_CHANNELS = 2;
/** The ports a station uses — `AMCP_PORT`, `OSC_PORT` and `pgmPort(1..2)` — every one explicit. */
export const FAKE_STATION_PORTS: FakeStationPorts = { amcp: 5250, osc: 6250, pgm: [9250, 9251] };

export interface FakeStationOptions {
  /** TEST-ONLY — record every AMCP line CasparCG received (`@cg/amcp-mock`'s trace). */
  readonly tracePath?: string;
}

export interface FakeStation {
  readonly playout: FakePlayout;
  readonly caspar: MockHandle;
  /** The feeds that started, in channel order of the ports that were free. */
  readonly feeds: readonly FakePgmFeed[];
  /** One line per part that could not start — a feed whose port is taken. */
  readonly notes: readonly string[];
  /** Stop every part. Safe to call twice. */
  stop(): Promise<void>;
}

function why(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function startFakeStation(
  mods: FakeStationModules,
  ports: FakeStationPorts = FAKE_STATION_PORTS,
  options: FakeStationOptions = {},
): Promise<FakeStation> {
  const host = FAKE_STATION_HOST;
  const playout = await mods.startFakePlayout({
    // The test Playout's real `cg-admin` holds channels 1 AND 2; the fake admin does here too.
    grants: {
      admin: [
        { host, channel: 1 },
        { host, channel: 2 },
      ],
    },
    sealOnLoopback: false,
  });
  let caspar: MockHandle;
  try {
    caspar = await mods.createMock({
      host,
      amcpPort: ports.amcp,
      oscHost: host,
      oscPort: ports.osc,
      channels: FAKE_STATION_CHANNELS,
      admit: (ip) => playout.isTrusted(ip),
      ...(options.tracePath !== undefined ? { tracePath: options.tracePath } : {}),
    });
  } catch (err) {
    await playout.stop();
    throw new Error(
      `CasparCG's stand-in could not listen on ${host}:${String(ports.amcp)} (${why(err)}) — ` +
        'is a CasparCG or another dev station running on this machine?',
    );
  }
  const feeds: FakePgmFeed[] = [];
  const notes: string[] = [];
  for (const [index, port] of ports.pgm.entries()) {
    try {
      feeds.push(await mods.startFakePgmFeed({ host, port }));
    } catch (err) {
      notes.push(
        `Channel ${String(index + 1)}'s programme feed did not start (port ${String(port)}: ` +
          `${why(err)}) — SHOW MONITORS reads "No return signal" there.`,
      );
    }
  }
  let stopped = false;
  return {
    playout,
    caspar,
    feeds,
    notes,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await Promise.all(feeds.map((feed) => feed.stop()));
      await caspar.stop();
      await playout.stop();
    },
  };
}
