import { useState } from 'react';
import { NumericInput } from '../../ui/NumericInput.js';
import { DialogField, RecordDialog } from '../../ui/RecordDialog.js';

/**
 * `STATION-CHROME-01` §6 — **ADD THE BACKUP SERVER, in the same small second dialog every
 * other Add uses.**
 *
 * It used to be a toggle that REVEALED three empty fields in place — a third way of adding a
 * record in one dialog, beside the delimiters' inline strip and the sources' name-plus-Add.
 * The operator now meets one shape wherever he adds anything.
 *
 * ⚠ **THIS ADDS THE RECORD; IT DOES NOT APPLY IT.** The backup is part of the Servers DRAFT,
 * so the dialog's confirm puts host and ports into that draft and the Servers footer's APPLY
 * SERVERS is what reaches the bridge — which is why the dialog says so rather than implying a
 * commit. Once the record exists its fields stay INLINE on the Servers tab, editable beside
 * the primary's, because at that point they are simply two more fields of one form: putting
 * one field of a form behind a dialog while its siblings are inline would be less consistent,
 * not more.
 */
export function BackupServerDialog({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (draft: { host: string; amcpPort: string; oscPort: string }) => void;
}): JSX.Element {
  const [host, setHost] = useState('');
  const [amcpPort, setAmcpPort] = useState('5250');
  const [oscPort, setOscPort] = useState('6250');

  return (
    <RecordDialog
      title="Add backup server (B)"
      confirmLabel="Add backup"
      lede="Applied with the rest of Servers — this adds it to the draft; APPLY SERVERS sends it."
      onCancel={onCancel}
      onSubmit={() => {
        if (host.trim() === '') {
          return 'Give the backup server a host — the address this console reaches it on.';
        }
        // The PORTS are validated by the Servers form's own `parseEndpoint`, which is the
        // one place that rule lives; a second copy here is how the two come to disagree.
        onAdd({ host: host.trim(), amcpPort, oscPort });
        return null;
      }}
    >
      <DialogField label="Host">
        <input
          className="cg-field"
          type="text"
          value={host}
          aria-label="New backup host"
          placeholder="192.168.21.115"
          onChange={(e) => setHost(e.target.value)}
        />
      </DialogField>
      <DialogField label="AMCP port">
        <NumericInput
          className="cg-field"
          aria-label="New backup AMCP port"
          value={amcpPort}
          onValueChange={setAmcpPort}
        />
      </DialogField>
      <DialogField label="OSC port">
        <NumericInput
          className="cg-field"
          aria-label="New backup OSC port"
          value={oscPort}
          onValueChange={setOscPort}
        />
      </DialogField>
    </RecordDialog>
  );
}
