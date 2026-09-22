import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRunningConsumersFromInfo, parseVideoModeFromInfo } from '../src/index.js';

/**
 * 🔴 `BRIDGE-TRUTH-01` §3.3 — **OUR `INFO` PARSERS TOLERATE NODES THEY DO NOT KNOW.**
 *
 * The Playout team's fork adds, under `<mixer><audio>`, `<limiter><gr>…</gr></limiter>` and
 * `<lufs><momentary>…</momentary><shortterm>…</shortterm></lufs>` from their loudness work —
 * additive, nothing stock removed or renamed. Checked by READING the parsers (both are targeted
 * extractions of one leaf or one block) and pinned here rather than hoped.
 *
 * ⚠ The stock `<volume>` nodes are in both replies below ON PURPOSE: they are the output bus's
 * meters, and nothing either parser returns may be one of them (§3.2).
 */

const stock = (audio: string): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<channel>',
    '   <format>1080i5000</format>',
    '   <framerate>50</framerate>',
    '   <mixer>',
    '      <audio>',
    '         <volume>0.25</volume>',
    '         <volume>0.25</volume>',
    audio,
    '      </audio>',
    '   </mixer>',
    '   <output>',
    '      <port>',
    '         <port_500>',
    '            <consumer>system-audio</consumer>',
    '         </port_500>',
    '         <port_600>',
    '            <consumer>screen</consumer>',
    '         </port_600>',
    '      </port>',
    '   </output>',
    '</channel>',
    '',
  ].join('\n');

const FORK_ADDITIONS = [
  '         <limiter><gr>-3.5</gr></limiter>',
  '         <lufs><momentary>-23.1</momentary><shortterm>-22.8</shortterm></lufs>',
].join('\n');

describe('INFO <channel> — the fork’s additive <mixer><audio> nodes', () => {
  it('the mode and the running consumers read the same with and without them', () => {
    const plain = stock('');
    const fork = stock(FORK_ADDITIONS);
    // Positive control — the stock reply parses, so equality below is not two nulls agreeing.
    expect(parseVideoModeFromInfo(plain)).toBe('1080i5000');
    expect(parseRunningConsumersFromInfo(plain)).toEqual([
      { port: 500, kind: 'system-audio' },
      { port: 600, kind: 'screen' },
    ]);
    expect(parseVideoModeFromInfo(fork)).toBe(parseVideoModeFromInfo(plain));
    expect(parseRunningConsumersFromInfo(fork)).toEqual(parseRunningConsumersFromInfo(plain));
  });

  it('no parser in this package reads a <volume> node', () => {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/channels');
    const pattern = /\/<volume|RegExp\([^)]*volume/;
    // Positive control — the pattern finds the shape it forbids.
    expect(pattern.test('/<volume>([^<]*)<\\/volume>/.exec(xml)')).toBe(true);
    const files = fs.readdirSync(src).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => pattern.test(fs.readFileSync(path.join(src, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
