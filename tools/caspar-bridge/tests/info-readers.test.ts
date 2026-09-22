import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/command-builder.js';

/**
 * 🔴 `BRIDGE-TRUTH-01` §3 — **TWO WAYS OF MISREADING `INFO`, pinned in this package's source.**
 *
 *   1. `INFO <ch>-<layer>` — the layer argument is accepted and IGNORED; the reply is the whole
 *      channel. The bridge builds `INFO` only through `CommandBuilder.info(channel)`, whose type
 *      cannot carry a layer.
 *   2. `INFO`'s `<volume>` nodes — the OUTPUT BUS's meters, not layer volumes. No reader here
 *      parses them; a layer's volume is read with `MIXER <ch>-<layer> VOLUME`.
 *
 * The third — tolerating the fork's additions under `<mixer><audio>` — is in `@cg/shared-ipc`,
 * which owns the parsers.
 *
 * ⚠ The scan is THIS PACKAGE's `src/` only: a test that read files outside its package would
 * sit outside its turbo `inputs` and go silent under a cache hit.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function sources(): { file: string; text: string }[] {
  return fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(SRC, f), 'utf8') }));
}

/**
 * An `INFO` command spelled as wire text — `INFO` then a channel number or an interpolation.
 * A doc comment's `INFO <channel>` is prose about the verb, not a command, and is not a hit.
 */
const INFO_WIRE_TEXT = /[`'"]INFO (\d|\$\{)/;
/** A pattern that would parse a `<volume>` node — a regex literal or a `RegExp(...)`. */
const VOLUME_PARSER = /\/<volume|RegExp\([^)]*volume/;

describe('§3.1 — INFO is addressed by channel, never by layer', () => {
  it('the builder spells the channel form, and only it', () => {
    expect(new CommandBuilder().info(4)).toBe('INFO 4');
  });

  it('no bridge source builds INFO wire text outside the builder', () => {
    // Positive control — the pattern finds the two spellings the bridge used before this fix.
    expect(INFO_WIRE_TEXT.test('await send(`INFO ${String(channel)}`)')).toBe(true);
    expect(INFO_WIRE_TEXT.test("send('INFO 1-10')")).toBe(true);
    expect(INFO_WIRE_TEXT.test(' * `INFO <channel>` reports RUNNING')).toBe(false);
    const files = sources();
    expect(files.length).toBeGreaterThan(10); // the scan read the package, not nothing
    const offenders = files
      .filter((s) => s.file !== 'command-builder.ts')
      .flatMap((s) =>
        s.text
          .split('\n')
          .filter((l) => INFO_WIRE_TEXT.test(l))
          .map((l) => `${s.file}: ${l.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe('§3.2 — no reader takes a layer volume from INFO', () => {
  it('no bridge source parses a <volume> node', () => {
    // Positive control — the pattern finds a parser of the shape this rule forbids.
    expect(VOLUME_PARSER.test('const v = /<volume>([^<]*)<\\/volume>/.exec(xml);')).toBe(true);
    const offenders = sources().flatMap((s) =>
      s.text
        .split('\n')
        .filter((l) => VOLUME_PARSER.test(l))
        .map((l) => `${s.file}: ${l.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
