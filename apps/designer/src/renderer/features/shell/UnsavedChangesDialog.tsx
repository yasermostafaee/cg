import { useEffect, useState } from 'react';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Modal, ModalButton } from './Modal.js';
// The same two text treatments the save-before-switch question already declares — named, not copied.
import * as s from './SaveBeforeSwitchModal.css.js';

/** The reason a Save that wrote nothing shows — the save-before-switch guard's own words. */
export const COULD_NOT_WRITE = "Couldn't write to the file — choose where to save.";

/**
 * 🔴 `D-162` — **THE WINDOW IS CLOSING WITH UNSAVED CHANGES.** Raised by `CloseGuard` when CG
 * Designer's shell holds a close and the project has work that would be lost.
 *
 *   - **Save** saves, then closes the window. A save that writes nothing keeps the window open and
 *     says why (a cancelled file picker keeps it open too: nothing was saved).
 *   - **Don't save** closes the window.
 *   - **Cancel**, Escape, the ✕ and the backdrop keep the window open.
 *
 * Focus lands on Cancel, so a stray Enter never discards work. While a save is running nothing
 * can dismiss the dialog: a Cancel then would leave a save in flight that goes on to close the
 * window.
 */
export function UnsavedChangesDialog({ onCancel }: { onCancel: () => void }): JSX.Element | null {
  const name = useDesignerSelector((st) => st.scene?.name ?? null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  // The project closed under the dialog: there is nothing left to ask about.
  useEffect(() => {
    if (name === null) onCancel();
  }, [name, onCancel]);

  async function save(): Promise<void> {
    const scene = designerStore.get().scene;
    if (scene === null) return;
    setBusy(true);
    setReason(null);
    try {
      let res = await window.cg.projects.saveDisk({ scene, askPath: false });
      // D-088 — the write to the saved file threw (permission, disk, a stale handle): say so,
      // and ask where to save instead.
      if (!res.ok && res.reason === 'write-failed') {
        setReason(COULD_NOT_WRITE);
        res = await window.cg.projects.saveDisk({ scene, askPath: true });
      }
      if (!res.ok) {
        // Nothing was saved (the picker was cancelled): the window stays open.
        setBusy(false);
        return;
      }
      designerStore.markSaved();
      await window.cg.closeGuard.closeNow();
    } catch (err) {
      setReason(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    setBusy(true);
    try {
      await window.cg.closeGuard.closeNow();
    } catch (err) {
      setReason(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (name === null) return null;
  return (
    <Modal
      title="Unsaved changes"
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <ModalButton variant="primary" onClick={() => void save()} disabled={busy}>
            Save
          </ModalButton>
          <ModalButton variant="danger" onClick={() => void discard()} disabled={busy}>
            {"Don't save"}
          </ModalButton>
          <ModalButton onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </ModalButton>
        </>
      }
    >
      <p className={s.body} data-unsaved-project="">
        <bdi>{name}</bdi>
      </p>
      {reason !== null && (
        <p className={s.error} role="alert">
          {reason}
        </p>
      )}
    </Modal>
  );
}
