import { describe, expect, it } from 'vitest';
import {
  FixedLayerBankSchema,
  FixedLayersSetConfigChannel,
  FixedSlotStateSchema,
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

const BANK = { channel: 1, start: 70, count: 10, aliases: { '72': 'ساعت' } };

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
    expect(state).toHaveLength(10);
    expect(state.every((s) => s.observed.kind === 'unknown')).toBe(true); // offline honesty
    expect(state.every((s) => s.binding === null)).toBe(true);
    expect(state.find((s) => s.layer === 72)?.alias).toBe('ساعت');
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
    expect(z.array(FixedSlotStateSchema).parse(states[0])).toHaveLength(10);
  });
});
