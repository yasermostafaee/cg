import type { MockHandle, MockOptions } from '@cg/amcp-mock';
import type { FakePgmFeed, FakePgmFeedOptions } from './fake-pgm-feed.js';
import type { FakeCatalogueRow, FakePlayout, FakePlayoutOptions } from './fake-playout.js';

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
 *     (5250), with `admit` wired to the Playout's allow list — so it refuses this machine exactly
 *     until the station-admin's sign-in lets it in, as a 2.8.54 Playout's firewall does. 🔴
 *     `CENTRAL-BRIDGE-01` rule 7: it sends OSC to NO fixed port. The station's bridge binds its own
 *     (6251) and asks for OSC with `OSC SUBSCRIBE` on its AMCP connection, exactly as it does on the
 *     Playout's machine, where UDP 6250 is the engine's — so the dev station exercises that one road.
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
  /**
   * The station's own UDP OSC port, which its bridge binds and names in `OSC SUBSCRIBE`. The fake
   * CasparCG is not told it: it learns it from the subscribe, as the real core does.
   */
  readonly osc: number;
  /** Each channel's programme feed, in channel order — `pgmPort(n)`. */
  readonly pgm: readonly number[];
}

export const FAKE_STATION_HOST = '127.0.0.1';
/** The fake Playout's catalogue names channel 1 and channel 2 on this host. */
export const FAKE_STATION_CHANNELS = 2;
/** The ports a station uses — `AMCP_PORT`, `OSC_PORT` and `pgmPort(1..2)` — every one explicit. */
export const FAKE_STATION_PORTS: FakeStationPorts = { amcp: 5250, osc: 6251, pgm: [9250, 9251] };

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **`--pair`: THE BACKUP ENGINE.** A second fake Playout — its own
 * ES256 key (every fake mints its own), its own `cg-admin` password — and its own CasparCG stand-in on
 * its own AMCP port, admitting this machine by THAT engine's allow list. The bridge declares it as
 * server B. Both engines then verify every bearer against their own keys, so a token sent to the wrong
 * engine is refused there as a real Playout refuses it — tokens never cross.
 */
export interface FakeStationBackup {
  /** Server B's AMCP port — beside the primary's 5250, on the same loopback host. */
  readonly amcp: number;
  /** The backup engine's own `cg-admin` password: never the primary's. */
  readonly password: string;
  /** TEST-ONLY — record every AMCP line the BACKUP core received (`@cg/amcp-mock`'s trace). */
  readonly tracePath?: string;
}

