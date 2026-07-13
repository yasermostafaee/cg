import { describe, expect, it } from 'vitest';
import { MockRuntime } from '../src/platform/MockRuntime.js';

describe('MockRuntime stack', () => {
  it('starts with a non-empty seeded stack', () => {
    expect(new MockRuntime().stackSnapshot().length).toBeGreaterThan(0);
  });

  it('take moves an item on-air after the settle beat', async () => {
    const rt = new MockRuntime();
    const id = rt.stackSnapshot()[0]!.itemId;
    rt.take(id);
    // immediately pending
    expect(rt.stackSnapshot().find((i) => i.itemId === id)?.pending).toBe(true);
    await new Promise((r) => setTimeout(r, 220));
    const item = rt.stackSnapshot().find((i) => i.itemId === id);
    expect(item?.status).toBe('on-air');
    expect(item?.pending).toBe(false);
  });

  it('update merges field values', () => {
    const rt = new MockRuntime();
    const id = rt.stackSnapshot()[0]!.itemId;
    rt.update(id, { headline: 'Hi' }, 'merge');
    rt.update(id, { subtitle: 'There' }, 'merge');
    const fields = rt.stackSnapshot().find((i) => i.itemId === id)?.fields;
    expect(fields).toMatchObject({ headline: 'Hi', subtitle: 'There' });
  });

  it('remove drops the item', () => {
    const rt = new MockRuntime();
    const id = rt.stackSnapshot()[0]!.itemId;
    rt.remove(id);
    expect(rt.stackSnapshot().find((i) => i.itemId === id)).toBeUndefined();
  });

  it('emits stack changes to subscribers', () => {
    const rt = new MockRuntime();
    let calls = 0;
    rt.stackChanged.subscribe(() => (calls += 1));
    rt.load('new-1', 'ticker', {});
    expect(calls).toBe(1);
  });
});

describe('MockRuntime owned-slot occupancy (B-056 parity)', () => {
  it('starts empty without the e2e seed and never publishes on unrelated ops', () => {
    const rt = new MockRuntime();
    let calls = 0;
    rt.ownedOccupancyChanged.subscribe(() => (calls += 1));
    expect(rt.ownedOccupancy()).toEqual([]);
    const id = rt.stackSnapshot()[0]!.itemId;
    rt.take(id);
    rt.out(id);
    rt.remove(id);
    expect(calls).toBe(0);
  });

  it('boots with the seeded warning under CG_E2E_OWNED_OCCUPANCY and resolves it on remove', () => {
    (globalThis as { CG_E2E_OWNED_OCCUPANCY?: boolean }).CG_E2E_OWNED_OCCUPANCY = true;
    try {
      const rt = new MockRuntime();
      const emissions: unknown[][] = [];
      rt.ownedOccupancyChanged.subscribe((w) => emissions.push(w));
      // The seeded warning names a row `seedStack()` actually creates — the
      // E2E's remedy is removing that row (D-119 rebuilt the starter seed).
      expect(rt.ownedOccupancy()).toMatchObject([
        { channel: 1, layer: 10, itemId: 'item-irib-news' },
      ]);
      expect(rt.stackSnapshot().map((i) => i.itemId)).toContain('item-irib-news');
      // A take does NOT resolve (bridge parity).
      rt.take('item-irib-news');
      expect(rt.ownedOccupancy()).toHaveLength(1);
      // The remedy resolves it and publishes the change.
      rt.remove('item-irib-news');
      expect(rt.ownedOccupancy()).toEqual([]);
      expect(emissions[emissions.length - 1]).toEqual([]);
    } finally {
      delete (globalThis as { CG_E2E_OWNED_OCCUPANCY?: boolean }).CG_E2E_OWNED_OCCUPANCY;
    }
  });
});

describe('MockRuntime lock', () => {
  it('engages and releases with the matching PIN', async () => {
    const rt = new MockRuntime();
    expect((await rt.engage('1234')).ok).toBe(true);
    expect(rt.lockState().engaged).toBe(true);
    expect((await rt.release('0000')).ok).toBe(false);
    expect((await rt.release('1234')).ok).toBe(true);
    expect(rt.lockState().engaged).toBe(false);
  });
});

