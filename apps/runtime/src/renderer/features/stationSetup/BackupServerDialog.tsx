import { useState } from 'react';
import { hostError, hostValue, portError } from '../../ui/fieldValue.js';
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

  const hostBad = hostError(host, { label: 'Host address' });
  const amcpBad = portError(amcpPort, { min: 1, label: 'AMCP port' });
  const oscBad = portError(oscPort, { min: 0, label: 'OSC port' });
  const invalid = hostBad !== null || amcpBad !== null || oscBad !== null;

  return (
    <RecordDialog
      title="Add backup server"
      /*
        🔴 `SETTINGS-MATCH-02` §8a — **THE VERB IS THE CONTRACT.** `Add to draft`, not `Add
        backup`: this dialog writes into the Servers DRAFT and the pane's `Apply servers` is
        what reaches the bridge. A button called `Add backup` beside a section that refuses to
        apply while anything is on air invites exactly the reading the on-air guard exists to
        prevent — that this small dialog is a way round it. It is not, and now it does not
        look like one either.
      */
      confirmLabel="Add to draft"
      lede="Changes will be applied with the rest of your server settings."
      confirmDisabled={invalid}
      onCancel={onCancel}
      onSubmit={() => {
        /*
          ⚠ The field-level rules are the SHARED ones (`fieldValue.ts`), so this form and the
          Servers pane cannot disagree about what a host or a port is. The commit is already
          disabled while any of them is wrong; this is the belt for the Enter key.
        */
        if (invalid) return hostBad ?? amcpBad ?? oscBad;
        onAdd({ host: host.trim(), amcpPort, oscPort });
        return null;
      }}
    >
      {/* §8a — the host takes the row on its own, and the two ports share the next one. */}
      <DialogField label="Host address" id="backup-host" error={hostBad} focusFirst>
        <input
          className="cg-field cg-field--mono"
          type="text"
          dir="ltr"
          value={host}
          aria-label="New backup host"
          placeholder="192.168.21.115"
          onChange={(e) => setHost(hostValue(e.target.value))}
        />
      </DialogField>
      <div className="cg-setup-fields">
        <DialogField label="AMCP port" id="backup-amcp" error={amcpBad}>
          <NumericInput
            className="cg-field cg-field--mono"
            dir="ltr"
            allow="digits"
            aria-label="New backup AMCP port"
            value={amcpPort}
            onValueChange={setAmcpPort}
          />
        </DialogField>
        <DialogField label="OSC port" id="backup-osc" error={oscBad}>
          <NumericInput
            className="cg-field cg-field--mono"
            dir="ltr"
            allow="digits"
            aria-label="New backup OSC port"
            value={oscPort}
            onValueChange={setOscPort}
          />
        </DialogField>
      </div>
    </RecordDialog>
  );
}
