import { describe, expect, it } from 'vitest';
import {
  cleanFileName,
  commandForDisplay,
  displayLabel,
  placeName,
  producerForDisplay,
  templateDisplayName,
  timingClause,
  type FixedLayerBank,
} from '../src/index.js';

/**
 * `CONSOLE-POLISH-01` (`R-083`) — the words a row shows, in their new home. They moved here from the
 * console's renderer UNCHANGED so CG Bridge can word an audit row as the console does; the console's
 * own tests of them still run through its re-exports. These pin each rule where it now lives.
 */

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '98': 'زیرنویس اصلی' },
  low: { start: 50, count: 9 },
};

describe('a template’s name', () => {
  it('the file the operator chose, cleaned — case and Persian kept, never the id', () => {
    expect(cleanFileName('news-lower_third.vcg')).toBe('news lower third');
    expect(cleanFileName(' زیرنویس-خبر.VCG ')).toBe('زیرنویس خبر');
    expect(cleanFileName('   .vcg')).toBeUndefined();
    expect(cleanFileName(undefined)).toBeUndefined();
    expect(displayLabel({ name: 'Comp 1', sourceFileName: '3ghab.vcg' })).toBe('3ghab');
    expect(displayLabel({ name: '  Logo  ' })).toBe('Logo');
    expect(displayLabel({ name: '   ' })).toBeUndefined();
    expect(templateDisplayName({})).toBe('Unnamed template');
    expect(templateDisplayName({ sourceFileName: 'a_b.vcg' })).toBe('a b');
  });
});

describe('a layer’s name', () => {
  it('the row’s alias, else its default; outside the bank, CasparCG’s name and that it is no row', () => {
    expect(placeName({ channel: 1, layer: 98 }, BANK)).toBe('زیرنویس اصلی');
    expect(placeName({ channel: 1, layer: 58 }, BANK)).toBe('Bed 58');
    expect(placeName({ channel: 1, layer: 60 }, BANK)).toBe('layer 60 (not a row)');
    // Another channel's layer, or more than one bank: the channel is named.
    expect(placeName({ channel: 2, layer: 60 }, BANK)).toBe('layer 2-60 (not a row)');
    expect(placeName({ channel: 1, layer: 60 }, [BANK, { ...BANK, channel: 2 }])).toBe(
      'layer 1-60 (not a row)',
    );
    expect(placeName(undefined, BANK)).toBeNull();
  });
});

describe('a refused line and a producer, as a surface may print them', () => {
  it('a stream’s address reads `stream`; a route and a page URL are left as they are', () => {
    expect(commandForDisplay('PLAY 1-60 "rtmp://***@cam.local/live" LOOP')).toBe(
      'PLAY 1-60 "stream" LOOP',
    );
    expect(commandForDisplay('PLAY 1-60 "route://2"')).toBe('PLAY 1-60 "route://2"');
    expect(commandForDisplay('CG 1-98 ADD 0 "http://192.0.2.9:4000/template/x" 0')).toBe(
      'CG 1-98 ADD 0 "http://192.0.2.9:4000/template/x" 0',
    );
    expect(producerForDisplay('"srt://cam:9000"')).toBe('stream');
  });
});

describe('a pass-timing row’s value', () => {
  it('`until stop` and a count — `0` survives — and the gap; nothing to say is `null`', () => {
    expect(timingClause({ passes: 'infinite' })).toBe('until stop');
    expect(timingClause({ passes: 0, delayMs: 1500 })).toBe('0 passes · gap 1.5 s');
    expect(timingClause({})).toBeNull();
    expect(timingClause(undefined)).toBeNull();
  });
});