/** `--pair`'s backup engine: server B's port, and a password that is not the primary's. */
export const FAKE_BACKUP_AMCP_PORT = 5251;
export const FAKE_BACKUP_PASSWORD = 'test-only-backup-engine-not-a-secret';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`) — **THE BACKUP CORE HAS ITS OWN CHANNEL NUMBERS**, the way the Playout team
 * builds a test pair (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §2, §6): a fresh engine makes its own channel 1
 * at first run, and each mirror is a NEW channel numbered largest + 1. So on the backup's core:
 *
 *   - channel 1 — the backup engine's OWN programme (its default channel), airing something else;
 *   - channel 2 — the mirror of the primary's channel 1;
 *   - channel 3 — the mirror of the primary's channel 2;
 *   - channels 4 and 5 — the core's preview channels, which no D4 lists.
 *
 * Until `0.11.3` the fake backup served the primary's channels 1 and 2, so every line sent with the primary's
 * number landed on the right channel by coincidence and no test could see `B-316`.
 */
export const FAKE_BACKUP_CHANNELS = 5;
export const FAKE_VIDEO_MODE = '1080i5000';

/** The primary engine's D4 for a pair: its two channels, their video mode, and their mirrors (a hint). */
export function pairPrimaryCatalogue(backupAddress: string): FakeCatalogueRow[] {
  const backupApi = new URL(backupAddress).host;
  return [
    {
      id: 'fake-programme',
      name: 'آپاسای',
      casparHost: FAKE_STATION_HOST,
      casparChannel: 1,
      output: 'on-air',
      playlist: 'playing',
      videoMode: FAKE_VIDEO_MODE,
      mirrorOf: null,
      mirrors: [{ playout: backupApi, id: 'fake-programme-r2', casparChannel: 2 }],
    },
    {
      id: 'fake-cg',
      name: 'کانال دوم (تست CG)',
      casparHost: FAKE_STATION_HOST,
      casparChannel: 2,
      output: 'off',
      playlist: 'stopped',
      videoMode: FAKE_VIDEO_MODE,
      mirrorOf: null,
      mirrors: [{ playout: backupApi, id: 'fake-cg-r2', casparChannel: 3 }],
    },
  ];
}

/** The backup engine's own D4 for a pair (`2.9.5`): its own channel 1, and the two mirrors at 2 and 3. */
export function pairBackupCatalogue(primaryAddress: string): FakeCatalogueRow[] {
  const primaryApi = new URL(primaryAddress).host;
  return [
    {
      id: 'backup-own',
      name: 'برنامهٔ موتورِ پشتیبان',
      casparHost: FAKE_STATION_HOST,
      casparChannel: 1,
      output: 'on-air',
      playlist: 'playing',
      videoMode: FAKE_VIDEO_MODE,
      mirrorOf: null,
      mirrors: [],
    },
    {
      id: 'fake-programme-r2',
      name: 'آپاسای (آینه)',
      casparHost: FAKE_STATION_HOST,
      casparChannel: 2,
      output: 'off',
      playlist: 'stopped',
      videoMode: FAKE_VIDEO_MODE,
      mirrorOf: { playout: primaryApi, id: 'fake-programme' },
      mirrors: [],
    },
    {
      id: 'fake-cg-r2',
      name: 'کانال دوم (آینه)',
      casparHost: FAKE_STATION_HOST,
      casparChannel: 3,
      output: 'off',
      playlist: 'stopped',
      videoMode: FAKE_VIDEO_MODE,
      mirrorOf: { playout: primaryApi, id: 'fake-cg' },
      mirrors: [],
    },
  ];
}

export interface FakeStationOptions {
  /** TEST-ONLY — record every AMCP line CasparCG received (`@cg/amcp-mock`'s trace). */
  readonly tracePath?: string;
  /** `--pair` — start the backup engine too (see `FakeStationBackup`). */
  readonly backup?: FakeStationBackup;
}

export interface FakeStation {
  readonly playout: FakePlayout;
  readonly caspar: MockHandle;
  /** The feeds that started, in channel order of the ports that were free. */
  readonly feeds: readonly FakePgmFeed[];
  /** One line per part that could not start — a feed whose port is taken. */
  readonly notes: readonly string[];
  /** `--pair` — the backup engine and its CasparCG; absent on a one-engine station. */
  readonly backup?: { readonly playout: FakePlayout; readonly caspar: MockHandle };
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
  // The test Playout's real `cg-admin` holds channels 1 AND 2; the fake admin does here too.
  const grants = {
    admin: [
      { host, channel: 1 },
      { host, channel: 2 },
    ],
  };
  // `--pair` — both engines verify bearers, so a token that crossed would be refused, not served.
  const pair = options.backup;
  const playout = await mods.startFakePlayout({
    grants,
    sealOnLoopback: false,
    ...(pair !== undefined ? { verifyBearers: true } : {}),
  });
  let caspar: MockHandle;
  try {
    caspar = await mods.createMock({
      host,
      amcpPort: ports.amcp,
      // No predefined OSC destination: the bridge's `OSC SUBSCRIBE` is the only way in (rule 7).
      oscPort: 0,
      channels: FAKE_STATION_CHANNELS,
      admit: (ip) => playout.isTrusted(ip),
      // `MEDIA-PLATES-01` — a clip the library holds runs for its real length and reports it over OSC.
      clipLength: (file) => playout.clipLengthS(file),
      ...(options.tracePath !== undefined ? { tracePath: options.tracePath } : {}),
    });
  } catch (err) {
    await playout.stop();
    throw new Error(
      `CasparCG's stand-in could not listen on ${host}:${String(ports.amcp)} (${why(err)}) — ` +
        'is a CasparCG or another dev station running on this machine?',
    );
  }
  let backup: { playout: FakePlayout; caspar: MockHandle } | undefined;
  if (pair !== undefined) {
    const b = await mods
      .startFakePlayout({
        grants,
        sealOnLoopback: false,
        verifyBearers: true,
        password: pair.password,
      })
      .catch(async (err: unknown) => {
        await caspar.stop();
        await playout.stop();
        throw err;
      });
    // `RELEASE-0113-01` — each engine's D4 says what a real pair's does: the mirrors, by `mirrorOf`.
    playout.setChannels(pairPrimaryCatalogue(b.baseUrl));
    b.setChannels(pairBackupCatalogue(playout.baseUrl));
    try {
      backup = {
        playout: b,
        caspar: await mods.createMock({
          host,
          amcpPort: pair.amcp,
          oscPort: 0,
          // `RELEASE-0113-01` — the backup core's OWN numbers: 1 its programme, 2–3 mirrors, 4–5 previews.
          channels: FAKE_BACKUP_CHANNELS,
          // Server B admits this machine by the BACKUP engine's own allow list, never the primary's.
          admit: (ip) => b.isTrusted(ip),
          clipLength: (file) => b.clipLengthS(file),
          ...(pair.tracePath !== undefined ? { tracePath: pair.tracePath } : {}),
        }),
      };
    } catch (err) {
      await b.stop();
      await caspar.stop();
      await playout.stop();
      throw new Error(
        `The backup engine's CasparCG stand-in could not listen on ${host}:${String(pair.amcp)} ` +
          `(${why(err)}) — is a CasparCG or another dev station running on this machine?`,
      );
    }
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
    ...(backup !== undefined ? { backup } : {}),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await Promise.all(feeds.map((feed) => feed.stop()));
      await caspar.stop();
      await playout.stop();
      await backup?.caspar.stop();
      await backup?.playout.stop();
    },
  };
}
