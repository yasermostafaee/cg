import type { ErrorEvent, EventListener, LifecycleEvent } from './types.js';

type AnyListener = (payload: unknown) => void;

/**
 * Tiny event emitter. Lifecycle-event-typed at the public surface, dynamically
 * dispatched internally. Replaces a heavier EventEmitter dep — we ship inside
 * a hermetic broadcast bundle so every byte counts.
 */
export class EventBus {
  private readonly listeners = new Map<LifecycleEvent, Set<AnyListener>>();

  on<E extends LifecycleEvent>(event: E, listener: EventListener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as AnyListener);
    return () => {
      set?.delete(listener as AnyListener);
    };
  }

  emit(event: 'error', payload: ErrorEvent): void;
  emit(event: Exclude<LifecycleEvent, 'error'>): void;
  emit(event: LifecycleEvent, payload?: ErrorEvent): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        // Listeners must not crash the bus. Errors here are swallowed
        // intentionally — broadcast must never break on a misbehaving sub.
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
