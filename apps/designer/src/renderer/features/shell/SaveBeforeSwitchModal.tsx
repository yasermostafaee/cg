import { useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { Modal, ModalButton } from './Modal.js';
import * as s from './SaveBeforeSwitchModal.css.js';

interface Props {
  /** The current scene the operator might lose if they switch. */
  scene: Scene;
  /**
   * Display-only hint for whether the scene has been saved to disk
   * yet — the picked path lives inside the bridge handle cache, not
   * here. Used only to phrase the modal copy.
   */
  projectPath: string | null;
  /**
   * Called after the modal is fully resolved (save succeeded /
   * operator chose Discard). Caller proceeds with the project switch
   * inside this callback. NOT called on Cancel.
   */
  onProceed: () => void | Promise<void>;
  /** Close without proceeding. */
  onCancel: () => void;
}

/**
 * Asks the operator what to do with the currently-loaded project
 * before switching to a different one. Three outcomes:
 *
 *   - Save     → calls projects.save and then onProceed()
 *   - Discard  → calls onProceed() without saving
 *   - Cancel   → closes without proceeding
 */
export function SaveBeforeSwitchModal({
  scene,
  projectPath,
  onProceed,
  onCancel,
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await window.cg.projects.saveDisk({ scene, askPath: false });
      if (!res.ok) {
        // Operator cancelled the file picker — keep the modal open so
        // they can pick again or hit Discard.
        setBusy(false);
        return;
      }
      await onProceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    setBusy(true);
    try {
      await onProceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Save current project?"
      onClose={onCancel}
      ariaLabel="Save before switch"
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={busy}>
            Cancel
          </ModalButton>
          <ModalButton variant="danger" onClick={() => void discard()} disabled={busy}>
            Discard
          </ModalButton>
          <ModalButton variant="primary" onClick={() => void save()} disabled={busy}>
            Save…
          </ModalButton>
        </>
      }
    >
      <p className={s.body}>
        You have <strong>{scene.name}</strong> open
        {projectPath === null
          ? ' (not saved yet). Save it before switching, or discard the work.'
          : '. Save changes before switching, or discard them.'}
      </p>
      {error !== null && <p className={s.error}>{error}</p>}
    </Modal>
  );
}
