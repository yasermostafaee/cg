import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  parseAdoptList,
  parseBaseline,
  serializeBaseline,
  sweptPaths,
} from '../src/untracked-sweep-decision.mjs';

/**
 * `GUARDS-18` §2 — the untracked-sweep guard's decision.
 *
 * The question it answers is narrow and the narrowness is the value: of the files this
 * commit ADDS, which were already lying there? A file this change created is not an offence,
 * and a file the owner has had sitting untracked for weeks is.
 */
const baseOf = (...paths: string[]): Set<string> => new Set(paths);
const NO_ADOPT = { all: false, paths: new Set<string>() };

describe('which staged additions were swept', () => {
  /** The three real incidents, as one test. */
  it('catches the paths this tree has actually lost, three times over', () => {
    const baseline = baseOf(
      '.codex/hooks.json',
      'AGENTS.md',
      'docs/design/station-setup-mockup.html',
      'tools/caspar-bridge/src/template-http-server.ts',
    );
    const staged = [
      'packages/shared-ipc/src/layer-bands.ts', // this change's own new file
      '.codex/hooks.json',
      'AGENTS.md',
      'docs/design/station-setup-mockup.html',
    ];
    expect(sweptPaths(staged, baseline, NO_ADOPT)).toEqual([
      '.codex/hooks.json',
      'AGENTS.md',
      'docs/design/station-setup-mockup.html',
    ]);
  });

  /**
   * 🔴 THE HALF THAT MUST NOT FIRE. A guard that refused every new file would be turned off
   * within a day, and then it would be worth nothing at all.
   */
  it('says nothing about a file this change created', () => {
    const baseline = baseOf('AGENTS.md');
    const staged = ['packages/shared-ipc/src/layer-bands.ts', 'tools/gate-hook/src/x.mjs'];
    expect(sweptPaths(staged, baseline, NO_ADOPT)).toEqual([]);
  });

  it('says nothing when the baseline is empty', () => {
    expect(sweptPaths(['a.ts', 'b.ts'], baseOf(), NO_ADOPT)).toEqual([]);
  });

  it('matches on the exact path, never a prefix', () => {
    // `docs/design` in the baseline must not condemn `docs/designer-guide/README.md`.
    const baseline = baseOf('docs/design');
    expect(sweptPaths(['docs/designer-guide/README.md'], baseline, NO_ADOPT)).toEqual([]);
  });
});

describe('the adopt escape', () => {
  it('lets a NAMED path through and keeps condemning the rest', () => {
    const baseline = baseOf('AGENTS.md', '.codex/hooks.json');
    const staged = ['AGENTS.md', '.codex/hooks.json'];
    const adopt = parseAdoptList('AGENTS.md');
    expect(sweptPaths(staged, baseline, adopt)).toEqual(['.codex/hooks.json']);
  });

  it('accepts a list, comma- or space-separated', () => {
    expect(parseAdoptList('a.md, b.md   c.md').paths).toEqual(new Set(['a.md', 'b.md', 'c.md']));
  });

  it('has a blanket form, and it is opt-in rather than the default', () => {
    expect(parseAdoptList('1').all).toBe(true);
    expect(parseAdoptList('all').all).toBe(true);
    expect(parseAdoptList('').all).toBe(false);
    expect(parseAdoptList(undefined).all).toBe(false);
    expect(sweptPaths(['AGENTS.md'], baseOf('AGENTS.md'), parseAdoptList('1'))).toEqual([]);
  });
});

describe('the baseline file', () => {
  it('round-trips, ignoring comments and blanks', () => {
    const text = serializeBaseline(new Set(['b.md', 'a.md']));
    expect(parseBaseline(text)).toEqual(new Set(['a.md', 'b.md']));
  });

  it('is sorted, so a diff of it reads', () => {
    const body = serializeBaseline(new Set(['c', 'a', 'b']))
      .split('\n')
      .filter((l: string) => l.length > 0 && !l.startsWith('#'));
    expect(body).toEqual(['a', 'b', 'c']);
  });

  it('explains itself in its own header', () => {
    expect(serializeBaseline(new Set())).toContain('GUARDS-18');
    expect(serializeBaseline(new Set())).toContain('never needs ignoring');
  });
});

/**
 * 🔴 `GUARDS-18` §2 — **THE GUARD MUST NOT BE SATISFIABLE BY `.gitignore`.**
 *
 * Ignoring a path hides it from the baseline AND from `git add -A`, so the accident becomes
 * impossible by making the file invisible — which is the opposite of the point. The owner
 * named `AGENTS.md` specifically: it is owed as a TRACKED pointer and must stay visible as
 * untracked until somebody adds it deliberately.
 *
 * This asks git itself, so silencing the guard that way reddens the suite.
 */
describe('the escape that is NOT allowed', () => {
  /**
   * ⚠ `git check-ignore` exits 1 for "NOT ignored" — which is the PASSING case here — so
   * this reads the exit STATUS rather than calling it and hoping. `execFileSync` throws on a
   * non-zero exit, and the first draft of this test failed for that reason rather than
   * because anything was ignored: the instrument, not the measurement.
   */
  const isIgnored = (relPath: string): boolean => {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    const probe = spawnSync('git', ['check-ignore', '-q', relPath], { cwd: root });
    return probe.status === 0;
  };

  it('AGENTS.md is not gitignored', () => {
    expect(isIgnored('AGENTS.md')).toBe(false);
  });

  it('the positive control: something that IS ignored reads as ignored', () => {
    // Without this, the assertion above would pass just as well against a broken probe —
    // `spawnSync` failing to launch also returns a non-zero status. A negative observation
    // needs a positive control.
    expect(isIgnored('node_modules')).toBe(true);
  });
});
