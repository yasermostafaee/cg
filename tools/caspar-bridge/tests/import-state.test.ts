import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IMPORT_MARKER, findPerUserStates, importStateOnce } from '../src/import-state.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 A — an older per-user state is imported ONCE into CG Bridge's own state;
 * nothing is deleted, nothing overwritten, and no token crosses from a console's bridge to the
 * service. Every path is a scratch directory.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-import-'));
  dirs.push(d);
  return d;
}

/** A user's old CG Control state: its `.cg-runtime`, with files and one mtime. */
function userState(
  root: string,
  user: string,
  files: Record<string, string>,
  mtimeMs: number,
): string {
  const dir = path.join(root, user, 'AppData', 'Roaming', 'CG Control', '.cg-runtime');
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  }
  return dir;
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = path.join(rel, e.name);
      if (e.isDirectory()) walk(child);
      else out[child.split(path.sep).join('/')] = fs.readFileSync(path.join(dir, child), 'utf8');
    }
  };
  walk('');
  return out;
}

describe('the one-time import', () => {
  it('🔴 the NEWEST user state is copied — never its token, its Playout or its CasparCG — and the source is untouched', () => {
    const users = scratch();
    const older = userState(
      users,
      'old-op',
      { 'bridge-stack.json': '{"old":true}' },
      1_000_000_000_000,
    );
    const newer = userState(
      users,
      'operator',
      {
        'bridge-stack.json': '{"items":[]}',
        'bridge-live-layers.json': '{"v":1}',
        'bridge-audit.ndjson': '{"a":1}\n',
        'bridge-templates/lower-third.json': '{"t":1}',
        'bridge-templates/template-channels.json': '{"v":1}',
        'bridge-session.json': '{"refreshToken":"never-copied"}',
        'bridge-playout.json': '{"playout":{}}',
        'bridge-connection.json': '{"servers":{}}',
        'bridge-stack.json.123.tmp': 'half-written',
      },
      1_700_000_000_000,
    );
    const before = snapshot(newer);
    const service = scratch();

    const candidates = findPerUserStates(users);
    expect(candidates.map((c) => c.dir)).toEqual([newer, older]);
    const outcome = importStateOnce(service, candidates, Date.parse('2026-09-30T09:00:00Z'));

    expect(outcome).toEqual({
      kind: 'imported',
      from: newer,
      files: [
        'bridge-audit.ndjson',
        'bridge-live-layers.json',
        'bridge-stack.json',
        'bridge-templates/lower-third.json',
        'bridge-templates/template-channels.json',
      ],
    });
    const imported = snapshot(path.join(service, '.cg-runtime'));
    expect(imported['bridge-stack.json']).toBe('{"items":[]}');
    expect(imported).not.toHaveProperty('bridge-session.json');
    expect(imported).not.toHaveProperty('bridge-playout.json');
    expect(imported).not.toHaveProperty('bridge-connection.json');
    // The source is exactly as it was.
    expect(snapshot(newer)).toEqual(before);
    // The marker names what was, and what was not, imported.
    const marker = JSON.parse(imported[IMPORT_MARKER] ?? '{}') as Record<string, unknown>;
    expect(marker).toMatchObject({ outcome: 'imported', from: newer, notImported: [older] });
  });

  it('ONCE: a second run finds the marker and copies nothing — even after the stores change', () => {
    const users = scratch();
    userState(users, 'operator', { 'bridge-stack.json': '{"v":1}' }, 1_700_000_000_000);
    const service = scratch();
    expect(importStateOnce(service, findPerUserStates(users)).kind).toBe('imported');
    fs.rmSync(path.join(service, '.cg-runtime', 'bridge-stack.json'));
    expect(importStateOnce(service, findPerUserStates(users)).kind).toBe('already');
    expect(fs.existsSync(path.join(service, '.cg-runtime', 'bridge-stack.json'))).toBe(false);
  });

  it('a service that already holds stores is NEVER overwritten — and is not asked again', () => {
    const users = scratch();
    userState(users, 'operator', { 'bridge-stack.json': '{"old":true}' }, 1_700_000_000_000);
    const service = scratch();
    fs.mkdirSync(path.join(service, '.cg-runtime'), { recursive: true });
    fs.writeFileSync(path.join(service, '.cg-runtime', 'bridge-stack.json'), '{"service":true}');
    expect(importStateOnce(service, findPerUserStates(users))).toEqual({ kind: 'not-empty' });
    expect(fs.readFileSync(path.join(service, '.cg-runtime', 'bridge-stack.json'), 'utf8')).toBe(
      '{"service":true}',
    );
    expect(fs.existsSync(path.join(service, '.cg-runtime', IMPORT_MARKER))).toBe(true);
  });

  it('no older state anywhere: nothing to import, said once', () => {
    const service = scratch();
    expect(importStateOnce(service, findPerUserStates(scratch()))).toEqual({ kind: 'none' });
    expect(findPerUserStates(path.join(scratch(), 'missing'))).toEqual([]);
  });
});
