import { describe, expect, it } from 'vitest';
import type { FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import {
  auditTimeParts,
  placeName,
  shortId,
  templateName,
} from '../src/renderer/features/audit/auditFormat.js';

/**
 * `B-210` / `B-211` — the audit row's READING, pinned on the incident's own values.
 *
 * The record's last entry on 2026-09-04 was stamped `12:18:47.561Z`; the control room is
 * at UTC+3:30 and the clock on the wall said 15:48:47. A panel showing the first string
 * to an operator asking "what went out at quarter to four?" is three and a half hours
 * wrong and looks exactly right.
 */
describe('auditTimeParts', () => {
  it('renders the incident stamp as the control room clock, to the second', () => {
    expect(auditTimeParts('2026-09-04T12:18:47.561Z', 'Asia/Tehran')).toEqual({
      date: '2026-09-04',
      time: '15:48:47',
      utc: '2026-09-04T12:18:47.561Z',
    });
  });

  it('crosses the date line in the display zone, not in UTC', () => {
    // 21:30Z on the 4th is 01:00 on the 5th in Tehran — the DATE the operator saw.
    expect(auditTimeParts('2026-09-04T21:30:00.000Z', 'Asia/Tehran')).toMatchObject({
      date: '2026-09-05',
      time: '01:00:00',
    });
  });

  it('is 24-hour — never "03:48 PM" in a broadcast log', () => {
    expect(auditTimeParts('2026-09-04T12:18:47.561Z', 'Asia/Tehran').time).toBe('15:48:47');
    expect(auditTimeParts('2026-09-04T20:30:00.000Z', 'UTC').time).toBe('20:30:00');
  });

  it('keeps the record’s own stamp untouched beside the reading', () => {
    const ts = '2026-09-04T12:18:47.561Z';
    expect(auditTimeParts(ts, 'UTC').utc).toBe(ts);
  });

  it('never rewrites a stamp it cannot parse — the record is shown as it is', () => {
    expect(auditTimeParts('not-a-date', 'UTC')).toEqual({
      date: '',
      time: 'not-a-date',
      utc: 'not-a-date',
    });
  });
});

describe('shortId', () => {
  it('keeps the kind prefix and the first eight characters of a UUID, with an ellipsis', () => {
    expect(shortId('item-e602d912-5d9a-443d-b79e-a4d392f274a9')).toBe('item-e602d912…');
    expect(shortId('f00a5363-15d7-4bc1-bf31-6f6b006f75c8')).toBe('f00a5363…');
  });

  it('leaves a short, readable id alone', () => {
    expect(shortId('tpl-e2e-1')).toBe('tpl-e2e-1');
    expect(shortId('lower-third')).toBe('lower-third');
  });
});

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '99': 'لوگوی اصلی' },
  low: { start: 1, count: 9 },
};

describe('placeName', () => {
  it('names a bank layer as the operator’s row — alias first, else the default', () => {
    expect(placeName({ channel: 1, layer: 99, server: 'primary' }, BANK)).toBe('لوگوی اصلی');
    expect(placeName({ channel: 1, layer: 90, server: 'primary' }, BANK)).toBe('Layer 10');
    expect(placeName({ channel: 1, layer: 9, server: 'primary' }, BANK)).toBe('Bed 1');
  });

  it('says out loud when a layer is NOT one of the station’s rows', () => {
    // The two items of 2026-09-04 sat on 60 and 61 — outside both halves of the bank.
    expect(placeName({ channel: 1, layer: 60, server: 'primary' }, BANK)).toBe(
      'layer 60 (not a row)',
    );
    expect(placeName({ channel: 2, layer: 60, server: 'primary' }, BANK)).toBe(
      'layer 2-60 (not a row)',
    );
  });

  it('with no bank declared, every layer is named as CasparCG names it', () => {
    expect(placeName({ channel: 1, layer: 99, server: 'primary' }, null)).toBe(
      'layer 1-99 (not a row)',
    );
  });

  it('is null for an entry that names no layer (an import, a lock)', () => {
    expect(placeName(undefined, BANK)).toBeNull();
  });
});

describe('templateName', () => {
  const info: TemplateInfo = {
    templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
    name: 'comp1',
    sourceFileName: '3ghab.vcg',
    templateType: 'custom',
    fields: [],
  };
  it('resolves through the ONE display rule (file name outranks the manifest name)', () => {
    expect(templateName(info.templateId, new Map([[info.templateId, info]]))).toBe('3ghab');
  });
  it('is null when the registry no longer holds the template', () => {
    expect(templateName('gone', new Map())).toBeNull();
    expect(templateName(undefined, new Map())).toBeNull();
  });
});
