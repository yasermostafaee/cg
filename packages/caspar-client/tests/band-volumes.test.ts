import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { bandVolumeQuery, parseBandVolumeReplies, readBandVolumes } from '../src/index.js';

/**
 * `BRIDGE-TRUTH-01` §3 — **THE BAND READER: one write burst, one read, replies matched by order.**
 *
 * The before/after readings the joint run owes are layer VOLUMES, which only
 * `MIXER <ch>-<layer> VOLUME` reads — never `INFO`, whose `<volume>` nodes are the output bus's
 * meters. There is no bulk read, so the band is read as N pipelined queries on one connection.
 */

let mock: MockHandle | null = null;
afterEach(async () => {
  await mock?.stop();
  mock = null;
});

describe('parseBandVolumeReplies', () => {
  it('matches replies to layers by order, and waits for an incomplete reply', () => {
    const text = '201 MIXER OK\r\n1\r\n201 MIXER OK\r\n0.25\r\n';
    expect(parseBandVolumeReplies(text, [70, 71])).toEqual([
      { layer: 70, volume: 1 },
      { layer: 71, volume: 0.25 },
    ]);
    // The second value has not arrived — no answer yet, never a guess.
    expect(parseBandVolumeReplies('201 MIXER OK\r\n1\r\n201 MIXER OK\r\n', [70, 71])).toBeNull();
    expect(parseBandVolumeReplies('201 MIXER OK\r\n0.2', [70])).toBeNull();
  });

  it('a refusal is that layer’s error and does not shift the layers after it', () => {
    const text = '201 MIXER OK\r\n1\r\n404 MIXER ERROR\r\n201 MIXER OK\r\n0\r\n';
    expect(parseBandVolumeReplies(text, [70, 71, 72])).toEqual([
      { layer: 70, volume: 1 },
      { layer: 71, error: '404 MIXER ERROR' },
      { layer: 72, volume: 0 },
    ]);
  });

  it('reads the number, not the server’s spelling of it', () => {
    expect(parseBandVolumeReplies('201 MIXER OK\r\n1.000000\r\n', [70])).toEqual([
      { layer: 70, volume: 1 },
    ]);
    expect(parseBandVolumeReplies('201 MIXER OK\r\n\r\n', [70])).toEqual([
      { layer: 70, error: 'unreadable value: ' },
    ]);
  });

  it('the burst is one query per layer, channel-layer addressed', () => {
    expect(bandVolumeQuery(4, [45, 46])).toBe('MIXER 4-45 VOLUME\r\nMIXER 4-46 VOLUME\r\n');
  });
});

describe('readBandVolumes — against the fake CasparCG', () => {
  it('reads a fifty-layer band in one burst, each layer’s own transform volume', async () => {
    mock = await createMock({ amcpPort: 0 });
    const layers = Array.from({ length: 50 }, (_, i) => 50 + i);
    // Positive control: two layers that differ from a fresh layer, so a reader that returned
    // the same number for every layer — or read the bus meter — could not pass.
    mock.setLayerVolume({ channel: 1, layer: 72 }, 0);
    mock.setLayerVolume({ channel: 1, layer: 95 }, 0.25);

    const { volumes, elapsedMs } = await readBandVolumes({
      host: mock.host,
      port: mock.amcpPort,
      channel: 1,
      layers,
    });

    expect(volumes).toHaveLength(50);
    expect(volumes.find((v) => v.layer === 72)).toEqual({ layer: 72, volume: 0 });
    expect(volumes.find((v) => v.layer === 95)).toEqual({ layer: 95, volume: 0.25 });
    expect(volumes.filter((v) => 'volume' in v && v.volume === 1)).toHaveLength(48);
    // The measured cost, printed for the record — asserted only against the timeout.
    process.stdout.write(
      `band read: 50 layers in ${elapsedMs.toFixed(1)} ms (loopback, fake CasparCG)\n`,
    );
    expect(elapsedMs).toBeLessThan(5000);
  });
});
