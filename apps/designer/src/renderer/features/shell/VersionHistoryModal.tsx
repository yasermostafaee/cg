import historyUrl from '../../../../../../docs/release/index.html?url';
import { Modal, ModalButton } from './Modal.js';

export function VersionHistoryModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Modal
      title="Version history"
      fullScreen
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      <iframe
        src={historyUrl}
        title="Version history"
        aria-label="Version history"
        sandbox="allow-scripts allow-downloads"
        tabIndex={0}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          border: 0,
        }}
      />
    </Modal>
  );
}
