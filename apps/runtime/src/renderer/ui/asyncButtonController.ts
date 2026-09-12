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

import { errorCodeMessage, prefersOwnMessage } from './errorCodeMessage.js';

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
  /**
   * C-015 phase 6 (6.0) — the refusal's OWN sentence, when the bridge supplied
   * one. Preferred over `errorCodeMessage(errorCode)` because it is the more
   * SPECIFIC of the two: a Live Source refusal names which plate is unassigned,
   * and a code is a fixed string that cannot. Absent for every refusal that has
   * only a code, which is all of them except the take's plate refusals.
   */
  message?: string | undefined;
  /**
   * True when the action's own confirm gate was CANCELLED (see `withConfirm` in
   * `rowAction.ts`). A cancel is neither a success nor an error: the operator
   * said "no" before anything ran, so the button settles straight back to idle
   * with no success flash and no message. Without this flag a cancelled confirm
   * would have to pick between the two lies — `accepted: true` (a success flash
   * for a command that was never sent) or `accepted: false` (an error toast for
   * the operator's own choice).
   */
  cancelled?: boolean | undefined;
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
  /**
   * When provided, a failure is routed HERE (e.g. to a toast) instead of being pinned
   * inline beside the control, and the button returns to idle. Use for buttons that live
   * in a tight row where an inline error would break the layout — the message is
   * unchanged, only its placement.
   */
  onError?: (message: string) => void;
}

/**
 * The operator-facing message a settled action should surface, or `null` when it
 * succeeded. B-070 — prefer the bridge's REASON over the generic fallback: a
 * refusal that cannot explain itself is the bug the operator hit.
 *
 * Exported because the CONTEXT MENU triggers the same actions as the buttons and
 * must report a refusal identically. Two spellings of "what went wrong" would
 * mean the same refusal reads differently depending on how it was issued.
 */
export function asyncResultMessage(res: AsyncResult, notAccepted = 'Not accepted.'): string | null {
  // A cancelled confirm gate is the operator's own "no" — nothing happened, so
  // there is nothing to report (checked before `accepted`: a cancelled result
  // carries `accepted: false`, and the fallback message would turn it into a
  // phantom refusal toast).
  if (res.cancelled === true) return null;
  if (res.accepted) return null;
  /*
    🔴 `CONSOLE-LOOK-06` DELTA R — **THE ORDER IS REVERSED FOR THE CODES THAT NEED IT.**

    This preferred the BRIDGE's sentence. That sentence is written for a developer: the one
    the owner photographed reads

        exactly one multi-box template may be on air per channel:
        "e506e319-6e68-4603-a5f4-290b21616250" (3 boxes, item
        "item-0d9a8b6c-427c-4001-ad89-8e4eb2849dd2") is already on air on channel 1
        — take it off air first

    — a template UUID, an item UUID and "channel 1", when the row is called Bed 1, the
    template is called 3ghab and the console spells the channel CH 1 three inches away.
    Golden rule 11, and the same class as the `rowIsShown` defect: a value written for one
    audience answering another audience's question.

    ⚠ AND THE GOOD SENTENCE ALREADY EXISTED. `errorCodeMessage` has carried operator copy for
    `multibox-already-on-air` all along — "Another multi-box graphic is already on air on this
    channel, and only one may be. Take that row off air first — this is a crosstalk guard, not
    a layer shortage." It was being overridden by the line below it, which is why this is a
    preference inversion and not a rewrite: the console's own words win wherever it has them.

    ⭐ THE OPERATOR READS A SENTENCE; THE LOG KEEPS THE IDS. The bridge's text is not thrown
    away — it rides `detail` on the refusal banner and the audit log keeps its own copy. It
    is demoted from the sentence, not deleted.

    ⚠ AND IT IS PER-CODE, NOT BLANKET — the first cut of this fix inverted the order for
    everything and `asyncButton.test.ts` caught what that costs: for `live-source-unassigned`
    the bridge's sentence names the PLATE (`guest-3`), which is the operator's own word for it
    and the only part of the refusal they can act on. Our generic sentence cannot say it. So
    `prefersOwnMessage` lists the codes whose bridge text identifies things by UUID, and
    everything else keeps the old order.

    ⚠ The set is a LIST rather than a test on the text, because deciding from the prose would
    be string-matching a contract nobody wrote down (§6) — it breaks the first time a message
    is edited, and silently.
  */
  const ours = errorCodeMessage(res.errorCode);
  if (ours !== null && prefersOwnMessage(res.errorCode)) return ours;
  if (res.message !== undefined && res.message !== '') return res.message;
  return ours ?? notAccepted;
}

/** The message for a REJECTED action (e.g. the link is down). Shared, see above. */
export function asyncRejectionMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
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
  readonly #cfg: Required<Omit<AsyncButtonConfig, 'onChange' | 'schedule' | 'onError'>> &
    Pick<AsyncButtonConfig, 'onChange' | 'schedule' | 'onError'>;

  #cancels: (() => void)[] = [];
  #spinnerShown = false;
  #floorElapsed = false;
  #settled: { error: string | null; cancelled: boolean } | undefined;
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
        this.#settled = {
          error: asyncResultMessage(res, this.#cfg.notAcceptedMessage),
          cancelled: res.cancelled === true,
        };
        this.#tryFinish();
      },
      (err: unknown) => {
        this.#settled = { error: asyncRejectionMessage(err), cancelled: false };
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

    const { error, cancelled } = this.#settled;
    this.#clearTimers();
    this.#spinnerShown = false;
    this.#floorElapsed = false;
    this.#settled = undefined;

    // Cancelled confirm gate: straight back to idle — no success flash (nothing
    // succeeded), no message (nothing failed). `error` is already null here
    // (`asyncResultMessage` returns null for a cancel); the explicit flag is what
    // keeps the cancel out of the success branch below.
    if (cancelled) {
      this.#set({ phase: 'idle', showSpinner: false, ariaBusy: false, inFlight: false });
      return;
    }

    if (error !== null) {
      if (this.#cfg.onError !== undefined) {
        // Routed to a toast/overlay instead of pinned inline (keeps the message out of a
        // tight row's flow). The button returns to idle; the toast carries the feedback.
        this.#cfg.onError(error);
        this.#set({
          phase: 'idle',
          showSpinner: false,
          ariaBusy: false,
          inFlight: false,
          errorMessage: null,
        });
        return;
      }
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
