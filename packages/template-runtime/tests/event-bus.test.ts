import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/event-bus.js';

describe('EventBus', () => {
  it('emits to all subscribers', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ready', a);
    bus.on('ready', b);
    bus.emit('ready');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns a cleanup that unsubscribes', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const off = bus.on('play.start', cb);
    bus.emit('play.start');
    off();
    bus.emit('play.start');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('emits error events with payload', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('error', cb);
    bus.emit('error', { code: 'X', message: 'oops' });
    expect(cb).toHaveBeenCalledWith({ code: 'X', message: 'oops' });
  });

  it('swallows listener exceptions', () => {
    const bus = new EventBus();
    bus.on('ready', () => {
      throw new Error('listener boom');
    });
    const after = vi.fn();
    bus.on('ready', after);
    expect(() => bus.emit('ready')).not.toThrow();
    expect(after).toHaveBeenCalled();
  });

  it('clear removes all listeners', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.on('ready', cb);
    bus.clear();
    bus.emit('ready');
    expect(cb).not.toHaveBeenCalled();
  });
});
