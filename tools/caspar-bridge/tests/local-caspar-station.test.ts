import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayoutIdSchema } from '@cg/shared-ipc';
import { answerFakeMediaQuery } from './support/fake-playout.js';
import {
  AmcpReplyReader,
  LOCAL_CASPAR_READS,
  catalogueFrom,
  libraryFrom,
  mediaFolderOf,
  mediaIdOf,
  oscOf,
  parseCasparTarget,
  parseInfoChannels,
  readCore,
  type LocalCasparRead,
} from './support/local-caspar-station.js';

/**
 * 🔴 `DEV-LOCAL-CASPAR-01` — **THE LOCAL-CORE STATION'S PARTS, ONE AT A TIME**: the loopback rule,
 * the five reads and how their replies are framed, and D4 and D11 built from what a 2.5.0 core says.
 *
 * ⚠ **THE FIXTURE IS SOURCE-DERIVED, NOT CAPTURED.** No core answered on this machine when it was
 * written (the owner's own `dev:station --fake` held 5250). Every byte follows the code that writes
 * it: `CLS` — the media scanner v1.3.4's `generateCinf` (`src/ffmpeg.ts` 139–148: the ID in quotes,
 * TWO spaces each side of the type, `\r\n` per line) relayed verbatim by `cls_command`; `INFO PATHS` —
 * `info_paths_command` (`201`, boost's `write_xml` with a 3-space indent, `initial-path` the start
 * folder with `/` appended — on Windows keeping its backslashes, `env.cpp`). A capture from the
 * owner's core replaces it the first time one is taken.
 */

const CLS_LINES = [
  '"AMB"  MOVIE  6445960 20250101120000 268 1/25',
  '"NEWS/2026/CLIP ONE"  MOVIE  104857600 20260920140500 1500 1/25',
  '"NEWS/2026/LOWER THIRD BG"  MOVIE  2048000 20260920141000 250 1/50',
  '"آرشیو/۱۴۰۵/خبر ساعت ۱۴"  MOVIE  52428800 20260921093000 17982 1001/30000',
  '"PROMO/کلیپ معرفی"  MOVIE  31457280 20260922101500 750 1/25',
  '"LOGO"  STILL  51200 20260101000000 0 0/1',
  '"MUSIC/BED"  AUDIO  4800000 20260102000000 1440000 1/48000',
];
const CLS_REPLY = `200 CLS OK\r\n${CLS_LINES.map((l) => `${l}\r\n`).join('')}\r\n`;

const INFO_PATHS_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<paths>',
  '   <media-path>media/</media-path>',
  '   <log-path>log/</log-path>',
  '   <data-path>data/</data-path>',
  '   <template-path>template/</template-path>',
  '   <initial-path>D:\\CasparCG Server\\Server/</initial-path>',
  '</paths>',
  '',
].join('\n');
const MEDIA_FOLDER = 'D:/CasparCG Server/Server/media/';

// ── The loopback rule ─────────────────────────────────────────────────────────────────────────

