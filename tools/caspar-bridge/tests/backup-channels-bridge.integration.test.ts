import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, defaultHandlers } from '@cg/amcp-mock';
import {
  inputSourceId,
  mediaSourceId,
  PlayoutSourcePresenceChannel,
  type BackupChannelsState,
} from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { openClient, type Client } from './support/auth-harness.js';
import { startFakePgmFeed } from './support/fake-pgm-feed.js';
import {
  FAKE_PLAYOUT_PASSWORD,
  fakeFingerprint,
  startFakePlayout,
} from './support/fake-playout.js';
import {
  FAKE_BACKUP_PASSWORD,
  pairBackupCatalogue,
  startFakeStation,
  type FakeStation,
} from './support/fake-station.js';
import { FURNITURE, standardBank } from './support/two-channel-rig.js';
import { recvLines } from './support/wire-trace.js';

/**
 * 🔴 `RELEASE-0113-01` (`R-089`) — **THE FAKE PAIR, THROUGH A REAL CG BRIDGE, OVER HTTP.** `pnpm dev:station
 * --fake --pair`'s own composition (`startFakeStation`): two fake engines, each verifying bearers against its
 * own key, each with its own CasparCG stand-in — the backup's with its OWN channel numbers (1 its programme,
 * 2 and 3 the mirrors, 4 and 5 previews) and its D4 naming the mirrors by `mirrorOf` (`2.9.5`). CG Bridge
 * signs in on both engines; the mapping arrives from the backup engine's own D4, and a take on the station's
 * channel 1 reaches the backup core's channel 2.
 */

let handle: BridgeHandle | null = null;
let station: FakeStation | null = null;
const files: string[] = [];

afterEach(async () => {
  await handle?.close();
  await station?.stop();
  handle = null;
  station = null;
  for (const f of files.splice(0)) fs.rmSync(f, { recursive: true, force: true });
});

const MODULES = { startFakePlayout, createMock, startFakePgmFeed };
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>آرم</body></html>';

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const { port } = sock.address();
      sock.close(() => resolve(port));
    });
  });
}

function scratch(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-backup-channels-'));
  files.push(d);
  return d;
}

