import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';
import type { MockHandle, MockMediaFile } from '../src/types.js';

/**
 * `DEV-LOCAL-CASPAR-01` — **`INFO PATHS` AND `CLS`, AS A 2.5.0 CORE ANSWERS THEM.** The dev station's
 * local-core mode reads a real core's media folder and library through these two replies, so the
 * mock that stands in for that core in the suite speaks them byte for byte:
 *
 *   - `INFO PATHS` — `201 INFO PATHS OK` and one XML chunk, bare `\n` inside, one `\r\n` after it
 *     (`AMCPCommandsImpl.cpp` `info_paths_command`);
 *   - `CLS` — the media scanner's body relayed verbatim (`200 CLS OK`, one `generateCinf` line per
 *     file, an empty line), or `501` when no scanner runs (`make_request`).
 */

let mock: MockHandle | undefined;

afterEach(async () => {
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

const CLIP: MockMediaFile = {
  id: 'NEWS/2026/CLIP ONE',
  type: 'MOVIE',
  bytes: 6445960,
  modified: '20260920140500',
  frames: 268,
  timebase: '1/25',
};
const PERSIAN: MockMediaFile = {
  id: 'آرشیو/خبر ۱۴۰۵',
  type: 'MOVIE',
  bytes: 1200,
  modified: '20260921093000',
  frames: 1500,
  timebase: '1001/30000',
};
const STILL: MockMediaFile = {
  id: 'LOGO',
  type: 'STILL',
  bytes: 5000,
  modified: '20260101000000',
  frames: 0,
  timebase: '0/1',
};

/** One request, read until the server goes quiet — raw bytes, decoded as UTF-8. */
function send(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    const chunks: Buffer[] = [];
    sock.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    sock.on('connect', () => {
      sock.write(`${line}\r\n`);
      setTimeout(() => sock.end(), 60);
    });
    sock.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    sock.on('error', reject);
  });
}

describe('INFO PATHS', () => {
  it('answers 201 INFO PATHS OK and ONE xml chunk, with the media and initial folders as a core spells them', async () => {
    mock = await createMock({
      amcpPort: 0,
      oscPort: 0,
      disableOsc: true,
      paths: { media: 'media/', initial: "D:\\CasparCG Ali's/" },
    });
    expect(await send(mock.amcpPort, 'INFO PATHS')).toBe(
      '201 INFO PATHS OK\r\n' +
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<paths>\n' +
        '   <media-path>media/</media-path>\n' +
        '   <log-path>log/</log-path>\n' +
        '   <data-path>data/</data-path>\n' +
        '   <template-path>template/</template-path>\n' +
        '   <initial-path>D:\\CasparCG Ali&apos;s/</initial-path>\n' +
        '</paths>\n' +
        '\r\n',
    );
  });

  it('defaults to a stock install: the relative media/ under C:\\casparcg/', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const reply = await send(mock.amcpPort, 'INFO PATHS');
    expect(reply).toContain('<media-path>media/</media-path>');
    expect(reply).toContain('<initial-path>C:\\casparcg/</initial-path>');
  });

  it('CONTROL — INFO and INFO CONFIG answer as they did', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true, channels: 2 });
    expect(await send(mock.amcpPort, 'INFO')).toBe(
      '200 INFO OK\r\n1 PAL PLAYING\r\n2 PAL PLAYING\r\n\r\n',
    );
    expect(await send(mock.amcpPort, 'INFO CONFIG')).toMatch(/^201 INFO OK\r\n<\?xml/);
  });
});

describe('CLS', () => {
  it('with no scanner running it answers 501, as a stock 2.5.0 core does', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    expect(await send(mock.amcpPort, 'CLS')).toBe('501 ERROR\r\n');
  });

  it('lists every file in the scanner’s own spacing — two spaces around the type — then an empty line', async () => {
    mock = await createMock({
      amcpPort: 0,
      oscPort: 0,
      disableOsc: true,
      media: [CLIP, PERSIAN, STILL],
    });
    expect(await send(mock.amcpPort, 'CLS')).toBe(
      '200 CLS OK\r\n' +
        '"NEWS/2026/CLIP ONE"  MOVIE  6445960 20260920140500 268 1/25\r\n' +
        '"آرشیو/خبر ۱۴۰۵"  MOVIE  1200 20260921093000 1500 1001/30000\r\n' +
        '"LOGO"  STILL  5000 20260101000000 0 0/1\r\n' +
        '\r\n',
    );
  });

  it('an empty library is 200 with no lines', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true, media: [] });
    expect(await send(mock.amcpPort, 'CLS')).toBe('200 CLS OK\r\n\r\n');
  });

  it('setMedia changes what the NEXT CLS lists, and null stops the scanner', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true, media: [CLIP] });
    expect(await send(mock.amcpPort, 'CLS')).toContain('"NEWS/2026/CLIP ONE"');
    mock.setMedia([STILL]);
    const next = await send(mock.amcpPort, 'CLS');
    expect(next).toContain('"LOGO"');
    expect(next).not.toContain('CLIP ONE');
    mock.setMedia(null);
    expect(await send(mock.amcpPort, 'CLS')).toBe('501 ERROR\r\n');
  });
});
