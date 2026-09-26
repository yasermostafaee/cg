import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpLog,
  formatAmcpLogLine,
  previousLogPath,
  redactAmcpLine,
  type AmcpLogEntry,
} from '../src/amcp-log.js';
import { standardBank, twoChannelRig } from './support/two-channel-rig.js';

/**
 * 🔴 `FIELD-FIXES-01-A` — **THE AMCP LOG: every command, its reply line and its time, in the
 * installed app's logs folder — and never a token.**
 *
 * Why the installed app wrote none of this: NEITHER did the dev bridge. The bridge had no AMCP log
 * at all; the only trace in the tree was the MOCK's, switched on by tests. So it is written by the
 * bridge itself, at the session queue every command passes (`CommandQueue`'s `exchange`), into
 * `<state-home>/logs/amcp.log` — the flag the installed app's sidecar and the dev station already
 * pass. These specs drive the BUNDLED sidecar the way the desktop shell starts it.
 */

const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const BUNDLE_SCRIPT = fileURLToPath(new URL('../scripts/bundle.mjs', import.meta.url));

const entry = (over: Partial<AmcpLogEntry> = {}): AmcpLogEntry => ({
  line: 'PLAY 2-60 DECKLINK DEVICE 1',
  reply: '403 PLAY FAILED',
  ms: 4,
  server: 'A',
  host: '192.168.21.111:5250',
  at: Date.parse('2026-09-26T09:40:00.296Z'),
  ...over,
});

describe('one line per exchange', () => {
  it('says when, where, how long, the command and the reply line exactly as sent', () => {
    expect(formatAmcpLogLine(entry())).toBe(
      '2026-09-26T09:40:00.296Z A 192.168.21.111:5250 4ms >> PLAY 2-60 DECKLINK DEVICE 1 << 403 PLAY FAILED',
    );
    const unanswered: AmcpLogEntry = {
      line: 'CG 2-59 PLAY 0',
      error: 'timeout',
      ms: 2000,
      server: 'A',
      host: '192.168.21.111:5250',
      at: Date.parse('2026-09-26T09:40:02.300Z'),
    };
    expect(formatAmcpLogLine(unanswered)).toBe(
      '2026-09-26T09:40:02.300Z A 192.168.21.111:5250 2000ms >> CG 2-59 PLAY 0 << no reply: timeout',
    );
    expect(formatAmcpLogLine(entry({ reply: '202 CG OK', late: true }))).toContain(
      '<< 202 CG OK (late — after its timeout)',
    );
  });

  it('🔴 never writes a take token — in the escaped payload a CG ADD carries, or bare', () => {
    const add =
      'CG 2-59 ADD 0 "http://192.168.21.93:7911/template/cb25ece1?cw=1920&ch=1080" 0 ' +
      '"{\\"__cg\\":{\\"look\\":\\"look-2\\",\\"take\\":\\"170a5c72b02e9052b92e8bb1279961f7\\"}}"';
    const redacted = redactAmcpLine(add);
    expect(redacted).not.toContain('170a5c72b02e9052b92e8bb1279961f7');
    expect(redacted).toContain('\\"take\\":\\"<redacted>');
    // CONTROL — the rest of the command is intact, so the line still says what was sent.
    expect(redacted).toContain('\\"look\\":\\"look-2\\"');
    expect(redacted).toContain('http://192.168.21.93:7911/template/cb25ece1?cw=1920&ch=1080');
    expect(redactAmcpLine('{"take":"abc123"}')).toBe('{"take":"<redacted>"}');
  });
});

describe('the file', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });
  const tmp = (): string => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-amcp-log-'));
    dirs.push(d);
    return d;
  };

  it('is size-capped: past the cap the file becomes amcp.previous.log and a fresh one starts', async () => {
    const file = path.join(tmp(), 'logs', 'amcp.log');
    const log = new AmcpLog(file, { maxBytes: 400 });
    for (let i = 0; i < 6; i++) log.write(entry({ line: `MIXER 1-${String(90 + i)} VOLUME 1` }));
    await log.flush();
    const previous = previousLogPath(file);
    expect(previous.endsWith('amcp.previous.log')).toBe(true);
    expect(fs.existsSync(previous)).toBe(true);
    expect(fs.statSync(file).size).toBeLessThanOrEqual(400);
    // Nothing was lost across the rotation: every line is in one of the two files.
    const all = fs.readFileSync(previous, 'utf8') + fs.readFileSync(file, 'utf8');
    for (let i = 0; i < 6; i++) expect(all).toContain(`MIXER 1-${String(90 + i)} VOLUME 1`);
  });

  it('fails OPEN: a log that cannot be written is switched off and never throws', async () => {
    const dir = tmp();
    const blocker = path.join(dir, 'logs');
    fs.writeFileSync(blocker, 'a file where the folder should be');
    const log = new AmcpLog(path.join(blocker, 'amcp.log'));
    expect(() => log.write(entry())).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });
});