describe('MockRuntime connections', () => {
  it('failover flips the current primary', () => {
    const rt = new MockRuntime();
    expect(rt.health().currentPrimary).toBe('A');
    const result = rt.failover();
    expect(result.newPrimary).toBe('B');
    expect(rt.health().currentPrimary).toBe('B');
    expect(rt.health().lastFailover?.reason).toBe('manual');
  });
});

describe('MockRuntime templates + audit', () => {
  it('lists seeded templates with field schemas', () => {
    const rt = new MockRuntime();
    const list = rt.templateList();
    expect(list.length).toBeGreaterThan(0);
    expect(rt.templateGet(list[0]!.templateId)).not.toBeNull();
  });

  it('imports a verified template into the registry (R-001)', () => {
    const rt = new MockRuntime();
    const before = rt.templateList().length;
    const result = rt.templateImport({
      templateId: 'tpl-imported-1',
      templateType: 'lower-third',
      fields: [{ id: 'anchor', label: 'Anchor name', required: true, type: 'text', default: '' }],
    });
    expect(result).toEqual({ registered: true, templateId: 'tpl-imported-1' });
    expect(rt.templateList().length).toBe(before + 1);
    const got = rt.templateGet('tpl-imported-1');
    expect(got?.fields[0]?.id).toBe('anchor');
  });

  it('records audit rows for intents, most-recent first', () => {
    const rt = new MockRuntime();
    const id = rt.stackSnapshot()[0]!.itemId;
    rt.take(id);
    const recent = rt.auditRecent();
    expect(recent[0]?.action).toBe('take');
    expect(recent[0]?.outcome).toBe('ok');
  });
});

/**
 * B-072 parity — the mock must publish the stored override in item state, the
 * same way the real bridge does. The B-070 lesson: the mock must not be the
 * only one that models (or fails to model) a path the UI depends on, or the UI
 * gets built against semantics the bridge does not have.
 */
describe('MockRuntime position read-back (B-072 parity)', () => {
  const OVERRIDE = { anchor: 'bottom-right' as const, offset: { x: -10, y: -20 } };

  function idleItemId(rt: MockRuntime): string {
    const item = rt.stackSnapshot().find((i) => i.status === 'idle' && !i.pending);
    expect(item).toBeDefined();
    return item!.itemId;
  }

  it('publishes an applied override in the item state', () => {
    const rt = new MockRuntime();
    const id = idleItemId(rt);
    expect(rt.stackSnapshot().find((i) => i.itemId === id)?.position).toBeUndefined();

    expect(rt.setPosition(id, OVERRIDE)).toEqual({ ok: true });
    expect(rt.stackSnapshot().find((i) => i.itemId === id)?.position).toEqual(OVERRIDE);
    // Idempotent — a re-read (the reselect analogue) still yields it.
    expect(rt.stackSnapshot().find((i) => i.itemId === id)?.position).toEqual(OVERRIDE);
  });

  it('pushes the override on the state-changed stream too', () => {
    const rt = new MockRuntime();
    const id = idleItemId(rt);
    const pushes: (readonly { itemId: string; position?: unknown }[])[] = [];
    const off = rt.stackChanged.subscribe((s) => pushes.push(s));
    try {
      // set-position republishes: an IDLE item's override reaches CasparCG on
      // no wire at all, so the push is the ONLY way the SPA can learn it.
      rt.setPosition(id, OVERRIDE);
      expect(pushes.at(-1)?.find((i) => i.itemId === id)?.position).toEqual(OVERRIDE);
      // and it survives the next mutation's republish
      rt.load(id, 'tpl-1', {});
      expect(pushes.at(-1)?.find((i) => i.itemId === id)?.position).toEqual(OVERRIDE);
    } finally {
      off();
    }
  });

  it('a removed item drops its published override', () => {
    const rt = new MockRuntime();
    const id = idleItemId(rt);
    rt.setPosition(id, OVERRIDE);
    expect(rt.stackSnapshot().find((i) => i.itemId === id)?.position).toEqual(OVERRIDE);
    rt.remove(id);
    expect(rt.stackSnapshot().find((i) => i.itemId === id)).toBeUndefined();
    rt.load(id, 'tpl-1', {});
    expect(rt.stackSnapshot().find((i) => i.itemId === id)?.position).toBeUndefined();
  });
});