async function until(cond: () => Promise<boolean>, what: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

let n = 0;
const id = (): string => `q-${String(++n)}`;

interface Pair {
  readonly st: FakeStation;
  readonly bridge: BridgeHandle;
  readonly admin: Client;
  readonly dir: string;
  readonly traceA: string;
  readonly traceB: string;
  /** Close this bridge and start another on the same station and the same state folder. */
  restart(): Promise<BridgeHandle>;
}

async function pairStation(dir = scratch(), configure?: (st: FakeStation) => void): Promise<Pair> {
  const traceA = path.join(dir, 'a.ndjson');
  const traceB = path.join(dir, 'b.ndjson');
  const [oscA, oscB] = [await freeUdpPort(), await freeUdpPort()];
  station = await startFakeStation(
    MODULES,
    { amcp: 0, osc: oscA, pgm: [] },
    { tracePath: traceA, backup: { amcp: 0, password: FAKE_BACKUP_PASSWORD, tracePath: traceB } },
  );
  const st = station;
  configure?.(st);
  const backup = st.backup;
  if (backup === undefined) throw new Error('no backup engine');
  const start = async (): Promise<BridgeHandle> =>
    createBridge({
      port: 0,
      connection: {
        servers: {
          A: { host: '127.0.0.1', amcpPort: st.caspar.amcpPort, oscPort: oscA },
          B: { host: backup.host, amcpPort: backup.caspar.amcpPort, oscPort: oscB },
        },
        strategy: 'mirror-sync',
        autoFailoverEnabled: false,
      },
      playout: { auth: 'playout', address: st.playout.baseUrl },
      fixedLayers: [standardBank(1)],
      bridgeSessionPath: path.join(dir, 'bridge-session.json'),
      persistPath: path.join(dir, 'bridge-connection.json'),
      backupPlayoutAddress: backup.playout.baseUrl,
      backupEngineOptions: { versionOptions: { pollMs: 200 }, licenseOptions: { tickMs: 50 } },
      playoutVersionOptions: { pollMs: 200 },
    });
  handle = await start();
  const bridge = handle;
  bridge.runtime.templateImport(FURNITURE, HTML);
  const admin = await openClient(bridge);
  const { token } = await st.playout.issueToken({ user: 'admin' });
  expect((await admin.authenticate(id(), token)).error).toBeUndefined();
  expect(
    (
      await admin.ask(id(), 'bridgeSession.sign-in', {
        username: 'cg-admin',
        password: FAKE_PLAYOUT_PASSWORD,
      })
    ).payload,
  ).toEqual({ ok: true });
  expect(
    (
      await admin.ask(id(), 'bridgeSession.backup.sign-in', {
        username: 'cg-admin',
        password: FAKE_BACKUP_PASSWORD,
      })
    ).payload,
  ).toEqual({ ok: true });
  return {
    st,
    bridge,
    admin,
    dir,
    traceA,
    traceB,
    restart: async () => {
      await handle?.close();
      handle = await start();
      return handle;
    },
  };
}

const stateOf = async (c: Client): Promise<BackupChannelsState> =>
  (await c.ask(id(), 'backupChannels.state')).payload as BackupChannelsState;

const channelOf = (line: string): number | null => {
  const m =
    /^(?:CG|PLAY|LOAD|LOADBG|STOP|CLEAR|PAUSE|RESUME|CALL|MIXER|INFO) (\d+)(?:-\d+)?(?:\s|$)/.exec(
      line,
    );
  return m === null ? null : Number(m[1]);
};

describe('🔴 R-089 — the fake pair maps itself from the backup engine’s own D4, through a real CG Bridge', () => {
  it('reads physical A/B catalogue presence with scoped logical identity and fingerprints', async () => {
    const stream = { kind: 'stream', url: 'rtsp://user:password@example.test/live' };
    const playlist = (channel: number) => ({
      id: `pl-engine-${String(channel)}`,
      name: 'Playlist',
      playlistOf: { casparHost: '127.0.0.1', casparChannel: channel },
      producer: { kind: 'route', channel, layer: 5 },
      available: true,
    });
    const media = (id: string, fingerprint: string) => ({
      id,
      fingerprint,
      name: 'Two unrelated files may share this display name',
      clip: `D:/Private/${id}.mp4`,
      type: 'video' as const,
      folder: 'Media',
      updatedAt: '2026-11-17T00:00:00Z',
    });
    const p = await pairStation(scratch(), (st) => {
      st.playout.setInputs([
        { id: 'camera', name: 'Camera', producer: stream },
        { id: 'another', name: 'Same name', producer: stream },
        playlist(1),
      ]);
      st.playout.setMedia([
        media('media', fakeFingerprint('media')),
        media('absent', fakeFingerprint('absent')),
      ]);
      st.backup?.playout.setInputs([
        {
          id: 'replica-camera',
          name: 'Video on B',
          producer: stream,
          logicalMappings: [{ channelCode: 'fake-programme-r2', logicalInputId: 'camera' }],
        },
        {
          id: 'replica-unrelated',
          name: 'Same name',
          producer: stream,
          logicalMappings: [{ channelCode: 'fake-programme-r2', logicalInputId: 'unrelated' }],
        },
        { ...playlist(2), available: false },
      ]);
      st.backup?.playout.setMedia([
        media(`replica-${fakeFingerprint('replica')}`, fakeFingerprint('media')),
        media('same-name', fakeFingerprint('not-the-source')),
      ]);
    });
    await until(
      async () => (await stateOf(p.admin)).backup?.channels[0]?.state === 'mapped',
      'B channel mapped',
    );
    await until(
      async () =>
        p.bridge.runtime.sourceCatalog().sources.some((i) => i.id === inputSourceId('camera')),
      'A inputs confirmed',
    );
    expect((await p.admin.ask(id(), 'sources.media-search', { q: '' })).error).toBeUndefined();
    const fromA = inputSourceId('camera');
    const absentInput = inputSourceId('another');
    const playlistId = inputSourceId('pl-engine-1');
    const matchedMedia = mediaSourceId('media');
    const absentMedia = mediaSourceId('absent');
    const ask = {
      channel: 1,
      sourceIds: [fromA, absentInput, playlistId, matchedMedia, absentMedia],
    };
    const answer = await p.admin.ask(id(), PlayoutSourcePresenceChannel.name, ask);
    expect(answer.error).toBeUndefined();
    expect(answer.payload).toEqual({
      engines: ['A', 'B'],
      sources: {
        [fromA]: { A: 'present', B: 'present' },
        [absentInput]: { A: 'present', B: 'missing' },
        [playlistId]: { A: 'present', B: 'missing' },
        [matchedMedia]: { A: 'present', B: 'present' },
        [absentMedia]: { A: 'present', B: 'missing' },
      },
    });
    expect(JSON.stringify(answer.payload)).not.toMatch(/password|D:\/Private|example\.test/);
    const channelTwo = await openClient(p.bridge);
    const { token } = await p.st.playout.issueToken({ user: 'channelTwo' });
    expect((await channelTwo.authenticate(id(), token)).error).toBeUndefined();
    expect(
      (await channelTwo.ask(id(), PlayoutSourcePresenceChannel.name, ask)).error,
    ).toBeDefined();
  }, 25_000);

  it('shows an A-defined NDI present on B only when its own seated receiver is decoding fresh video', async () => {
    const sender = 'STUDIO (Camera 1)';
    const sourceId = inputSourceId('direct-ndi');
    const p = await pairStation(scratch(), (station) => {
      station.playout.setInputs([
        {
          id: 'direct-ndi',
          name: 'Camera',
          producer: { kind: 'ndi', source: sender },
          format: '1080i5000',
          available: true,
        },
      ]);
      station.backup!.playout.setInputs([]);
    });
    const runtime = p.bridge.runtime;
    await until(
      async () =>
        (await stateOf(p.admin)).backup?.channels[0]?.state === 'mapped' &&
        runtime.sourceCatalog().sources.some((input) => input.id === sourceId),
      'NDI catalogue and B channel',
    );
    const ask = (client: Client) =>
      client.ask(id(), PlayoutSourcePresenceChannel.name, { channel: 1, sourceIds: [sourceId] });
    const answer = async (b: string) =>
      expect((await ask(p.admin)).payload).toMatchObject({
        sources: { [sourceId]: { A: 'present', B: b } },
      });
    await answer('missing');
    await runtime.whenServerHealthy(12_000);
    await until(async () => runtime.health().backup?.state === 'healthy', 'both native connections');
    const templateId = 'ndi-test';
    runtime.templateImport(
      {
        ...FURNITURE,
        templateId,
        liveSources: {
          defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
          resolution: { width: 1920, height: 1080 },
          sources: [
            {
              elementId: 'plate',
              sourceId: 'camera',
              dynamic: false,
              rect: { x: 0, y: 0, width: 1920, height: 1080 },
            },
          ],
        },
      },
      HTML,
    );
    expect(
      runtime.setSourceAssignments({
        assignments: [{ channel: 1, templateId, plateId: 'camera', sourceId }],
      }),
    ).toEqual({ ok: true });
    expect(
      await runtime.loadFixed({ channel: 1, layer: 59 }, 'live-ndi', templateId, {}),
    ).toMatchObject({ accepted: true });
    const onAir = await runtime.take('live-ndi');
    expect(onAir, JSON.stringify(onAir)).toMatchObject({ accepted: true });
    const seat = runtime.liveLayers().get('live-ndi')![0]!;
    const b = p.st.backup!.caspar;
    expect(b.layerState({ channel: 2, layer: seat.slot.layer })?.producer).toBe('ndi');
    const normal = defaultHandlers().get('INFO')!;
    let frames = 30;
    let age = 15;
    let observed = sender;
    let reads = 0;
    b.setHandler('INFO', async (req, context, socket) => {
      const reply = await normal(req, context, socket);
      if (req.raw !== 'INFO 2' || reply.kind !== 'ok-line') return reply;
      reads++;
      const block = new RegExp('(<layer_' + seat.slot.layer + '>[\\s\\S]*?<foreground>)');
      return {
        ...reply,
        data: reply.data.replace(
          block,
          '$1<ndi><name>' +
            observed +
            '</name></ndi><media><video-frames>' +
            frames +
            '</video-frames><video-age-ms>' +
            age +
            '</video-age-ms></media>',
        ),
      };
    });
    await answer('present');
    expect(reads).toBeGreaterThan(0);
    frames = 0;
    await answer('missing');
    frames = 90;
    age = 501;
    await answer('missing');
    age = 100;
    observed = 'STUDIO (Unrelated)';
    await answer('missing');
    const denied = await openClient(p.bridge);
    const { token } = await p.st.playout.issueToken({ user: 'channelTwo' });
    expect((await denied.authenticate(id(), token)).error).toBeUndefined();
    const beforeDenied = reads;
    expect((await ask(denied)).error).toBeDefined();
    expect(reads).toBe(beforeDenied);
  }, 35_000);

  it('signed in on both engines: CH 1 maps to B’s 2; its programme ticket stays logical; a take reaches B’s 2 and never B’s 1', async () => {
    const p = await pairStation();
    await until(
      async () => (await stateOf(p.admin)).backup?.channels[0]?.state === 'mapped',
      'the mapping',
    );
    expect((await stateOf(p.admin)).backup).toEqual({
      backupHost: p.st.backup?.host,
      channelListState: 'ready',
      channels: [
        { channel: 1, state: 'mapped', backupChannel: 2, source: 'playout', automaticChannel: 2 },
      ],
    });
    const backupReturn = await p.admin.ask(id(), 'pgmReturn.ticket', {
      channel: 1,
      engine: 'B',
    });
    expect(backupReturn.error).toBeUndefined();
    expect(backupReturn.payload).toEqual({
      path: expect.stringMatching(/^\/pgm\/B\/1\?ticket=[A-Za-z0-9_-]+$/),
    });
    await until(
      async () => p.bridge.runtime.health().backup?.state === 'healthy',
      'server B admitted and healthy',
    );
    expect(await p.bridge.runtime.loadFixed({ channel: 1, layer: 99 }, 'logo', 'logo', {})).toEqual(
      {
        accepted: true,
      },
    );
    expect((await p.bridge.runtime.take('logo')).accepted).toBe(true);
    const backupCaspar = p.st.backup?.caspar;
    await until(async () => {
      await backupCaspar?.traceFlush();
      return recvLines(p.traceB).includes('CG 2-99 PLAY 0');
    }, 'the take on the backup core’s channel 2');
    const onB = recvLines(p.traceB)
      .map(channelOf)
      .filter((c) => c !== null);
    expect(new Set(onB)).toEqual(new Set([2]));
    // `/health` names B's OWN number on server B's row, and A's on A's.
    const health = (await (
      await fetch(`${p.bridge.url.replace('ws:', 'http:')}/health`)
    ).json()) as {
      casparcg: { servers: { label: string; channels: number[] }[] };
      problems: { code: string }[];
    };
    expect(health.casparcg.servers.map((s) => [s.label, s.channels])).toEqual([
      ['A', [1]],
      ['B', [2]],
    ]);
    expect(health.problems.map((x) => x.code)).not.toContain('backup-channels');
  }, 60_000);

  it('🔴 a backup before `2.9.5` (no `mirrorOf`): nothing mapped until a station admin enters CH 1 → CH 2; a mismatched entry is refused in words; entries are audited and kept across a restart', async () => {
    const dir = scratch();
    const p = await pairStation(dir);
    // The backup engine as `2.9.2` publishes it: the same channels, no `mirrorOf` on any row.
    const legacy = pairBackupCatalogue(p.st.playout.baseUrl, p.st.backup?.host ?? '127.0.0.1').map(
      (row) => {
        const copy: Record<string, unknown> = { ...row };
        delete copy['mirrorOf'];
        delete copy['mirrors'];
        return copy as unknown as typeof row;
      },
    );
    p.st.backup?.playout.setChannels(legacy);
    await until(
      async () =>
        (await stateOf(p.admin)).backup?.channels[0]?.reason ===
        'The backup engine publishes no mirrors (Playout before 2.9.5).',
      'the backup to read as a 2.9.2 engine',
    );
    expect((await stateOf(p.admin)).backup?.channels[0]?.state).toBe('not-mapped');

    // A mismatched entry: B's channel 3 runs another video mode.
    p.st.backup?.playout.setChannels(
      legacy.map((row) => (row.casparChannel === 3 ? { ...row, videoMode: '720p5000' } : row)),
    );
    expect(
      (
        await p.admin.ask(id(), 'backupChannels.set-entries', {
          entries: [{ channel: 1, backupChannel: 3 }],
        })
      ).payload,
    ).toEqual({ ok: true });
    await until(
      async () =>
        (await stateOf(p.admin)).backup?.channels[0]?.entryRefusal ===
        'Video mode differs: CH 1 is 1080i5000, backup CH 3 is 720p5000.',
      'the refusal beside the entry',
    );
    expect((await stateOf(p.admin)).backup?.channels[0]?.state).toBe('not-mapped');

    // The right entry is checked against B's D4 and used.
    expect(
      (
        await p.admin.ask(id(), 'backupChannels.set-entries', {
          entries: [{ channel: 1, backupChannel: 2 }],
        })
      ).payload,
    ).toEqual({ ok: true });
    await until(
      async () => (await stateOf(p.admin)).backup?.channels[0]?.state === 'mapped',
      'mapped by entry',
    );
    expect((await stateOf(p.admin)).backup?.channels[0]).toEqual({
      channel: 1,
      state: 'mapped',
      backupChannel: 2,
      source: 'entry',
      entry: 2,
      manualChoices: [
        { channel: 1, name: 'برنامهٔ موتورِ پشتیبان' },
        { channel: 2, name: 'آپاسای (آینه)' },
      ],
    });
    // An entry for a channel this station does not declare is refused.
    expect(
      (
        await p.admin.ask(id(), 'backupChannels.set-entries', {
          entries: [{ channel: 7, backupChannel: 2 }],
        })
      ).payload,
    ).toEqual({ ok: false, message: 'CH 7 is not a channel of this station.' });
    // The record names the admin's entries as asked.
    const rows = (await p.admin.ask(id(), 'audit.recent', { limit: 50 })).payload as AuditEntry[];
    expect(
      rows
        .filter((r) => r.action === 'set-backup-channels')
        .map((r) => [r.outcome, r.backupChannels]),
    ).toEqual(
      expect.arrayContaining([
        ['ok', [{ channel: 1, backupChannel: 2 }]],
        ['failed', [{ channel: 7, backupChannel: 2 }]],
      ]),
    );
    // Kept: the file beside the connection file, stamped with server B.
    const saved = JSON.parse(
      fs.readFileSync(path.join(dir, 'bridge-backup-channels.json'), 'utf8'),
    ) as { server: { host: string }; entries: unknown[] };
    expect(saved.entries).toEqual([{ channel: 1, backupChannel: 2 }]);
    expect(saved.server.host).toBe(p.st.backup?.host);

    // 🔴 A restart: the same state folder, a new process — the entry is in force again, by itself.
    const again = await p.restart();
    const watcher = await openClient(again);
    const { token } = await p.st.playout.issueToken({ user: 'admin' });
    expect((await watcher.authenticate(id(), token)).error).toBeUndefined();
    await until(
      async () => (await stateOf(watcher)).backup?.channels[0]?.state === 'mapped',
      'the entry back in force after the restart',
      20_000,
    );
    expect((await stateOf(watcher)).backup?.channels[0]).toMatchObject({
      backupChannel: 2,
      source: 'entry',
    });
  }, 90_000);
});
