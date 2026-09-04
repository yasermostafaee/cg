import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';

/**
 * `B-212` — the `in-use` refusal says WHERE each referencing item is.
 *
 * No socket: `templateRemove` is a pure read of the reconciler and the slot map, and
 * both of the loads used here touch no wire — a fixed-row LOAD is list-only, and a
 * dynamic `load()` against an unreachable server allocates its layer and stops before
 * the pre-roll. The unreachable server is the point: the second load lands on a
 * DYNAMIC layer outside the declared bank, which is exactly where the two items of
 * 2026-09-04 were.
 */

let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
});

const NOBODY: ConnectionConfig = {
  servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 1 } },
  strategy: 'mirror-sync',
  autoFailoverEnabled: false,
};
const BANK = {
  channel: 1,
  low: { start: 1, count: 9 },
  start: 70,
  count: 4,
  aliases: { '72': 'زیرنویس' },
};
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];
const TEMPLATE: TemplateInfo = { templateId: 'tpl', templateType: 'lower-third', fields: [] };

function boot(): CasparRuntime {
  const r = new CasparRuntime(NOBODY, {}, { fixedSlots: FIXED_SLOTS, fixedBank: BANK });
  runtime = r;
  r.templateImport(TEMPLATE, '<html></html>');
  return r;
}

describe('templateRemove — in-use names the places', () => {
  it('a row-bound item is named by its row, alias first', async () => {
    const r = boot();
    expect(await r.loadFixed({ channel: 1, layer: 72 }, 'i1', 'tpl', {})).toEqual({
      accepted: true,
    });
    const res = r.templateRemove('tpl');
    expect(res).toMatchObject({ ok: false, reason: 'in-use' });
    expect(res.references).toEqual([{ itemId: 'i1', slot: { channel: 1, layer: 72 } }]);
    expect(res.message).toBe(
      '1 stack item(s) still use this template — on the row “زیرنویس” (layer 72). Remove that item first.',
    );
  });

  it('a default-named row reads as the Layers table names it', async () => {
    const r = boot();
    expect(await r.loadFixed({ channel: 1, layer: 73 }, 'i1', 'tpl', {})).toEqual({
      accepted: true,
    });
    // 73 is the bank's highest operator layer — `Layer 1`.
    expect(r.templateRemove('tpl').message).toContain('on the row “Layer 1” (layer 73)');
  });

  it('an item on a DYNAMIC layer outside the bank is named as CasparCG names it, and said not to be a row', async () => {
    const r = boot();
    // The dynamic path: no server reachable ⇒ the layer is allocated (lower-third
    // range starts at 10) and nothing is pre-rolled.
    expect(await r.load('i2', 'tpl', {})).toEqual({ accepted: true });
    const res = r.templateRemove('tpl');
    const layer = res.references?.[0]?.slot?.layer;
    expect(res.references).toEqual([{ itemId: 'i2', slot: { channel: 1, layer } }]);
    // Wherever the policy put it, it is OUTSIDE both halves of the bank…
    expect(layer).toBeDefined();
    expect(layer).toBeGreaterThanOrEqual(10);
    expect(layer).toBeLessThan(70);
    // …and the sentence says so, as CasparCG names it.
    expect(res.message).toBe(
      `1 stack item(s) still use this template — on CasparCG layer ${String(layer)}, which is not one of this station's rows. Remove that item first.`,
    );
    expect(res.message).not.toMatch(/remove all/i);
  });

  it('several items, several places — every one named, in one sentence', async () => {
    const r = boot();
    expect(await r.loadFixed({ channel: 1, layer: 72 }, 'i1', 'tpl', {})).toEqual({
      accepted: true,
    });
    expect(await r.load('i2', 'tpl', {})).toEqual({ accepted: true });
    const res = r.templateRemove('tpl');
    expect(res.references).toHaveLength(2);
    expect(res.message).toContain('2 stack item(s) still use this template');
    expect(res.message).toContain('“زیرنویس” (layer 72)');
    const dynamic = res.references?.find((ref) => ref.itemId === 'i2')?.slot?.layer;
    expect(res.message).toContain(`CasparCG layer ${String(dynamic)}`);
  });

  it('with nothing referencing it, the removal goes through and carries no references', () => {
    const r = boot();
    expect(r.templateRemove('tpl')).toEqual({ ok: true });
  });
});
