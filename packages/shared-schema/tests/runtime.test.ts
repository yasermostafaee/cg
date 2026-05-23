import { describe, expect, it } from 'vitest';
import {
  AmcpAckSchema,
  AuditEntrySchema,
  EffectSchema,
  IntentSchema,
  JournalRecordSchema,
  LayerSlotSchema,
  OscEventSchema,
  StackItemStateSchema,
} from '../src/runtime/index.js';

const sha = 'b'.repeat(64);
const slot = { channel: 1, layer: 20, server: 'primary' as const };

describe('LayerSlot', () => {
  it('accepts a slot', () => {
    expect(LayerSlotSchema.parse(slot)).toEqual(slot);
  });
});

describe('Intent variants', () => {
  it('load', () => {
    expect(
      IntentSchema.parse({
        kind: 'load',
        itemId: 'i1',
        templateId: 't1',
        fields: { headline: 'x' },
      }),
    ).toBeTruthy();
  });
  it('take with mode', () => {
    expect(IntentSchema.parse({ kind: 'take', itemId: 'i1', mode: 'pvw-pgm' })).toBeTruthy();
  });
  it('update merge', () => {
    expect(
      IntentSchema.parse({
        kind: 'update',
        itemId: 'i1',
        fields: { headline: 'y' },
        mergeMode: 'merge',
      }),
    ).toBeTruthy();
  });
  it('out immediate', () => {
    expect(IntentSchema.parse({ kind: 'out', itemId: 'i1', immediate: true })).toBeTruthy();
  });
  it('remove', () => {
    expect(IntentSchema.parse({ kind: 'remove', itemId: 'i1' })).toBeTruthy();
  });
  it('failover', () => {
    expect(IntentSchema.parse({ kind: 'failover', reason: 'auto' })).toBeTruthy();
  });
  it('reconnect', () => {
    expect(IntentSchema.parse({ kind: 'reconnect' })).toBeTruthy();
  });
});

describe('AmcpAck', () => {
  it('ok 202', () => {
    expect(
      AmcpAckSchema.parse({ kind: 'amcp.ok', seq: 1, code: 202, raw: '202 PLAY OK', ms: 12 }),
    ).toBeTruthy();
  });
  it('err', () => {
    expect(
      AmcpAckSchema.parse({ kind: 'amcp.err', seq: 1, code: 500, raw: '500 ...', ms: 3 }),
    ).toBeTruthy();
  });
  it('timeout', () => {
    expect(AmcpAckSchema.parse({ kind: 'amcp.timeout', seq: 1 })).toBeTruthy();
  });
});

describe('OscEvent variants', () => {
  it('layer.foreground', () => {
    expect(
      OscEventSchema.parse({
        kind: 'osc.layer.foreground',
        channel: 1,
        layer: 20,
        file: 'index.html',
      }),
    ).toBeTruthy();
  });
  it('layer.empty', () => {
    expect(OscEventSchema.parse({ kind: 'osc.layer.empty', channel: 1, layer: 20 })).toBeTruthy();
  });
  it('cg.invoked', () => {
    expect(
      OscEventSchema.parse({ kind: 'osc.cg.invoked', channel: 1, layer: 20, method: 'play' }),
    ).toBeTruthy();
  });
  it('health', () => {
    expect(
      OscEventSchema.parse({
        kind: 'osc.health',
        server: 'primary',
        healthy: true,
        uptimeSec: 60,
      }),
    ).toBeTruthy();
  });
});

describe('Effect variants', () => {
  it('amcp.send', () => {
    expect(
      EffectSchema.parse({
        kind: 'amcp.send',
        target: 'both',
        line: 'PLAY 1-20 [HTML] "..."',
        seq: 7,
        expectAck: true,
      }),
    ).toBeTruthy();
  });
  it('ui.notify', () => {
    expect(
      EffectSchema.parse({ kind: 'ui.notify', severity: 'warn', message: 'taken too long' }),
    ).toBeTruthy();
  });
  it('reconciler.requestResync', () => {
    expect(EffectSchema.parse({ kind: 'reconciler.requestResync' })).toBeTruthy();
  });
});

describe('AuditEntry', () => {
  it('accepts a successful take', () => {
    const e = {
      ts: '2026-05-19T18:42:11.412Z',
      actor: 'local',
      action: 'take' as const,
      itemId: 'i1',
      templateId: 't1',
      templateHash: sha,
      dataHash: sha,
      server: 'primary' as const,
      slot,
      ackMs: 14,
      oscConfirmMs: 88,
      outcome: 'ok' as const,
    };
    expect(AuditEntrySchema.parse(e)).toEqual(e);
  });
});

describe('JournalRecord variants', () => {
  it('intent', () => {
    expect(
      JournalRecordSchema.parse({
        kind: 'intent',
        seq: 1,
        ts: '2026-05-19T18:00:00.000Z',
        intent: { kind: 'reconnect' },
      }),
    ).toBeTruthy();
  });
  it('snapshot', () => {
    expect(
      JournalRecordSchema.parse({
        kind: 'snapshot',
        seq: 100,
        ts: '2026-05-19T18:00:00.000Z',
        state: {},
      }),
    ).toBeTruthy();
  });
});

describe('StackItemState', () => {
  it('accepts an on-air item', () => {
    const s = {
      itemId: 'i1',
      templateId: 't1',
      fields: { headline: 'live' },
      status: 'on-air' as const,
      pending: false,
      slot,
    };
    expect(StackItemStateSchema.parse(s)).toEqual(s);
  });
});
