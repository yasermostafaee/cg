import { useState } from 'react';
import { Button } from '../../ui/Button.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { ListItemsEditor, type ListItemsEditorProps } from './ListItemsEditor.js';

/** Preview edits remain staged; closing this dialog never sends an update to the stage. */
export function ListItemsDialog(props: ListItemsEditorProps): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit rows… ({props.items.length})
      </Button>
      {open && (
        <Modal
          title={`Rows · ${props.label}`}
          width="min(1120px, 96vw)"
          maxHeight="90vh"
          onClose={() => setOpen(false)}
          footer={<ModalButton onClick={() => setOpen(false)}>Done</ModalButton>}
        >
          <ListItemsEditor {...props} comfortable />
        </Modal>
      )}
    </>
  );
}