describe('the bridge writes it', () => {
  it('🔴 a take writes its commands and their replies, with the take token redacted', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-amcp-rig-')), 'amcp.log');
    const rig = await twoChannelRig({ banks: [standardBank(1)], bridge: { amcpLogPath: file } });
    expect(
      await rig.handle.runtime.loadFixed({ channel: 1, layer: 99 }, 'logo-1', 'logo', {}),
    ).toEqual({ accepted: true });
    expect((await rig.handle.runtime.take('logo-1')).accepted).toBe(true);
    await rig.handle.amcpLog?.flush();

    const text = fs.readFileSync(file, 'utf8');
    expect(text).toMatch(
      /ms >> CG 1-99 ADD 0 "http:\/\/[^ ]+\/template\/logo\?[^ ]+" 0 "[^\n]*<< 202/,
    );
    expect(text).toMatch(/ms >> CG 1-99 PLAY 0 << 202/);
    expect(text).toContain('<redacted>');
    expect(text).not.toMatch(/\\"take\\":\\"[0-9a-f]{8,}/);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }, 30_000);
});

// ───────────────────────────── the installed app's sidecar ─────────────────────────────

let child: ChildProcessWithoutNullStreams | null = null;
let mock: MockHandle | null = null;
afterEach(async () => {
  if (child !== null && child.exitCode === null) child.kill();
  child = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

describe('the installed app', () => {
  it('🔴 the sidecar, started as the desktop shell starts it, writes <state-home>/logs/amcp.log — and its own stderr is unchanged', async () => {
    if (!fs.existsSync(DIST))
      throw new Error(`${DIST} is missing — build @cg/caspar-bridge first.`);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-amcp-sidecar-'));
    const bundle = path.join(work, 'bridge', 'caspar-bridge.mjs');
    const stateHome = path.join(work, 'CG Control');
    const fakeHome = path.join(work, 'home');
    const consoleDir = path.join(work, 'console');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(consoleDir, { recursive: true });
    fs.writeFileSync(
      path.join(consoleDir, 'index.html'),
      '<!doctype html><title>CG Control</title>',
    );
    const bundled = spawnSync(process.execPath, [BUNDLE_SCRIPT, bundle], { encoding: 'utf8' });
    if (bundled.status !== 0) throw new Error(`bundling failed:\n${bundled.stderr}`);

    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 10 });
    let stderr = '';
    const proc = spawn(
      process.execPath,
      [
        bundle,
        '--state-home',
        stateHome,
        '--console-dir',
        consoleDir,
        '--console-port',
        '0',
        '--exit-on-stdin-close',
        '--port',
        '0',
        '--template-serve-port',
        '0',
        '--caspar-host',
        '127.0.0.1',
        '--amcp-port',
        String(mock.amcpPort),
        '--osc-port',
        String(oscPort),
      ],
      {
        env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    child = proc;
    proc.stdout.resume();
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const file = path.join(stateHome, 'logs', 'amcp.log');
    const deadline = Date.now() + 30_000;
    while (!(fs.existsSync(file) && /<< 20\d /.test(fs.readFileSync(file, 'utf8')))) {
      if (Date.now() > deadline) throw new Error(`no AMCP log at ${file}. stderr:\n${stderr}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    const text = fs.readFileSync(file, 'utf8');
    // Every line: a time, the server, a round trip, the command and its reply.
    for (const line of text.trim().split('\n')) {
      expect(line).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z A 127\.0\.0\.1:\d+ \d+ms >> \S.* << /);
    }
    // The boot line says where it is…
    expect(stderr).toContain(`AMCP log: ${file}`);
    // …and the bridge's own stderr (what the shell keeps as bridge.log) carries no exchange line.
    expect(stderr).not.toMatch(/ms >> /);
    expect(fs.readdirSync(fakeHome)).toEqual([]);
    fs.rmSync(work, { recursive: true, force: true });
  }, 90_000);
});
