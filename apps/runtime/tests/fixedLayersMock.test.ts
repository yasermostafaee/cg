import { describe, expect, it } from 'vitest';
import {
  FixedLayerBankSchema,
  FixedLayersSetConfigChannel,
  FixedSlotStateSchema,
  fixedBankSlots,
} from '@cg/shared-ipc';
import { z } from 'zod';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';

/**
 * R-021 stage 2a (S12) — MockRuntime parity: the mock answers all five
 * fixed-bank channels with SCHEMA-VALID shapes. Fidelity mirrors
 * `connections.set-config`'s: the mock applies and publishes without
 * re-implementing the bridge's validators (the bridge is the authority; the
 * mock is explicit test mode), and offline occupancy is honestly UNKNOWN for
 * every slot — never 'empty' (B-094).
 */

const BANK = {
  channel: 1,
  low: { start: 1, count: 9 },
  start: 70,
  count: 10,
  aliases: { '72': 'ساعت' },
};

describe('MockRuntime fixed-bank parity (S12)', () => {
  it('config: null before any bank; the applied bank after; schema-valid both ways', async () => {
    const bridge = createMockBridge();
    expect(await bridge.fixedLayers.config()).toBeNull();

    const result = await bridge.fixedLayers.setConfig(BANK);
    expect(FixedLayersSetConfigChannel.response.parse(result).ok).toBe(true);

    const config = await bridge.fixedLayers.config();
    expect(FixedLayerBankSchema.parse(config)).toEqual(BANK);
  });

  it('state: [] with no bank; schema-valid all-unknown slots with one', async () => {
    const bridge = createMockBridge();
    expect(await bridge.fixedLayers.state()).toEqual([]);

    await bridge.fixedLayers.setConfig(BANK);
    const state = z.array(FixedSlotStateSchema).parse(await bridge.fixedLayers.state());
    /*
      🔴 `B-201` — THE UNION, and asserted by DERIVING it rather than by a number.

      This read `toHaveLength(10)`: the operator half of a bank that also declares nine bed
      rows. It was written before the beds existed and stayed true afterwards only because
      the mock had the same blind spot — a PARITY test agreeing with the thing it was meant
      to hold to account. `fixedBankSlots` is what the bridge fences its LayerManager with,
      so comparing against it is the parity claim itself; a literal is a restatement, and a
      restatement is what put both sides in this state.
    */
    expect(state).toHaveLength(fixedBankSlots(FixedLayerBankSchema.parse(BANK)).length);
    expect(state.map((s) => s.layer).sort((a, b) => a - b)).toEqual(
      fixedBankSlots(FixedLayerBankSchema.parse(BANK))
        .map((s) => s.layer)
        .sort((a, b) => a - b),
    );
    expect(state.every((s) => s.observed.kind === 'unknown')).toBe(true); // offline honesty
    expect(state.every((s) => s.binding === null)).toBe(true);
    expect(state.find((s) => s.layer === 72)?.alias).toBe('ساعت');
  });

  it('stage 3 — an exact-slot load binds THAT slot, and only that slot', async () => {
    const bridge = createMockBridge();
    await bridge.fixedLayers.setConfig(BANK);
    const [template] = await bridge.templates.list();
    expect(template).not.toBeUndefined();
    if (template === undefined) return;

    const res = await bridge.fixedLayers.load({
      channel: 1,
      layer: 72,
      itemId: 'item-fixed-1',
      templateId: template.templateId,
      fields: {},
    });
    expect(res.accepted).toBe(true);

    const state = z.array(FixedSlotStateSchema).parse(await bridge.fixedLayers.state());
    // R-028 (3.1) — the binding carries WHICH template is on the row (id +
    // display name when it has one), the same join the bridge does.
    expect(state.find((s) => s.layer === 72)?.binding).toMatchObject({
      itemId: 'item-fixed-1',
      templateType: template.templateType,
      templateId: template.templateId,
    });
    // Every OTHER slot is untouched — the load landed on one coordinate.
    expect(state.filter((s) => s.binding !== null)).toHaveLength(1);
    // …and the item is an ORDINARY stack item, reachable the normal way.
    expect((await bridge.stack.snapshot()).some((i) => i.itemId === 'item-fixed-1')).toBe(true);
  });

  it('stage 3 — refuses a coordinate outside the bank, and a slot already bound', async () => {
    const bridge = createMockBridge();
    await bridge.fixedLayers.setConfig(BANK);
    const [template] = await bridge.templates.list();
    if (template === undefined) throw new Error('the mock seeds at least one template');
    const load = (
      layer: number,
      itemId: string,
    ): Promise<{ accepted: boolean; errorCode?: string | undefined }> =>
      bridge.fixedLayers.load({
        channel: 1,
        layer,
        itemId,
        templateId: template.templateId,
        fields: {},
      });

    // Outside the declared bank — this channel is never a door onto an arbitrary layer.
    expect(await load(10, 'item-a')).toEqual({ accepted: false, errorCode: 'not-fixed' });
    // An unregistered template registers nothing and says so.
    expect(
      await bridge.fixedLayers.load({
        channel: 1,
        layer: 73,
        itemId: 'item-b',
        templateId: 'tpl-nope',
        fields: {},
      }),
    ).toEqual({ accepted: false, errorCode: 'unknown-template' });
    // Rebinding is Remove-then-load, two explicit steps (d1) — never one.
    expect((await load(72, 'item-c')).accepted).toBe(true);
    expect(await load(72, 'item-d')).toEqual({ accepted: false, errorCode: 'slot-bound' });

    // Remove frees the slot: the fence survives, the BINDING does not.
    await bridge.stack.remove({ itemId: 'item-c' });
    const afterRemove = await bridge.fixedLayers.state();
    expect(afterRemove.find((s) => s.layer === 72)?.binding).toBeNull();
    expect((await load(72, 'item-e')).accepted).toBe(true);
  });

  it('publishes config-changed and state-changed on an applied change', async () => {
    const bridge = createMockBridge();
    const configs: unknown[] = [];
    const states: unknown[] = [];
    bridge.fixedLayers.onConfigChanged((c) => configs.push(c));
    bridge.fixedLayers.onStateChanged((s) => states.push(s));

    await bridge.fixedLayers.setConfig(BANK);
    expect(configs).toHaveLength(1);
    expect(states).toHaveLength(1);
    // `B-201` — the union again, derived (see the state test above for why not a literal).
    expect(z.array(FixedSlotStateSchema).parse(states[0])).toHaveLength(
      fixedBankSlots(FixedLayerBankSchema.parse(BANK)).length,
    );
  });
});
