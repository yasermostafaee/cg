import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_SOURCE_AUDIO_CHANNELS, SourceAudioLevelsChannel, inputSourceId } from '@cg/shared-ipc';
import { describe, expect, it } from 'vitest';
import type { SourcePreviewSelector } from '../src/playout-source-previews.js';
import { openClient } from './support/auth-harness.js';
import { FAKE_INPUTS, startFakePlayout } from './support/fake-playout.js';
import { track } from './support/harness.js';
import { twoChannelRig, waitUntil } from './support/two-channel-rig.js';

const LIVE = inputSourceId('li-multicast');
const PLAYLIST = inputSourceId('pl-apasai');
const FOREIGN_PLAYLIST = inputSourceId('pl-cg-test2');
const LIVE_SELECTOR = { kind: 'live', inputId: 'li-multicast' } as const;
const PLAYLIST_SELECTOR = {
  kind: 'playlist',
  playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
} as const;
const SURROUND = Array.from({ length: MAX_SOURCE_AUDIO_CHANNELS }, (_, index) => -10 - index);

describe('passive source audio via the Playout catalogue', () => {
  it('reads authorized live and playlist receivers without opening a Check Input lease', async () => {
    const requests: {
      path: string | undefined;
      method: string | undefined;
      sources: SourcePreviewSelector[];
    }[] = [];
    let sampleAgeMs = 20;
    let programmeCode = 'fake-programme';
    let metadataOnly = false;
    const fixture: { holdResponse?: Promise<void> } = {};
    const sourceAudio = async (
      request: IncomingMessage,
      response: ServerResponse,
    ): Promise<void> => {
      const chunks: Buffer[] = [];
      for await (const chunk of request as AsyncIterable<Buffer>) chunks.push(chunk);
      const { sources } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        sources: SourcePreviewSelector[];
      };
      requests.push({ path: request.url, method: request.method, sources });
      await fixture.holdResponse;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          engineId: 'fake-engine',
          channelCode: programmeCode,
          items: sources.map((source) => ({
            source,
            status: 200,
            reading: {
              ...(metadataOnly
                ? { audio: { status: 'unknown' }, signal: 'unknown' }
                : {
                    audio: { status: 'has-audio', channels: source.kind === 'playlist' ? 32 : 2 },
                    signal: 'present',
                    peakDbfs: source.kind === 'playlist' ? SURROUND : [-22, -24],
                    sampledAt: new Date().toISOString(),
                    sampleAgeMs,
                  }),
              validForMs: 500,
              stage: 'decoded-source-before-filters-and-mixer',
            },
          })),
        }),
      );
    };
    const playout = track(await startFakePlayout({ sourceAudio }), (fake) => fake.stop());
    const moreInputs = Array.from({ length: 9 }, (_, index) => ({
      id: `li-batch-${index}`,
      name: `Input ${index}`,
      casparHost: '127.0.0.1',
      producer: { kind: 'stream' as const, url: `udp://239.255.0.1:${5100 + index}?reuse=1` },
    }));
    playout.setInputs([...FAKE_INPUTS, ...moreInputs]);
    const rig = await twoChannelRig({
      bridge: { playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer } },
    });
    const console = await openClient(rig.handle);
    const read = (channel: number, sourceIds: string[], maxChannels?: number) =>
      console.ask(randomUUID(), SourceAudioLevelsChannel.name, { channel, sourceIds, maxChannels });
    expect((await read(1, [LIVE])).error).toEqual(expect.any(String));
    const { token } = await playout.issueToken({ user: 'operator' });
    expect((await console.authenticate(randomUUID(), token)).error).toBeUndefined();
    await waitUntil(
      () =>
        rig.handle.runtime.sourceCatalog().sources.some((entry) => entry.id === FOREIGN_PLAYLIST) &&
        rig.handle.runtime
          .sourceCatalog()
          .sources.some((entry) => entry.id === inputSourceId('li-batch-8')) &&
        playout.channelsBearers.length > 0,
      'D4 channel and both D10 Playlist identities',
    );
    expect((await read(2, [LIVE])).error).toEqual(expect.any(String));
    expect(requests).toEqual([]);

    const modern = await read(
      1,
      [LIVE, PLAYLIST, FOREIGN_PLAYLIST, LIVE],
      MAX_SOURCE_AUDIO_CHANNELS,
    );
    expect(modern).toEqual({
      payload: {
        readings: [
          { sourceId: LIVE, state: 'measured', dbFs: [-22, -24], validForMs: 300 },
          { sourceId: PLAYLIST, state: 'measured', dbFs: SURROUND, validForMs: 300 },
        ],
      },
    });
    expect(requests).toEqual([
      {
        path: '/api/v1/channels/fake-programme/source-audio/meters',
        method: 'POST',
        sources: [LIVE_SELECTOR, PLAYLIST_SELECTOR],
      },
    ]);
    expect((await read(1, [PLAYLIST])).payload).toEqual({
      readings: [
        { sourceId: PLAYLIST, state: 'measured', dbFs: SURROUND.slice(0, 16), validForMs: 300 },
      ],
    });

    sampleAgeMs = 650;
    expect((await read(1, [LIVE])).payload).toEqual({
      readings: [{ sourceId: LIVE, state: 'has-audio' }],
    });
    programmeCode = 'other-channel';
    expect((await read(1, [LIVE])).payload).toEqual({ readings: [] });

    programmeCode = 'fake-programme';
    sampleAgeMs = 20;
    metadataOnly = true;
    const batched = await read(
      1,
      moreInputs.map((entry) => inputSourceId(entry.id)),
    );
    expect(batched.payload).toEqual({
      readings: moreInputs.map((entry) => ({
        sourceId: inputSourceId(entry.id),
        state: 'unknown',
      })),
    });
    expect(requests.slice(-2).map((request) => request.sources.length)).toEqual([8, 1]);

    const duplicateSocket = await openClient(rig.handle);
    expect((await duplicateSocket.authenticate(randomUUID(), token)).error).toBeUndefined();
    const count = requests.length;
    let release: (() => void) | undefined;
    fixture.holdResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstPoll = read(1, [LIVE]);
    try {
      await waitUntil(() => requests.length > count, 'first native meter poll');
      const sameSocket = read(1, [LIVE]);
      const otherSocket = await duplicateSocket.ask(randomUUID(), SourceAudioLevelsChannel.name, {
        channel: 1,
        sourceIds: [PLAYLIST],
      });
      expect(otherSocket.payload).toEqual({ readings: [] });
      expect(requests).toHaveLength(count + 1);
      release?.();
      expect(await sameSocket).toEqual(await firstPoll);
      expect(requests).toHaveLength(count + 1);
    } finally {
      release?.();
      await firstPoll;
    }
  });
});
