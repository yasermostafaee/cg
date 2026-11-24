import { createSocket } from 'node:dgram';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMock, defaultHandlers } from '@cg/amcp-mock';
import type { TemplateInfo, UpcomingMediaMime } from '@cg/shared-ipc';
import {
  CG_UPCOMING_PROGRAMS_PAGE_MARKER,
  readCgControl,
  upcomingProgramMediaAssetId,
  upcomingProgramMediaPath,
  type UpcomingProgramsOverrides,
} from '@cg/shared-schema';
import { expect, it } from 'vitest';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS, TEST_LAYER_POLICY, track } from './support/harness.js';
import { pngBytes } from './support/pictures.js';
import { recvLines } from './support/wire-trace.js';

const TEMPLATE: TemplateInfo = {
  templateId: 'upcoming',
  templateType: 'custom',
  fields: [],
  upcomingPrograms: {
    elements: [
      {
        id: 'programs',
        name: 'Upcoming Programs',
        layout: 'carousel',
        mediaVisible: true,
        preparedItems: [{ id: 'prepared', title: 'Prepared program' }],
      },
    ],
    assets: [],
  },
};

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

async function upload(
  runtime: CasparRuntime,
  name: string,
  bytes: Buffer,
  mime: UpcomingMediaMime,
): Promise<string> {
  const result = await runtime.putUpcomingMedia({ name, mime, base64: bytes.toString('base64') });
  if (!result.ok) throw new Error(`media upload refused: ${result.errorCode}`);
  return result.sha256;
}

