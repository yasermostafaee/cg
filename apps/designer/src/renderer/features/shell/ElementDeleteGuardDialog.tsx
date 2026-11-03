import { useSyncExternalStore } from 'react';
import { Modal, ModalButton } from './Modal.js';
import {
  cancelElementDelete,
  confirmElementDelete,
  pendingElementDelete,
  subscribeElementDelete,
} from './element-delete-guard.js';

/** Warn before deleting a Data-key source that surviving Value rules depend on. */
export function ElementDeleteGuardDialog(): JSX.Element | null {
  const pending = useSyncExternalStore(
    subscribeElementDelete,
    pendingElementDelete,
    pendingElementDelete,
  );
  if (pending === null) return null;
  const totalRules = pending.impacts.reduce((sum, impact) => sum + impact.ruleCount, 0);
  return (
    <Modal
      title="Delete elements and dependent rules?"
      ariaLabel="Delete elements and dependent rules?"
      onClose={cancelElementDelete}
      footer={
        <>
          <ModalButton onClick={cancelElementDelete}>Cancel</ModalButton>
          <ModalButton variant="danger" onClick={confirmElementDelete}>
            Delete elements and rules
          </ModalButton>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        Deleting the selected element{pending.elementIds.length === 1 ? '' : 's'} removes a Data key
        used by {totalRules} Value rule{totalRules === 1 ? '' : 's'}. The dependent rules will be
        deleted too.
      </p>
      <ul style={{ marginBottom: 0 }} data-testid="dependent-value-rules">
        {pending.impacts.map((impact) => (
          <li key={`${impact.targetElementId}:${impact.fieldId}`}>
            <strong>{impact.targetElementName}</strong> — {impact.ruleCount} rule
            {impact.ruleCount === 1 ? '' : 's'} using <code>{impact.fieldId}</code>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
