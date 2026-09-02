import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  GATE_LOG_DIR,
  GATE_LOG_KEEP,
  gateLogFileName,
  gateLogFooter,
  gateLogHeader,
  gateLogPath,
  gateLogStamp,
  logsToPrune,
  openGateLog,
} from '../src/gate-log.mjs';

/**
 * P-040 — the gate persists its FULL output, so the next unexplained failure is readable.
 *
 * The claim this suite defends is narrow and complete: everything the gate prints lands
 * in ONE file under `.gate-logs/`, framed by a header that says what ran and a footer
 * that says how it ended; the file's name sorts by time; old logs are pruned by that
 * order and nothing else in the directory is touched; and a broken filesystem costs the
 * log, never the gate.
 */

const realFs = { mkdirSync, appendFileSync, readdirSync, unlinkSync };

describe('names', () => {
  it('stamps an instant without separators, so names sort chronologically and are legal everywhere', () => {
    expect(gateLogStamp(new Date('2026-09-02T21:16:34.567Z'))).toBe('20260902T211634Z');
    expect(gateLogFileName(new Date('2026-09-02T21:16:34.567Z'), 4242)).toBe(
      'gate-20260902T211634Z-4242.log',
    );
    expect(gateLogPath('/repo', new Date('2026-09-02T21:16:34Z'), 7)).toBe(
      join('/repo', GATE_LOG_DIR, 'gate-20260902T211634Z-7.log'),
    );
  });

  it('two gates in the same second get two files — the pid tells them apart', () => {
    const at = new Date('2026-09-02T21:16:34Z');
    expect(gateLogFileName(at, 1)).not.toBe(gateLogFileName(at, 2));
  });
});

describe('framing', () => {
  it('the header says what ran, where and when', () => {
    const header = gateLogHeader({
      command: 'pnpm run gate:run',
      cwd: 'D:\\work\\cg',
      startedAt: new Date('2026-09-02T21:16:34Z'),
    });
    expect(header).toContain('gate started 2026-09-02T21:16:34.000Z');
    expect(header).toContain('cwd D:\\work\\cg');
    expect(header).toContain('$ pnpm run gate:run');
  });

  it('the footer says how it ended — exit code, or the signal that killed it — and how long it took', () => {
    const startedAt = new Date('2026-09-02T21:16:34Z');
    expect(
      gateLogFooter({
        code: 1,
        signal: null,
        startedAt,
        endedAt: new Date('2026-09-02T21:18:59.5Z'),
      }),
    ).toContain('gate ended 2026-09-02T21:18:59.500Z (exit 1, 145.5s)');
    expect(
      gateLogFooter({
        code: null,
        signal: 'SIGINT',
        startedAt,
        endedAt: new Date('2026-09-02T21:16:35Z'),
      }),
    ).toContain('(killed by SIGINT, 1s)');
  });
});

describe('logsToPrune', () => {
  // HHMMSS is six digits; `1000000 + i` sliced past its leading `1` pads to exactly that.
  const names = (n: number): string[] =>
    Array.from(
      { length: n },
      (_, i) => `gate-20260902T${String(1000000 + i).slice(1)}Z-${String(i)}.log`,
    );

  it('keeps the newest N by name and returns the rest, oldest first', () => {
    const all = names(23);
    const prune = logsToPrune(all, 20);
    expect(prune).toEqual(all.slice(0, 3));
    // Order-independent: a listing in any order yields the same victims.
    expect(logsToPrune([...all].reverse(), 20)).toEqual(all.slice(0, 3));
  });

  it('never names a file that is not a gate log — the Stop hook keeps its own logs here', () => {
    const others = ['c6bbd627-e396-4d70-9aa1-8e237f9eeaad.log', 'notes.txt', 'gate-latest.log'];
    expect(logsToPrune([...names(30), ...others], 20)).toEqual(names(30).slice(0, 10));
  });

  it('prunes nothing at or under the keep count, and the default keep is the exported constant', () => {
    expect(logsToPrune(names(20), 20)).toEqual([]);
    expect(logsToPrune(names(GATE_LOG_KEEP + 1))).toHaveLength(1);
  });
});

describe('openGateLog — one real round-trip on disk', () => {
  it('writes header, every chunk in order, and the footer; then prunes by name and only gate logs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cg-gate-log-'));
    try {
      const dir = join(root, GATE_LOG_DIR);
      // Pre-existing logs: 20 gate logs older than ours, plus a Stop-hook log that must survive.
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < 20; i++) {
        appendFileSync(
          join(dir, `gate-20260901T${String(1000000 + i).slice(1)}Z-${String(i)}.log`),
          'old\n',
        );
      }
      appendFileSync(join(dir, 'session-abc.log'), 'stop hook\n');

      const startedAt = new Date('2026-09-02T21:16:34Z');
      const log = openGateLog({
        root,
        command: 'pnpm run gate:run',
        cwd: root,
        startedAt,
        pid: 99,
        fs: realFs,
      });
      log.write('turbo 2.9.14\n');
      log.write(Buffer.from('@cg/runtime:test: 93 passed\n'));
      log.write('FAIL @cg/caspar-bridge:test\n');
      log.close({ code: 1, signal: null, endedAt: new Date('2026-09-02T21:18:00Z') });

      const text = readFileSync(log.path, 'utf8');
      expect(text.indexOf('$ pnpm run gate:run')).toBeGreaterThan(-1);
      expect(text.indexOf('turbo 2.9.14')).toBeLessThan(text.indexOf('93 passed'));
      expect(text.indexOf('93 passed')).toBeLessThan(text.indexOf('FAIL @cg/caspar-bridge:test'));
      expect(text).toContain('(exit 1, 86s)');

      // 21 gate logs existed at close; the OLDEST went, ours stayed, the Stop hook's stayed.
      const remaining = readdirSync(dir).sort();
      expect(remaining).toHaveLength(21);
      expect(remaining).toContain(gateLogFileName(startedAt, 99));
      expect(remaining).toContain('session-abc.log');
      expect(remaining).not.toContain('gate-20260901T000000Z-0.log');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('a filesystem that refuses is reported ONCE and the writer keeps accepting — the gate is never blocked', () => {
    const warnings: string[] = [];
    const refusing = {
      mkdirSync: () => {
        throw new Error('EROFS: read-only file system');
      },
      appendFileSync: () => {
        throw new Error('should not be reached after open failed');
      },
      readdirSync: () => [],
      unlinkSync: () => undefined,
    };
    const log = openGateLog({
      root: '/nowhere',
      command: 'pnpm run gate:run',
      cwd: '/nowhere',
      startedAt: new Date(),
      pid: 1,
      fs: refusing,
      warn: (m) => warnings.push(m),
    });
    expect(() => {
      log.write('a');
      log.write('b');
      log.close({ code: 0, signal: null, endedAt: new Date() });
    }).not.toThrow();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('EROFS');
    expect(warnings[0]).toContain('the gate still runs');
    expect(existsSync(log.path)).toBe(false);
  });
});