describe('the loopback rule — this machine, and only this machine', () => {
  it('🔴 CONTROL — 127.0.0.1:5250 is accepted; 192.168.21.111:5250 is refused, BY NAME, in one line', () => {
    expect(parseCasparTarget('127.0.0.1:5250')).toEqual({ host: '127.0.0.1', port: 5250 });
    const refused = parseCasparTarget('192.168.21.111:5250');
    expect(refused).toEqual({
      error:
        "192.168.21.111 is the test Playout's machine — --caspar never connects there. " +
        "--caspar takes this machine's CasparCG only: 127.0.0.1:5250.",
    });
  });

  it('the plant’s CasparCG (.114) is refused by name too, whatever the port', () => {
    for (const given of ['192.168.21.114:5250', '192.168.21.114', '192.168.21.114:6250']) {
      const result = parseCasparTarget(given);
      expect('error' in result && result.error, given).toMatch(
        /^192\.168\.21\.114 is the plant's CasparCG — --caspar never connects there\./,
      );
    }
  });

  it.each([
    ['127.0.0.1'],
    ['localhost:5250'],
    ['LocalHost:5250'],
    ['[::1]:5250'],
    ['[::1]'],
    ['::1'],
    ['  127.0.0.1:5250  '],
  ])(
    '%j is this machine — dialled as 127.0.0.1:5250, the one address a 2.5.0 core listens on',
    (given) => {
      expect(parseCasparTarget(given)).toEqual({ host: '127.0.0.1', port: 5250 });
    },
  );

  it.each([
    ['10.0.0.5:5250'],
    ['127.0.0.2:5250'],
    ['0.0.0.0:5250'],
    ['192.168.21.93:5250'],
    ['playout.local:5250'],
    ['[::2]:5250'],
  ])('%j is refused: not one of the three spellings of this machine', (given) => {
    const result = parseCasparTarget(given);
    expect('error' in result ? result.error : null).toMatch(
      /is not this machine — --caspar takes this machine's CasparCG only: 127\.0\.0\.1:5250 \(127\.0\.0\.1, ::1 or localhost\)\.$/,
    );
  });

  it.each([
    ['', /takes host:port/],
    ['http://127.0.0.1:5250', /takes host:port/],
    ['::1:5250', /write an IPv6 address in brackets/],
    ['127.0.0.1:', /An empty port is not a port/],
    ['127.0.0.1:abc', /abc is not a port/],
    ['127.0.0.1:5251', /takes port 5250 only: first-run connects the station to CasparCG on 5250/],
    ['localhost:6250', /takes port 5250 only/],
  ])('%j is refused with its reason', (given, reason) => {
    const result = parseCasparTarget(given);
    expect('error' in result ? result.error : null).toMatch(reason);
  });

  it('every refusal is ONE line — even when what was typed holds a newline, a NEL or a Unicode separator', () => {
    // Built from code points: a literal U+2028 in this file would itself end a line of source.
    const NEL = String.fromCodePoint(0x85);
    const LS = String.fromCodePoint(0x2028);
    const PS = String.fromCodePoint(0x2029);
    for (const given of [
      '192.168.21.111:5250',
      '10.0.0.5',
      '::1:5250',
      '127.0.0.1:1',
      '',
      '10.0.0.5\n:5250',
      '127.0.0.1:52\r\n50',
      'a:b:c\nd',
      `10.0.0.5${LS}:5250`,
      `10.0.0.5${NEL}:5250`,
      `127.0.0.1:52${PS}50`,
    ]) {
      const result = parseCasparTarget(given);
      expect('error' in result, given).toBe(true);
      if (!('error' in result)) continue;
      for (const breaks of ['\r', '\n', NEL, LS, PS]) {
        expect(result.error.includes(breaks), `${given} → ${result.error}`).toBe(false);
      }
    }
  });
});

// ── Reading the core ──────────────────────────────────────────────────────────────────────────

describe('the replies, framed as a 2.5.0 core frames them', () => {
  const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

  it('a 200 reply is its lines up to the empty line — and a Persian letter split across two chunks is ONE letter', () => {
    const reader = new AmcpReplyReader();
    const all = bytes(CLS_REPLY);
    // Cut inside the first Persian letter: `آ` is two bytes (D8 A2), and the cut falls between them.
    const persian = Buffer.from(all).indexOf(Buffer.from('آ', 'utf8'));
    expect(persian).toBeGreaterThan(0);
    reader.push(all.subarray(0, persian + 1));
    expect(reader.next()).toBeNull();
    reader.push(all.subarray(persian + 1));
    expect(reader.next()).toEqual({ code: 200, data: CLS_LINES });
    expect(reader.next()).toBeNull();
  });

  it('a 201 reply is ONE chunk up to the next CRLF — XML with its bare \\n inside stays one value', () => {
    const reader = new AmcpReplyReader();
    reader.push(bytes(`201 INFO PATHS OK\r\n${INFO_PATHS_XML}`));
    expect(reader.next(), 'the chunk has not ended').toBeNull();
    reader.push(bytes('\r\n201 VERSION OK\r\n2.5.0 69e8ad5 Stable\r\n'));
    expect(reader.next()).toEqual({ code: 201, data: [INFO_PATHS_XML] });
    expect(reader.next()).toEqual({ code: 201, data: ['2.5.0 69e8ad5 Stable'] });
  });

  it('any other code is its status line alone', () => {
    const reader = new AmcpReplyReader();
    reader.push(bytes('501 CLS FAILED\r\n202 INFO OK\r\n200 INFO OK\r\n\r\n'));
    expect(reader.next()).toEqual({ code: 501, data: [] });
    expect(reader.next()).toEqual({ code: 202, data: [] });
    expect(reader.next()).toEqual({ code: 200, data: [] });
  });
});

