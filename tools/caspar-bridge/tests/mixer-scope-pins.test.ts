import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CommandBuilder } from '../src/command-builder.js';

/**
 * 🔴 `LOOK-SWITCH-01` §0.4 — **TWO THINGS THE BRIDGE ALREADY NEVER SENDS, PINNED SO IT STAYS THAT WAY.**
 *
 * The Playout's core team (`docs/integration/playout/PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §3.2) and the
 * stock 2.5.0 source agree on both:
 *
 * - **A channel-wide `MIXER <ch> CLEAR`** resets EVERY layer's transform — opacity and volume to 1 —
 *   so it would reveal and un-mute every seated, hidden plate on the next tick, and it wipes the
 *   Playout's own layer gain. It is not sent anywhere today; the one `MIXER … CLEAR` the bridge
 *   builds is layer-scoped (`CommandBuilder.mixerClear`, `MIXER <ch>-<layer> CLEAR`).
 * - **AMCP `BEGIN … COMMIT`** is NOT same-frame on this core: it feeds its commands to the channel one
 *   at a time and a tick can fall between them. Our `DEFER`s and their `MIXER <ch> COMMIT` must go
 *   out back to back OUTSIDE any such batch — and the bridge has never used one.
 *
 * ⚠ A SOURCE SCAN, deliberately: an absence on the wire can only be shown for the paths a test
 * drives, and these two must hold on every path. Each scan's positive control proves the instrument
 * reads the file it claims to: the layer-scoped `mixerClear` IS found, and the `COMMIT` keyword IS.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Every source line with its comments removed, as `file: text`. Block comments go first — this
 * codebase writes long un-starred prose inside `/* … *\/`, which names `MIXER CLEAR` freely.
 */
function codeLines(): string[] {
  return sourceFiles(SRC).flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/(^|\s)\/\/.*$/, '').trim())
      .filter((line) => line.length > 0)
      .map((line) => `${path.basename(file)}: ${line}`),
  );
}

describe('no channel-wide MIXER CLEAR', () => {
  it('the ONLY code building a `MIXER … CLEAR` line is the layer-scoped `mixerClear`', () => {
    const lines = codeLines();
    expect(lines.length, 'CONTROL — the scan read the bridge source').toBeGreaterThan(1000);
    // Inside a string or template literal: the text that becomes a wire line.
    const clears = lines.filter((line) => /['"`][^'"`]*MIXER[^'"`]*CLEAR/.test(line));
    expect(clears).toEqual(['command-builder.ts: return `MIXER ${target(slot)} CLEAR`;']);
  });

  it('and what it builds names a layer — control: our layer-scoped clear still goes out', () => {
    const builder = new CommandBuilder();
    expect(builder.mixerClear({ channel: 1, layer: 80 })).toBe('MIXER 1-80 CLEAR');
    expect(builder.mixerClear({ channel: 2, layer: 60 })).toMatch(/^MIXER \d+-\d+ CLEAR$/);
  });
});

describe('no AMCP BEGIN … COMMIT batch', () => {
  it('no code sends `BEGIN` or `DISCARD` — control: the scan does see the `MIXER <ch> COMMIT` it builds', () => {
    const lines = codeLines();
    const commit = lines.filter((line) => /['"`]MIXER \$\{[^}]+\} COMMIT['"`]/.test(line));
    expect(commit, 'CONTROL — the instrument sees an AMCP keyword in a literal').toHaveLength(1);
    const batch = lines.filter((line) => /['"`](BEGIN|DISCARD)\b/.test(line));
    expect(batch).toEqual([]);
  });
});