it('takes an off-air preparation only after the resident page accepts the list', async () => {
  const directory = track(await mkdtemp(path.join(tmpdir(), 'cg-upcoming-take-')), (dir) =>
    rm(dir, { recursive: true, force: true }),
  );
  const tracePath = path.join(directory, 'amcp.ndjson');
  const oscPort = await freeUdpPort();
  const mock = track(
    await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath }),
    (handle) => handle.stop(),
  );
  const runtime = track(
    new CasparRuntime(
      {
        servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
      },
      {},
      { layerPolicy: TEST_LAYER_POLICY, pagesDir: path.join(directory, 'pages') },
    ),
    (handle) => handle.stop(),
  );
  const wire = async () => {
    await mock.traceFlush();
    return recvLines(tracePath);
  };
  const row = () => runtime.stackSnapshot().find((item) => item.itemId === 'item1');
  runtime.start();
  await runtime.startServing();
  const html = `<!doctype html><html><head>${CG_UPCOMING_PROGRAMS_PAGE_MARKER}</head><body></body></html>`;
  expect(runtime.templateImport(TEMPLATE, html).registered).toBe(true);
  await runtime.whenServerHealthy(HEALTH_MS);
  await awaitChannelModeRead(runtime);
  expect(await runtime.load('item1', TEMPLATE.templateId, {})).toMatchObject({ accepted: true });
  const slot = row()?.slot;
  if (slot === undefined) throw new Error('no resident slot for Upcoming Programs');
  await expect(mock.waitForCgAddResolution(slot)).resolves.toBe('resolved');

  const beforePrepare = await wire();
  const poster = pngBytes(640, 360, 3);
  const video = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
  ]);
  const posterHash = await upload(runtime, 'promo-poster.png', poster, 'image/png');
  const videoHash = await upload(runtime, 'promo.webm', video, 'video/webm');
  const manual: UpcomingProgramsOverrides = {
    programs: [
      {
        id: 'manual',
        title: 'برنامهٔ بعدی',
        airtime: '21:00',
        mediaKind: 'video',
        mediaAssetId: upcomingProgramMediaAssetId(videoHash),
        posterAssetId: upcomingProgramMediaAssetId(posterHash),
      },
    ],
  };
  const missing: UpcomingProgramsOverrides = {
    programs: [
      {
        id: 'missing',
        title: 'Missing promo',
        mediaKind: 'video',
        mediaAssetId: upcomingProgramMediaAssetId('0'.repeat(64)),
      },
    ],
  };
  const inUse = { removed: false, errorCode: 'upcoming-program-media-in-use' };
  const preparing = runtime.prepareUpcomingPrograms('item1', manual);
  expect(await runtime.removeUpcomingMedia({ sha256: videoHash })).toEqual(inUse);
  expect(await preparing).toEqual({ accepted: true });
  expect(await runtime.removeUpcomingMedia({ sha256: posterHash })).toEqual(inUse);
  expect(await runtime.prepareUpcomingPrograms('item1', missing)).toEqual({
    accepted: false,
    errorCode: 'upcoming-program-media-unavailable',
  });
  expect(row()?.upcomingPrograms).toEqual(manual);
  expect(await wire()).toEqual(beforePrepare);

  const target = `CG ${String(slot.channel)}-${String(slot.layer)} `;
  const targetCommandsSince = async (start: number) =>
    (await wire()).slice(start).filter((line) => line.startsWith(target));
  const verbs = (commands: string[]) =>
    commands.map((line) => line.slice(target.length).split(' ')[0]);
  const cg = defaultHandlers().get('CG');
  if (cg === undefined) throw new Error('no default CG mock handler');
  mock.setHandler('CG', (request, context, connection) =>
    request.raw.startsWith(`${target}UPDATE `)
      ? { kind: 'err', code: 500, verb: 'CG' }
      : cg(request, context, connection),
  );
  expect(await runtime.take('item1')).toMatchObject({ accepted: false, refusalOnRow: true });
  expect(verbs(await targetCommandsSince(beforePrepare.length))).toEqual(['UPDATE']);
  expect(row()?.upcomingPrograms).toEqual(manual);

  mock.setHandler('CG', cg);
  const beforeRetry = (await wire()).length;
  expect(await runtime.take('item1')).toMatchObject({ accepted: true });
  const commands = await targetCommandsSince(beforeRetry);
  expect(verbs(commands)).toEqual(['UPDATE', 'PLAY']);
  const tell = commands[0] ?? '';
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(tell);
  const body = quoted?.[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (body === undefined) throw new Error('resident Take did not carry data');
  expect(readCgControl(JSON.parse(body))?.upcomingPrograms).toEqual(manual);
  expect(tell).not.toContain(poster.toString('base64'));
  expect(tell).not.toContain(video.toString('base64'));
  expect(await runtime.prepareUpcomingPrograms('item1', { programs: [] })).toEqual({
    accepted: false,
    errorCode: 'upcoming-programs-on-air',
  });
  expect(await runtime.removeUpcomingMedia({ sha256: videoHash })).toEqual(inUse);
  expect(await runtime.removeUpcomingMedia({ sha256: posterHash })).toEqual(inUse);

  const serve = runtime.templateServe;
  if (serve === null) throw new Error('Upcoming Programs has no template server');
  const origin = `http://${serve.serveHost}:${String(serve.port)}`;
  const servedPoster = await fetch(origin + upcomingProgramMediaPath(posterHash));
  expect(servedPoster.status).toBe(200);
  expect(Buffer.from(await servedPoster.arrayBuffer())).toEqual(poster);
  const servedVideo = await fetch(origin + upcomingProgramMediaPath(videoHash), {
    headers: { Range: 'bytes=4-' },
  });
  expect(servedVideo.status).toBe(206);
  expect(Buffer.from(await servedVideo.arrayBuffer())).toEqual(video.subarray(4));

  expect(await runtime.stopItem('item1')).toMatchObject({ accepted: true });
  expect(row()?.upcomingPrograms).toEqual(manual);
  expect(await runtime.getUpcomingMedia({ sha256: videoHash })).toMatchObject({ kind: 'media' });
  expect(await runtime.out('item1')).toMatchObject({ accepted: true });
  const sharedPoster: UpcomingProgramsOverrides = {
    programs: [
      {
        id: 'photo',
        title: 'Reuse the poster as a photo',
        mediaKind: 'image',
        mediaAssetId: upcomingProgramMediaAssetId(posterHash),
      },
    ],
  };
  expect(await runtime.prepareUpcomingPrograms('item1', sharedPoster)).toEqual({ accepted: true });
  const beforeRemove = await wire();
  expect(await runtime.removeUpcomingMedia({ sha256: videoHash })).toEqual({ removed: true });
  expect(await runtime.removeUpcomingMedia({ sha256: posterHash })).toEqual(inUse);
  expect(row()?.upcomingPrograms).toEqual(sharedPoster);
  expect(await wire()).toEqual(beforeRemove);
  expect((await fetch(origin + upcomingProgramMediaPath(videoHash))).status).toBe(404);
  expect((await fetch(origin + upcomingProgramMediaPath(posterHash))).status).toBe(200);
});
