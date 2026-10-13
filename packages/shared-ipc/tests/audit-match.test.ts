import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import {
  AuditFilterSchema,
  AuditPageChannel,
  auditChannelOf,
  auditMatches,
  auditShownWords,
  type AuditNaming,
  type FixedLayerBank,
} from '../src/index.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **ONE PREDICATE FOR WHICH AUDIT ROWS A FILTER KEEPS.** CG Bridge
 * asks it before it cuts a page; the console asks it of a row pushed while the Log is open. Its
 * search reads what a row SHOWS — never a field the row keeps to itself.
 */

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '98': 'زیرنویس اصلی' },
  low: { start: 50, count: 9 },
};
const NAMING: AuditNaming = {
  bank: BANK,
  templateLabel: (id) => (id === 'tpl-3' ? '3ghab' : null),
};

const TAKE: AuditEntry = {
  ts: '2026-10-03T09:00:00.000Z',
  actor: 'سارا',
  action: 'take',
  itemId: 'item-1',
  templateId: 'tpl-3',
  slot: { channel: 1, layer: 98, server: 'primary' },
  outcome: 'failed',
  errorCode: 'amcp-404',
  command: 'PLAY 1-60 "rtmp://cam.local/live"',
  timing: { passes: 'infinite' },
};
const REFUSED: AuditEntry = {
  ts: '2026-10-03T09:00:01.000Z',
  actor: 'Reza',
  action: 'refused',
  outcome: 'failed',
  refused: { channel: 'stack.take', casparChannel: 2 },
};
const IMPORT: AuditEntry = {
  ts: '2026-10-03T09:00:02.000Z',
  actor: 'console',
  action: 'import',
  templateId: 'tpl-9',
  outcome: 'ok',
};

describe('the channel a row is about', () => {
  it('its layer’s, else the one a refusal was about, else none', () => {
    expect(auditChannelOf(TAKE)).toBe(1);
    expect(auditChannelOf(REFUSED)).toBe(2);
    expect(auditChannelOf(IMPORT)).toBeUndefined();
  });
});

describe('auditMatches', () => {
  it('no filter keeps every row', () => {
    for (const e of [TAKE, REFUSED, IMPORT]) expect(auditMatches(e, {}, NAMING)).toBe(true);
  });

  it('each stated field must hold — channel, actor (exact), action, result', () => {
    expect(auditMatches(TAKE, { channel: 1 }, NAMING)).toBe(true);
    expect(auditMatches(REFUSED, { channel: 1 }, NAMING)).toBe(false);
    expect(
      auditMatches(IMPORT, { channel: 1 }, NAMING),
      'a row on no channel is no channel’s',
    ).toBe(false);
    expect(auditMatches(TAKE, { actor: 'سارا' }, NAMING)).toBe(true);
    expect(auditMatches(TAKE, { actor: 'سار' }, NAMING), 'exact, as the record writes it').toBe(
      false,
    );
    expect(auditMatches(TAKE, { action: 'take', outcome: 'failed' }, NAMING)).toBe(true);
    expect(auditMatches(TAKE, { action: 'take', outcome: 'ok' }, NAMING)).toBe(false);
  });

  it('🔴 the search reads what the row SHOWS: its row’s and template’s names, the code, the shown line, the timing', () => {
    const hit = (search: string): boolean => auditMatches(TAKE, { search }, NAMING);
    expect(hit('زیرنویس'), 'the row’s alias').toBe(true);
    expect(hit('3GHAB'), 'the template’s name, case-folded').toBe(true);
    expect(hit('amcp-404')).toBe(true);
    expect(hit('until stop')).toBe(true);
    expect(hit('"stream"'), 'the refused line as it is shown').toBe(true);
    // The stream's address is NOT on the row, so it is no hit.
    expect(hit('cam.local')).toBe(false);
    expect(hit('   ')).toBe(true);
    expect(auditShownWords(IMPORT, NAMING)).toEqual(['console', 'import', 'ok', 'tpl-9']);
  });
});

describe('the wire', () => {
  it('a page request and answer parse; a filter is bounded', () => {
    expect(
      AuditPageChannel.request.safeParse({
        cursor: { file: '2026-10-03T09-00-00.000Z', before: 4096 },
        filter: { channel: 1, search: 'x' },
      }).success,
    ).toBe(true);
    expect(AuditPageChannel.response.safeParse({ entries: [TAKE], next: null }).success).toBe(true);
    expect(AuditFilterSchema.safeParse({ search: '' }).success).toBe(false);
    expect(AuditFilterSchema.safeParse({ channel: 0 }).success).toBe(false);
  });
});
