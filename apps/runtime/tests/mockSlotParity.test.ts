import { describe, expect, it } from 'vitest';
import { StackItemStateSchema } from '@cg/shared-schema';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §1.3 — **THE OFFLINE MOCK'S ITEMS CARRY THEIR SLOT** (`R-062`'s fourth
 * finding).
 *
 * `MockRuntime.load()` wrote no `item.slot` and keyed its bindings by LAYER alone, so the app's own
 * mock could not express two rows on two channels. The bridge publishes `StackItemState.slot` for
 * every item bound to a coordinate, and the console's per-channel views filter on it; a mock
 * without it would leave every channel-scoped surface unprovable offline.
 */

const BANK = { channel: 1, low: { start: 50, count: 10 }, start: 80, count: 20 };

async function bridgeWithBank(): Promise<{
  bridge: ReturnType<typeof createMockBridge>;
  templateId: string;
}> {
  const bridge = createMockBridge();
  await bridge.fixedLayers.setConfig(BANK);
  const [template] = await bridge.templates.list();
  if (template === undefined) throw new Error('the mock seeds at least one template');
  return { bridge, templateId: template.templateId };
}

describe('§1.3 — a row-bound item publishes its slot, exactly as the bridge does', () => {
  it('an exact-slot load publishes `{ channel, layer, server }` — control: a dynamic load publishes none', async () => {
    const { bridge, templateId } = await bridgeWithBank();
    expect(
      (
        await bridge.fixedLayers.load({
          channel: 1,
          layer: 97,
          itemId: 'item-row',
          templateId,
          fields: {},
        })
      ).accepted,
    ).toBe(true);
    await bridge.stack.load({ itemId: 'item-dynamic', templateId, fields: {} });

    const snapshot = await bridge.stack.snapshot();
    const row = snapshot.find((i) => i.itemId === 'item-row');
    // Present first, then its value: a schema that dropped `slot` would satisfy a bare `not.toBe`.
    expect(row?.slot, 'the bound item carries a slot at all').toBeDefined();
    expect(row?.slot).toEqual({ channel: 1, layer: 97, server: 'primary' });
    expect(StackItemStateSchema.parse(row).slot?.channel).toBe(1);
    // CONTROL — the same mock, the same template, no row: no slot, as on air.
    const dynamic = snapshot.find((i) => i.itemId === 'item-dynamic');
    expect(dynamic, 'the dynamic item is on the stack').toBeDefined();
    expect(dynamic?.slot).toBeUndefined();
  });

  it('the slot rides the published state too, and leaves with the binding', async () => {
    const { bridge, templateId } = await bridgeWithBank();
    const published: (readonly { itemId: string; slot?: unknown }[])[] = [];
    bridge.stack.onStateChanged((items) => published.push(items));
    await bridge.fixedLayers.load({
      channel: 1,
      layer: 96,
      itemId: 'item-a',
      templateId,
      fields: {},
    });
    expect(published.at(-1)?.find((i) => i.itemId === 'item-a')?.slot).toEqual({
      channel: 1,
      layer: 96,
      server: 'primary',
    });

    // A bank-layer CLEAR destroys the binding; the item stays and is no longer on that layer.
    expect((await bridge.fixedLayers.clearLayer({ channel: 1, layer: 96 })).ok).toBe(true);
    const after = (await bridge.stack.snapshot()).find((i) => i.itemId === 'item-a');
    expect(after, 'the item is still on the stack').toBeDefined();
    expect(after?.slot).toBeUndefined();
  });

  it('the audit record and the published item name the SAME coordinate', async () => {
    const { bridge, templateId } = await bridgeWithBank();
    await bridge.fixedLayers.load({
      channel: 1,
      layer: 95,
      itemId: 'item-b',
      templateId,
      fields: {},
    });
    const published = (await bridge.stack.snapshot()).find((i) => i.itemId === 'item-b')?.slot;
    const audited = (await bridge.audit.recent({ limit: 5 })).find(
      (e) => e.itemId === 'item-b',
    )?.slot;
    expect(published, 'the item carries a slot').toBeDefined();
    // One source for "which layer is this item on": the binding. Two readings cannot differ.
    expect(audited).toEqual(published);
  });
});
