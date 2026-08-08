import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * D-137 §9 — **every production boot site NAMES its render mode.**
 *
 * Why this is a test and not a convention. `RuntimeBootOptions.mode` defaults to
 * `'output'`, and that default is deliberately the safe direction: a boot site that
 * forgets paints nothing, which cannot put colour bars on air. But a safe default is
 * a floor, not the property the design asks for — the design asks that the mode be
 * DECLARED, because _"a mode the exporters declare is auditable; a mode inferred
 * from which stylesheet won is not."_
 *
 * The failure this catches is real and quiet in the other direction too: a new
 * authoring surface that forgets `mode: 'author'` shows the author an INVISIBLE
 * element and nothing errors — the Live Source simply cannot be seen or placed, and
 * the bug reads as "the tool is broken".
 *
 * Scanned rather than exercised, because the sites are string-templated boot scripts
 * inside generated HTML (`Exporter.ts`, `exporter-single-file.ts`) that no unit test
 * can call. This is the `dynamicLoadUnreachable.test.ts` shape: assert the property
 * over the source, so a future edit cannot walk it back silently.
 */

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Every production boot site, and the mode each MUST name. */
const SITES: readonly { file: string; mode: 'author' | 'output'; why: string }[] = [
  {
    file: 'apps/designer/src/platform/preview.ts',
    mode: 'author',
    why: 'the editor canvas AND the Preview modal — both preview what the author is building',
  },
  {
    file: 'apps/designer/src/platform/Exporter.ts',
    mode: 'output',
    why: 'the .vcg package that goes on air',
  },
  {
    file: 'packages/single-file-export/src/exporter-single-file.ts',
    mode: 'output',
    why: 'the single-file HTML export',
  },
  {
    file: 'tools/template-fixtures/build.mjs',
    mode: 'output',
    why: 'a fixture package is a real on-air artifact',
  },
];

const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * Strip block and line comments before scanning.
 *
 * Not fastidiousness: `preview.ts` carries a PROSE mention of `createRuntime(newScene)`
 * inside a comment about teardown, and an unfiltered scan reports it as a boot site
 * with no mode. A test that must be taught about individual comments is a test
 * someone eventually deletes; stripping them is the property itself.
 *
 * Crude on purpose (it does not model a string literal containing `//`). It runs over
 * four known files plus a sweep, and over-stripping would show up as a MISSED call —
 * which the exact-equality sweep below turns into a failure rather than a pass.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The argument text of each `createRuntime(` / `CG.createRuntime(` call in a file. */
function bootCalls(rawSource: string): string[] {
  const source = withoutComments(rawSource);
  const out: string[] = [];
  const re = /(?:CG\.)?createRuntime\(/g;
  while (re.exec(source) !== null) {
    // Take the argument text up to the call's closing paren at depth 0 — enough to
    // see whether `mode:` is in the options object.
    let depth = 1;
    let i = re.lastIndex;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    out.push(source.slice(re.lastIndex, i - 1));
  }
  return out;
}

describe('D-137 §9 — every production boot site names its render mode', () => {
  it.each(SITES)('$file names mode: $mode ($why)', ({ file, mode }) => {
    const calls = bootCalls(read(file));
    // A site that stops calling createRuntime at all is a change this test should
    // notice, not pass silently.
    expect(calls.length, `${file} has no createRuntime call`).toBeGreaterThan(0);
    for (const args of calls) {
      expect(args, `${file}: a createRuntime call does not name its mode`).toMatch(/\bmode:/);
      expect(args, `${file}: expected mode '${mode}'`).toContain(`mode: '${mode}'`);
    }
  });

  it('no OTHER production file boots the runtime without being listed here', () => {
    // The list above is the audit. A new boot site that is not in it is exactly the
    // case this whole test exists for, so finding one is a failure, not a pass.
    const roots = ['apps/designer/src', 'apps/runtime/src', 'packages', 'tools'];
    const found: string[] = [];
    // `generated/` holds committed BUILD OUTPUT — the bundled runtime plus a copy of
    // the exporter's own emitted boot string. It mirrors a site already audited
    // above; editing it would be editing build output.
    const skip = /(^|[\\/])(node_modules|dist|tests|__tests__|generated|\.turbo)([\\/]|$)/;
    const walk = (dir: string): void => {
      const abs = path.join(repoRoot, dir);
      if (!fs.existsSync(abs)) return;
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (skip.test(rel)) continue;
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
        if (/\.test\.[cm]?tsx?$/.test(entry.name)) continue;
        // The runtime's own source DEFINES `createRuntime`; it is not a boot site.
        if (rel.includes('packages/template-runtime/src')) continue;
        if (bootCalls(fs.readFileSync(path.join(repoRoot, rel), 'utf8')).length > 0) {
          found.push(rel);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(found.sort()).toEqual(SITES.map((s) => s.file).sort());
  });
});
