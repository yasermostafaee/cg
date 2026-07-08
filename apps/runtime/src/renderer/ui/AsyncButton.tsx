import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonClass, type ButtonVariant } from './Button.js';
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

type Props = {
  /** The bridge round-trip. Its resolution drives busy → success / error. */
  run: () => Promise<AsyncResult>;
  variant?: ButtonVariant;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'>;

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
  className,
  children,
  disabled,
  ...rest
}: Props): JSX.Element {
  const [view, setView] = useState<AsyncView>(INITIAL);
  const reduced = usePrefersReducedMotion();
  const ctrlRef = useRef<AsyncButtonController | null>(null);
  if (ctrlRef.current === null) {
    ctrlRef.current = new AsyncButtonController({
      onChange: setView,
      schedule: (fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
    });
  }
  useEffect(() => () => ctrlRef.current?.dispose(), []);

  const stateClass = [
    className,
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
        {view.showSpinner &&
          (reduced ? (
            <span className="cg-btn__busy-dots" aria-hidden="true">
              ···
            </span>
          ) : (
            <span className="cg-btn__spinner" aria-hidden="true" />
          ))}
        <span className="cg-btn__label">{children}</span>
      </button>
      {view.errorMessage !== null && (
        <span className="cg-btn-error" role="alert">
          {view.errorMessage}
        </span>
      )}
    </>
  );
}
