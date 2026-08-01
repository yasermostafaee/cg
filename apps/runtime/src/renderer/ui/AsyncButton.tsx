import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { buttonClass, type ButtonVariant } from './Button.js';
import { Icon } from './Icon.js';
import {
  AsyncButtonController,
  type AsyncResult,
  type AsyncView,
} from './asyncButtonController.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

const INITIAL: AsyncView = {
  phase: 'idle',
  showSpinner: false,
  errorMessage: null,
  ariaBusy: false,
  inFlight: false,
};

/** Build a controller wired to real timers. Module-scope so the effect can
 *  recreate one after a StrictMode dispose without re-declaring the config. */
function createController(
  onChange: (view: AsyncView) => void,
  onError?: (message: string) => void,
): AsyncButtonController {
  return new AsyncButtonController({
    onChange,
    ...(onError !== undefined ? { onError } : {}),
    schedule: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
}

type Props = {
  /** The bridge round-trip. Its resolution drives busy → success / error. */
  run: () => Promise<AsyncResult>;
  variant?: ButtonVariant;
  children: ReactNode;
  /**
   * When set, a failure is routed HERE (e.g. `reportCommandError` → the command toast)
   * instead of rendered inline beside the button. Use for buttons in a tight row where an
   * inline error would break the layout.
   */
  onError?: (message: string) => void;
  /** R-028 — a decorative lucide glyph beside the label. */
  icon?: LucideIcon;
  /**
   * Show the GLYPH only, keeping the label as the accessible name.
   *
   * Legitimate in exactly one place: the Layers table's verb column, where the
   * sticky COLUMN HEADER carries the word each glyph stands for. The label is
   * still present in the DOM (visually hidden) and the caller adds a tooltip, so
   * the word survives in three channels — screen reader, hover/focus, and the
   * header. Do not reach for this on a lone button with no header above it: this
   * product's STOP and CLEAR mean the opposite of the reference product's, and an
   * operator must never have to decode a symbol to tell them apart.
   */
  iconOnly?: boolean;
  /**
   * This control is a TOGGLE and it is currently ENGAGED — paints the `.is-on`
   * fill from `controls.css`. See {@link Button}'s copy of this prop for why it is
   * a prop rather than a class name, and why it deliberately sets no
   * `aria-pressed`.
   */
  active?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'onError'>;

/**
 * R-007 — a button for a BRIDGE ROUND-TRIP. It shows instant press (CSS),
 * busy while its own request is in flight (spinner after ~150ms, held ≥300ms;
 * double-fire guarded, `aria-busy`), a success flash, and an inline error
 * beside the control on rejection. Busy tracks ONLY this request's ack — it is
 * decoupled from the B-044 stack badge, which settles on its own longer signal.
 */
export function AsyncButton({
  run,
  variant = 'default',
  active,
  className,
  children,
  disabled,
  onError,
  icon,
  iconOnly = false,
  ...rest
}: Props): JSX.Element {
  const [view, setView] = useState<AsyncView>(INITIAL);
  const reduced = usePrefersReducedMotion();
  // Hold the latest onError so the long-lived controller always calls the current handler.
  // Read via the ref (not the prop) inside the once-only effect so it stays a known-stable
  // dependency, exactly like `setView` — the routing decision is stable per button.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const ctrlRef = useRef<AsyncButtonController | null>(null);
  if (ctrlRef.current === null) {
    ctrlRef.current = createController(
      setView,
      onError !== undefined ? (msg) => onErrorRef.current?.(msg) : undefined,
    );
  }
  // StrictMode double-invokes effects in dev (setup → cleanup → setup); the
  // cleanup disposes the controller, so REVIVE it on re-setup — otherwise every
  // click no-ops against a disposed controller (the slice's severed-click bug).
  useEffect(() => {
    if (ctrlRef.current === null || ctrlRef.current.isDisposed) {
      ctrlRef.current = createController(
        setView,
        onErrorRef.current !== undefined ? (msg) => onErrorRef.current?.(msg) : undefined,
      );
    }
    return () => ctrlRef.current?.dispose();
  }, []);

  const stateClass = [
    className,
    // The ENGAGED fill sits first so the transient phases below can paint over it:
    // a success flash or an error ring on an engaged toggle must still be visible.
    active === true ? 'is-on' : '',
    view.phase === 'success' ? 'is-success' : '',
    view.phase === 'error' ? 'is-error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        type="button"
        className={buttonClass(variant, stateClass)}
        aria-busy={view.ariaBusy}
        disabled={disabled === true || view.inFlight}
        onClick={() => ctrlRef.current?.press(run)}
        {...rest}
      >
        {view.showSpinner ? (
          reduced ? (
            <span className="cg-btn__busy-dots" aria-hidden="true">
              ···
            </span>
          ) : (
            <span className="cg-btn__spinner" aria-hidden="true" />
          )
        ) : (
          // R-028 — the verb's glyph, shown only when NOT in flight: the
          // spinner takes the same slot, so the control's width never jumps
          // mid-press and the busy state is unmistakable rather than a second
          // icon competing with the first.
          icon !== undefined && <Icon icon={icon} size={iconOnly ? 17 : 15} />
        )}
        {/* The label. Visually hidden when the glyph stands alone — hidden, never
            absent, so the button keeps an accessible name even without the
            caller's `aria-label`. */}
        <span className={iconOnly ? 'cg-visually-hidden' : 'cg-btn__label'}>{children}</span>
      </button>
      {view.errorMessage !== null && (
        <span className="cg-btn-error" role="alert">
          {view.errorMessage}
        </span>
      )}
    </>
  );
}
