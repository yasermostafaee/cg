import historyUrl from '../../../../../../docs/release/index.html?url';
import { Modal } from './Modal.js';

export function VersionHistoryModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Modal title="Version history" width="min(1160px, 96vw)" maxHeight="92vh" onClose={onClose}>
      <iframe
        src={historyUrl}
        title="Version history"
        aria-label="Version history"
        sandbox="allow-scripts allow-downloads"
        tabIndex={0}
        style={{ display: 'block', width: '100%', height: 'min(72vh, 760px)', border: 0 }}
      />
    </Modal>
  );
}