/** A scripted core: answers each line it reads from `script`, in small chunks, and records it. */
async function scriptedCore(script: Readonly<Record<string, string>>): Promise<{
  port: number;
  received: string[];
  connections: () => number;
  close: () => Promise<void>;
}> {
  const received: string[] = [];
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    let pending = '';
    socket.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8');
      let end = pending.indexOf('\r\n');
      while (end !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        received.push(line);
        const reply = Buffer.from(script[line] ?? `400 ERROR\r\n${line}\r\n`, 'utf8');
        // Seven bytes at a time: every multi-byte letter in the fixture is split somewhere.
        for (let at = 0; at < reply.length; at += 7) socket.write(reply.subarray(at, at + 7));
        end = pending.indexOf('\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    port,
    received,
    connections: () => connections,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const WHOLE_CORE: Readonly<Record<string, string>> = {
  VERSION: '201 VERSION OK\r\n2.5.0 69e8ad5 Stable\r\n',
  INFO: '200 INFO OK\r\n1 1080i5000 PLAYING\r\n2 720p5000 PLAYING\r\n\r\n',
  'INFO PATHS': `201 INFO PATHS OK\r\n${INFO_PATHS_XML}\r\n`,
  'INFO CONFIG':
    '201 INFO CONFIG OK\r\n<?xml version="1.0" encoding="utf-8"?>\n<configuration/>\n\r\n',
  CLS: CLS_REPLY,
};

describe('readCore — five reads, on one connection, and nothing else', () => {
  it('asks exactly the five reads, in order, and reads every reply whole', async () => {
    const core = await scriptedCore(WHOLE_CORE);
    closers.push(core.close);
    const results = await readCore({ host: '127.0.0.1', port: core.port }, LOCAL_CASPAR_READS);
    expect(core.received).toEqual(['VERSION', 'INFO', 'INFO PATHS', 'INFO CONFIG', 'CLS']);
    expect(core.connections()).toBe(1);
    expect(results.get('VERSION')).toEqual({
      reply: { code: 201, data: ['2.5.0 69e8ad5 Stable'] },
    });
    expect(results.get('INFO PATHS')).toEqual({ reply: { code: 201, data: [INFO_PATHS_XML] } });
    expect(results.get('CLS')).toEqual({ reply: { code: 200, data: CLS_LINES } });
  });

  it('🔴 refuses anything that is not one of the five reads — before a connection is even opened', async () => {
    const core = await scriptedCore(WHOLE_CORE);
    closers.push(core.close);
    await expect(
      readCore({ host: '127.0.0.1', port: core.port }, ['CLEAR 1' as LocalCasparRead]),
    ).rejects.toThrow(/CLEAR 1 is not one of the local core's reads — nothing was sent/);
    expect(core.connections()).toBe(0);
    // Control: the instrument counts a connection when there is one.
    await readCore({ host: '127.0.0.1', port: core.port }, ['VERSION']);
    expect(core.connections()).toBe(1);
  });

  it('refuses any host but 127.0.0.1, whatever the caller’s types said', async () => {
    await expect(
      // Never a plant address here: were the guard to regress, this spec would dial the host it names.
      // 127.0.0.2 is this machine, and nothing listens on its port 1.
      readCore({ host: '127.0.0.2' as '127.0.0.1', port: 1 }, ['VERSION']),
    ).rejects.toThrow(/read on 127\.0\.0\.1 only — refused 127\.0\.0\.2/);
  });

  it('a 501 is that read failed, and the next read is still asked', async () => {
    const core = await scriptedCore({ ...WHOLE_CORE, CLS: '501 CLS FAILED\r\n' });
    closers.push(core.close);
    const results = await readCore({ host: '127.0.0.1', port: core.port }, ['CLS', 'VERSION']);
    expect(results.get('CLS')).toEqual({ failed: 'answered 501' });
    expect(results.get('VERSION')).toHaveProperty('reply');
  });

  it('a 400 (which carries the refused line after it) ends the asking — nothing more is sent', async () => {
    const script = Object.fromEntries(
      Object.entries(WHOLE_CORE).filter(([line]) => line !== 'INFO PATHS'),
    );
    const core = await scriptedCore(script);
    closers.push(core.close);
    const results = await readCore({ host: '127.0.0.1', port: core.port }, LOCAL_CASPAR_READS);
    expect(results.get('INFO PATHS')).toEqual({ failed: 'answered 400' });
    expect(results.get('CLS')).toEqual({ failed: 'not asked after INFO PATHS was refused' });
    expect(core.received).toEqual(['VERSION', 'INFO', 'INFO PATHS']);
  });

  it('nothing listening is a rejection, not a result', async () => {
    const core = await scriptedCore(WHOLE_CORE);
    await core.close();
    await expect(readCore({ host: '127.0.0.1', port: core.port }, ['VERSION'])).rejects.toThrow();
  });
});

// ── What the core said ────────────────────────────────────────────────────────────────────────

describe('INFO — the channels', () => {
  it('one per line, in channel order; anything that is not a channel line is left out', () => {
    expect(
      parseInfoChannels(['2 720p5000 PLAYING', '1 1080i5000 PLAYING', 'junk', '2 PAL PLAYING']),
    ).toEqual([
      { channel: 1, format: '1080i5000' },
      { channel: 2, format: '720p5000' },
    ]);
  });

  it('D4: CH n · local, on 127.0.0.1, air state unknown', () => {
    expect(catalogueFrom(parseInfoChannels(['1 1080i5000 PLAYING', '2 720p5000 PLAYING']))).toEqual(
      [
        {
          id: 'local-ch1',
          name: 'CH 1 · local',
          casparHost: '127.0.0.1',
          casparChannel: 1,
          output: 'unknown',
        },
        {
          id: 'local-ch2',
          name: 'CH 2 · local',
          casparHost: '127.0.0.1',
          casparChannel: 2,
          output: 'unknown',
        },
      ],
    );
  });
});

describe('INFO PATHS — the media folder, absolute and with / only', () => {
  const paths = (media: string, initial: string): string =>
    `<?xml version="1.0" encoding="utf-8"?>\n<paths>\n   <media-path>${media}</media-path>\n   <initial-path>${initial}</initial-path>\n</paths>\n`;

  it('the stock relative media/ is joined to the start folder, and every backslash becomes /', () => {
    expect(mediaFolderOf(INFO_PATHS_XML)).toBe(MEDIA_FOLDER);
  });

  it.each([
    ['an absolute Windows folder is kept', 'E:\\Clips\\', 'D:\\CasparCG/', 'E:/Clips/'],
    ['a POSIX start folder', 'media/', '/opt/casparcg/', '/opt/casparcg/media/'],
    ['./media and no trailing slash', './media', 'C:\\casparcg/', 'C:/casparcg/media/'],
    ['entities are text', 'media/', 'D:\\Ali&apos;s &amp; Co/', "D:/Ali's & Co/media/"],
  ])('%s', (_what, media, initial, folder) => {
    expect(mediaFolderOf(paths(media, initial))).toBe(folder);
  });

  it('no media-path, or a relative one with no start folder, is no folder', () => {
    expect(mediaFolderOf('<paths></paths>')).toBeNull();
    expect(mediaFolderOf('<paths><media-path>media/</media-path></paths>')).toBeNull();
  });
});

describe('INFO CONFIG — whether the remaining time can show', () => {
  it('a config with no <osc> sends to every AMCP client on 6250 — the defaults `setup_osc` reads', () => {
    expect(oscOf('<configuration><paths/></configuration>')).toEqual({
      toClients: true,
      port: 6250,
    });
  });

  it('disable-send-to-amcp-clients turns it off; default-port moves it; a predefined client’s port is not it', () => {
    expect(
      oscOf(
        '<configuration><osc><disable-send-to-amcp-clients>true</disable-send-to-amcp-clients></osc></configuration>',
      ),
    ).toEqual({ toClients: false, port: 6250 });
    expect(oscOf('<osc><default-port>6251</default-port></osc>')).toEqual({
      toClients: true,
      port: 6251,
    });
    expect(
      oscOf(
        '<osc><predefined-clients><predefined-client><address>127.0.0.1</address><port>5253</port></predefined-client></predefined-clients></osc>',
      ),
    ).toEqual({ toClients: true, port: 6250 });
  });

  it('the setting is read as the core reads it: `1` and `true` turn OSC off; `True` does not parse, so it stays on', () => {
    const osc = (value: string) =>
      oscOf(`<osc><disable-send-to-amcp-clients>${value}</disable-send-to-amcp-clients></osc>`);
    expect(osc('1')).toEqual({ toClients: false, port: 6250 });
    expect(osc(' true ')).toEqual({ toClients: false, port: 6250 });
    expect(osc('True')).toEqual({ toClients: true, port: 6250 });
    expect(osc('false')).toEqual({ toClients: true, port: 6250 });
  });
});

describe('CLS — the D11 library, from the fixture', () => {
  const library = libraryFrom(CLS_LINES, MEDIA_FOLDER);
  const byName = (name: string) => {
    const item = library.find((m) => m.name === name);
    if (item === undefined) throw new Error(`no item named ${name}`);
    return item;
  };

  it('names with spaces and Persian letters, in sub-folders: each clip is the media folder + its ID — absolute, / only', () => {
    expect(byName('CLIP ONE')).toMatchObject({
      clip: 'D:/CasparCG Server/Server/media/NEWS/2026/CLIP ONE',
      folder: 'NEWS/2026',
      type: 'video',
      durationMs: 60_000,
    });
    expect(byName('خبر ساعت ۱۴')).toMatchObject({
      clip: 'D:/CasparCG Server/Server/media/آرشیو/۱۴۰۵/خبر ساعت ۱۴',
      folder: 'آرشیو/۱۴۰۵',
      durationMs: 599_999,
    });
    expect(byName('کلیپ معرفی')).toMatchObject({ folder: 'PROMO', durationMs: 30_000 });
    expect(byName('AMB')).toMatchObject({
      clip: 'D:/CasparCG Server/Server/media/AMB',
      folder: '',
      durationMs: 10_720,
    });
    for (const item of library) {
      expect(item.clip.startsWith(MEDIA_FOLDER), item.clip).toBe(true);
      expect(item.clip).not.toContain('\\');
    }
  });

  it('a still has no length; audio is listed as audio; every line is one item', () => {
    expect(library).toHaveLength(CLS_LINES.length);
    expect(byName('LOGO').type).toBe('still');
    expect(byName('LOGO')).not.toHaveProperty('durationMs');
    expect(byName('BED')).toMatchObject({ type: 'audio', durationMs: 30_000 });
  });

  it('ids are the contract’s shape, one per clip, and the SAME on every read', () => {
    for (const item of library)
      expect(PlayoutIdSchema.safeParse(item.id).success, item.id).toBe(true);
    expect(new Set(library.map((m) => m.id)).size).toBe(library.length);
    expect(libraryFrom(CLS_LINES, MEDIA_FOLDER).map((m) => m.id)).toEqual(library.map((m) => m.id));
    expect(mediaIdOf('NEWS/2026/CLIP ONE')).toBe(byName('CLIP ONE').id);
  });

  it('updatedAt is the scanner’s local time as an instant — this machine’s zone is the scanner’s', () => {
    expect(byName('CLIP ONE').updatedAt).toBe(new Date(2026, 8, 20, 14, 5, 0).toISOString());
  });

  it('D11 search, sorting and paging work over it as they do on the fake', () => {
    const page = (q: Record<string, string>) => {
      const answer = answerFakeMediaQuery(library, new URLSearchParams(q));
      if (answer === null) throw new Error('refused');
      return answer;
    };
    // The bridge asks for plates' types: audio never comes back.
    const all = page({ q: '', type: 'video,still', limit: '50' });
    expect(all.total).toBe(6);
    expect(all.items.some((m) => m.type === 'audio')).toBe(false);
    // Case is folded: the scanner upper-cases, the owner types lower-case.
    expect(page({ q: 'clip one', type: 'video,still' }).items.map((m) => m.name)).toEqual([
      'CLIP ONE',
    ]);
    // Persian, and a folder name.
    expect(page({ q: 'خبر', type: 'video,still' }).items.map((m) => m.name)).toEqual([
      'خبر ساعت ۱۴',
    ]);
    expect(page({ q: 'news', type: 'video,still' }).total).toBe(2);
    // Paging: two at a time, no repeat, no gap.
    const first = page({ q: '', type: 'video,still', limit: '2' });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = page({
      q: '',
      type: 'video,still',
      limit: '2',
      cursor: first.nextCursor ?? '',
    });
    expect(second.items.map((m) => m.id)).not.toContain(first.items[0]?.id);
    // Recent first.
    expect(page({ q: '', type: 'video,still', sort: 'recent' }).items[0]?.name).toBe('کلیپ معرفی');
  });
});

describe('what it can never do', () => {
  const source = fs.readFileSync(
    fileURLToPath(new URL('./support/local-caspar-station.ts', import.meta.url)),
    'utf8',
  );

  it('it sends five reads and no other command', () => {
    expect([...LOCAL_CASPAR_READS]).toEqual([
      'VERSION',
      'INFO',
      'INFO PATHS',
      'INFO CONFIG',
      'CLS',
    ]);
    // Its ONE write to a socket sends a read from that list (checked by `readCore` above), and
    // nothing else in it writes.
    const writes = source.split('\n').filter((line) => line.includes('.write('));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/socket\.write\(`\$\{read\}\\r\\n`, 'utf8'\)/);
  });

  it('it writes no file: it imports no file API — so nothing lands in the core’s folder', () => {
    expect(source).not.toMatch(/from 'node:fs|from 'fs|node:fs\/promises|require\(/);
    // Control: the instrument reads its imports.
    expect(source).toContain("from 'node:net'");
  });
});
