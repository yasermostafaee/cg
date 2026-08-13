import { useSyncExternalStore } from 'react';
import { Modal, ModalButton } from '../shell/Modal.js';
import {
  pendingDurationGuard,
  resolveDurationGuardBackdrop,
  resolveDurationGuardCancel,
  resolveDurationGuardExtend,
  subscribeDurationGuard,
} from './duration-guard.js';

/**
 * add-time-duration-guard (D-151) — the dialog over the ONE guard chokepoint. Mounted ONCE in
 * `App` (several doors raise it, so it belongs to no panel) and rendered only while a request is
 * pending — the `{flag && <Modal/>}` mount/unmount convention every dialog here follows.
 *
 * Semantics are part of the spec, not the styling (the won't-auto-close banner's role lesson):
 * `role="dialog"` / `aria-modal` / the focus trap come from the shared `Modal` shell — the
 * codebase's one `aria-modal` site — and Escape/backdrop route to CANCEL, because
 * decline-means-not-added is the safe default for every dismissal gesture. Extend is the
 * primary + autoFocus action (the item's headline offer, the `SizingAutoConfirmModal`
 * precedent of focusing the primary).
 *
 * Media get the settled THREE choices (sharpened Candidate A — the third button CONFIGURES the
 * deliberate backdrop pattern, it dismisses nothing); a composition insert gets the firm TWO
 * (an instance has no `phases` and cannot follow). The backdrop choice is offered even when the
 * host has no lifecycle — a control that appears and disappears by host state is harder to
 * learn than one that explains itself (the added follower behaves marker-less until an
 * out-point exists, and the Inspector says why).
 */
export function DurationGuardDialog(): JSX.Element | null {
  const pending = useSyncExternalStore(
    subscribeDurationGuard,
    pendingDurationGuard,
    pendingDurationGuard,
  );
  if (pending === null) return null;
  const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
  const noun = pending.kind === 'composition' ? 'composition' : 'clip';
  return (
    <Modal
      title={`This ${noun} is longer than the composition`}
      ariaLabel="Content longer than the composition"
      onClose={resolveDurationGuardCancel}
      footer={
        <>
          <ModalButton onClick={resolveDurationGuardCancel}>Cancel</ModalButton>
          {pending.canFollow ? (
            <ModalButton onClick={resolveDurationGuardBackdrop}>
              Add as backdrop — follow the composition
            </ModalButton>
          ) : null}
          <ModalButton variant="primary" onClick={resolveDurationGuardExtend} autoFocus>
            Extend the composition
          </ModalButton>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        {pending.contentLabel} is <strong>{secs(pending.contentMs)}</strong>; the composition is{' '}
        <strong>{secs(pending.hostMs)}</strong>. Extend the composition to fit
        {pending.canFollow
          ? ', add it as a backdrop that follows the composition’s own timing, or cancel.'
          : ', or cancel — the element will not be added.'}
      </p>
    </Modal>
  );
}
