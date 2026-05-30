/** Minimal typed pub-sub used to back the bridge's `on*` push channels. */
export class Emitter<T> {
  readonly #handlers = new Set<(value: T) => void>();

  subscribe(handler: (value: T) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  emit(value: T): void {
    for (const handler of [...this.#handlers]) handler(value);
  }
}
