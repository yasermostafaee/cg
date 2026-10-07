import { Modal, ModalAction } from '../../ui/Modal.js';

/**
 * 🔴 `R-094` — the one fact line, and only when it is true: how many of the console's items stay
 * on air when the window closes. `null` with none — the dialog then says nothing but its title.
 */
export function stayOnAirLine(onAir: number): string | null {
  if (onAir <= 0) return null;
  return onAir === 1 ? '1 item stays on air.' : `${String(onAir)} items stay on air.`;
}

/**
 * 🔴 `R-094` — **CLOSE CG CONTROL?** Raised by `ConsoleCloseGuard` when CG Control's shell holds a
 * close of its window.
 *
 *   - **Close** closes the window. It sends NOTHING to CG Bridge or CasparCG: it is a window close,
 *     not a CLEAR, and what is on air stays on air — which is why the fact line says so in numbers.
 *   - **Cancel**, Escape, the ✕ and the scrim keep the window open.
 *
 * Focus lands on Cancel (`data-modal-autofocus`, the primitive's one door for it), so a stray
 * Enter keeps the console. The `window` layer puts the dialog above the lock, the sign-in gate and
 * first-run: the window can be closed whatever covers the console.
 *
 * No other prose (operator-surface rule): a title, the fact, two buttons.
 */
export function CloseConsoleDialog({
  onAir,
  onCancel,
  onClose,
}: {
  /** The console's items on air now (`airTally`, the one air count). */
  onAir: number;
  onCancel: () => void;
  onClose: () => void;
}): JSX.Element {
  const fact = stayOnAirLine(onAir);
  return (
    <Modal
      title="Close CG Control?"
      layer="window"
      onClose={onCancel}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onCancel} data-modal-autofocus="">
            Cancel
          </ModalAction>
          <ModalAction actionRole="primary" onClick={onClose}>
            Close
          </ModalAction>
        </>
      }
    >
      {fact ?? undefined}
    </Modal>
  );
}
