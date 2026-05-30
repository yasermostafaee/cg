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
    rt.load('new-1', 'persian-reference', {});
    expect(calls).toBe(1);
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

  it('records audit rows for intents, most-recent first', () => {
    const rt = new MockRuntime();
    const id = rt.stackSnapshot()[0]!.itemId;
    rt.take(id);
    const recent = rt.auditRecent();
    expect(recent[0]?.action).toBe('take');
    expect(recent[0]?.outcome).toBe('ok');
  });
});
