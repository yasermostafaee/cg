import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { UpdateGate } from '../src/main/services/UpdateGate.js';
import type { StackService } from '../src/main/services/StackService.js';

/**
 * M9.2 — UpdateGate gates auto-update installs on stack on-air state.
 * The full electron-updater wire lands in M11; this suite verifies the
 * gate logic in isolation.
 */

interface FakeStack extends StackService {
  setSnapshot(items: { itemId: string; status: string }[]): void;
}

function makeFakeStack(): FakeStack {
  const e = new EventEmitter() as unknown as FakeStack;
  let snap: { itemId: string; status: string }[] = [];
  Object.assign(e, {
    snapshot: () => [...snap],
    setSnapshot(next: { itemId: string; status: string }[]): void {
      snap = next;
      e.emit('state-changed', next);
    },
  });
  return e;
}

const FIXED_NOW = new Date('2026-05-24T12:00:00.000Z');

describe('UpdateGate', () => {
  it('accepts immediately when stack is idle', () => {
    const stack = makeFakeStack();
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    const result = gate.request({ version: '1.4.2' });
    expect(result.accepted).toBe(true);
    expect(result.deferred).toBe(false);
    expect(result.pending.version).toBe('1.4.2');
    expect(gate.getPending()).toBeNull();
  });

  it('defers when at least one item is playing', () => {
    const stack = makeFakeStack();
    stack.setSnapshot([{ itemId: 'i1', status: 'playing' }]);
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    const result = gate.request({ version: '1.4.2' });
    expect(result.deferred).toBe(true);
    expect(gate.getPending()?.version).toBe('1.4.2');
  });

  it('defers when an item is on-air', () => {
    const stack = makeFakeStack();
    stack.setSnapshot([{ itemId: 'i1', status: 'on-air' }]);
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    expect(gate.request({ version: '2.0.0' }).deferred).toBe(true);
  });

  it('defers during update and exiting transitions too', () => {
    const stack = makeFakeStack();
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    for (const status of ['updating', 'exiting']) {
      stack.setSnapshot([{ itemId: 'i1', status }]);
      const result = gate.request({ version: status });
      expect(result.deferred, `status=${status}`).toBe(true);
    }
  });

  it('install-ready fires when the stack drains to idle', () => {
    const stack = makeFakeStack();
    stack.setSnapshot([{ itemId: 'i1', status: 'on-air' }]);
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    const onReady = vi.fn();
    gate.on('install-ready', onReady);

    gate.request({ version: '1.4.2' });
    expect(onReady).not.toHaveBeenCalled();

    // Item leaves on-air → 'idle' (not in the on-air set).
    stack.setSnapshot([{ itemId: 'i1', status: 'idle' }]);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0]?.[0]?.version).toBe('1.4.2');
    expect(gate.getPending()).toBeNull();
  });

  it('install-ready does NOT fire if a second item is still on-air', () => {
    const stack = makeFakeStack();
    stack.setSnapshot([
      { itemId: 'i1', status: 'on-air' },
      { itemId: 'i2', status: 'on-air' },
    ]);
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    const onReady = vi.fn();
    gate.on('install-ready', onReady);

    gate.request({ version: '1.4.2' });
    stack.setSnapshot([
      { itemId: 'i1', status: 'idle' },
      { itemId: 'i2', status: 'on-air' },
    ]);
    expect(onReady).not.toHaveBeenCalled();

    stack.setSnapshot([
      { itemId: 'i1', status: 'idle' },
      { itemId: 'i2', status: 'idle' },
    ]);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('cancel() clears the pending update and emits state-changed=null', () => {
    const stack = makeFakeStack();
    stack.setSnapshot([{ itemId: 'i1', status: 'on-air' }]);
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    const onState = vi.fn();
    gate.on('state-changed', onState);
    gate.request({ version: '1.4.2' });
    expect(gate.getPending()).not.toBeNull();
    gate.cancel();
    expect(gate.getPending()).toBeNull();
    // First emit: pending; second emit: cleared.
    expect(onState.mock.calls[onState.mock.calls.length - 1]?.[0]).toBeNull();
  });

  it('overwrites an earlier pending update with a newer request', () => {
    const stack = makeFakeStack();
    stack.setSnapshot([{ itemId: 'i1', status: 'on-air' }]);
    const gate = new UpdateGate({ stack, now: () => FIXED_NOW });
    gate.request({ version: '1.4.2' });
    gate.request({ version: '1.4.3', notes: 'patch' });
    expect(gate.getPending()?.version).toBe('1.4.3');
    expect(gate.getPending()?.notes).toBe('patch');
  });
});
