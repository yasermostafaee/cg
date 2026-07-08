/**
 * R-007 — the async-feedback state machine for a bridge-round-trip button,
 * framework-free so it unit-tests with an injected scheduler. The React
 * `AsyncButton` wraps this with real timers + `setState`.
 *
 * Contract (design.md): instant press (CSS `:active`, not here); busy only if
 * the request is still pending past `spinnerDelayMs` (~150ms) and, once the
 * spinner is shown, for at least `spinnerMinMs` (~300ms) so a fast local ack
 * never flickers; a brief success flash on `accepted`; an error state + message
 * on reject/`!accepted`; and a double-fire guard while busy.
 */

export type AsyncPhase = 'idle' | 'busy' | 'success' | 'error';

export interface AsyncView {
  phase: AsyncPhase;
  showSpinner: boolean;
  errorMessage: string | null;
  ariaBusy: boolean;
  /** True while a request is in flight (the double-fire / disabled guard). */
  inFlight: boolean;
}

export interface AsyncResult {
  accepted: boolean;
  errorCode?: string | undefined;
}

export interface AsyncButtonConfig {
  onChange: (view: AsyncView) => void;
  /** Returns a cancel fn. Real component: setTimeout/clearTimeout. Tests: fake. */
  schedule: (fn: () => void, ms: number) => () => void;
  spinnerDelayMs?: number;
  spinnerMinMs?: number;
  successMs?: number;
  /** Message for a resolved-but-not-accepted result. */
  notAcceptedMessage?: string;
}

const IDLE: AsyncView = {
  phase: 'idle',
  showSpinner: false,
  errorMessage: null,
  ariaBusy: false,
  inFlight: false,
};

export class AsyncButtonController {
  #view: AsyncView = { ...IDLE };
  readonly #cfg: Required<Omit<AsyncButtonConfig, 'onChange' | 'schedule'>> &
    Pick<AsyncButtonConfig, 'onChange' | 'schedule'>;

  #cancels: (() => void)[] = [];
  #spinnerShown = false;
  #floorElapsed = false;
  #settled: { error: string | null } | undefined;
  #disposed = false;

  constructor(cfg: AsyncButtonConfig) {
    this.#cfg = {
      spinnerDelayMs: 150,
      spinnerMinMs: 300,
      successMs: 600,
      notAcceptedMessage: 'Not accepted.',
      ...cfg,
    };
  }

  get view(): AsyncView {
    return this.#view;
  }

  /**
   * True once `dispose()` has run. A disposed controller no-ops `press()` — the
   * React wrapper reads this to REVIVE the controller after a StrictMode
   * setup→cleanup→setup cycle (which would otherwise leave the button inert).
   */
  get isDisposed(): boolean {
    return this.#disposed;
  }

  /** Begin a request. Ignored (double-fire guard) while one is in flight. */
  press(run: () => Promise<AsyncResult>): void {
    if (this.#disposed || this.#view.inFlight) return;
    this.#reset();
    this.#set({ phase: 'busy', ariaBusy: true, inFlight: true, errorMessage: null });

    // Show the spinner only if still pending at spinnerDelayMs.
    this.#cancels.push(
      this.#cfg.schedule(() => {
        if (!this.#view.inFlight) return;
        this.#spinnerShown = true;
        this.#set({ showSpinner: true });
        // Hold it at least spinnerMinMs once shown.
        this.#cancels.push(
          this.#cfg.schedule(() => {
            this.#floorElapsed = true;
            this.#tryFinish();
          }, this.#cfg.spinnerMinMs),
        );
      }, this.#cfg.spinnerDelayMs),
    );

    run().then(
      (res) => {
        this.#settled = { error: res.accepted ? null : this.#cfg.notAcceptedMessage };
        this.#tryFinish();
      },
      (err: unknown) => {
        this.#settled = { error: err instanceof Error ? err.message : 'Request failed.' };
        this.#tryFinish();
      },
    );
  }

  dispose(): void {
    this.#disposed = true;
    this.#reset();
  }

  #tryFinish(): void {
    if (this.#disposed || this.#settled === undefined) return;
    // If the spinner is showing, wait out the minimum-visible floor first.
    if (this.#spinnerShown && !this.#floorElapsed) return;

    const { error } = this.#settled;
    this.#clearTimers();
    this.#spinnerShown = false;
    this.#floorElapsed = false;
    this.#settled = undefined;

    if (error !== null) {
      // Error persists (until the next press) so the operator can read it.
      this.#set({
        phase: 'error',
        showSpinner: false,
        ariaBusy: false,
        inFlight: false,
        errorMessage: error,
      });
      return;
    }
    this.#set({ phase: 'success', showSpinner: false, ariaBusy: false, inFlight: false });
    this.#cancels.push(
      this.#cfg.schedule(() => {
        if (this.#view.phase === 'success') this.#set({ phase: 'idle' });
      }, this.#cfg.successMs),
    );
  }

  #reset(): void {
    this.#clearTimers();
    this.#spinnerShown = false;
    this.#floorElapsed = false;
    this.#settled = undefined;
  }

  #clearTimers(): void {
    for (const cancel of this.#cancels) cancel();
    this.#cancels = [];
  }

  #set(patch: Partial<AsyncView>): void {
    this.#view = { ...this.#view, ...patch };
    if (!this.#disposed) this.#cfg.onChange(this.#view);
  }
}
