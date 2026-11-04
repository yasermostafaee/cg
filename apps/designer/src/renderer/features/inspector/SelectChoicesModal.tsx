import { useState } from 'react';
import { Button } from '../../ui/Button.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { TextField } from './controls.js';
import * as s from './NumberChoicesModal.css.js';

interface Choice {
  value: string;
  label: string;
}
interface Props {
  options: readonly Choice[];
  connectedFileCount?: number;
  onCancel: () => void;
  onSave: (options: Choice[]) => void;
}

/** Uses the same row editor and controls as numeric choices; strings stay readable in rules/files. */
export function SelectChoicesModal({
  options,
  connectedFileCount = 0,
  onCancel,
  onSave,
}: Props): JSX.Element {
  const [rows, setRows] = useState<Choice[]>(() => options.map((option) => ({ ...option })));
  const [error, setError] = useState<string | null>(null);
  function patch(index: number, changes: Partial<Choice>): void {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...changes } : row)));
    setError(null);
  }
  function save(): void {
    const result = rows.map((row) => ({
      value: row.value.trim(),
      label: row.label.trim() || row.value.trim(),
    }));
    if (result.length === 0) {
      setError('Add at least one choice.');
      return;
    }
    const invalid = result.findIndex((row) => row.value === '');
    if (invalid !== -1) {
      setError(`Choice ${invalid + 1} needs a value.`);
      return;
    }
    const duplicate = result.findIndex(
      (row, index) => result.findIndex((other) => other.value === row.value) !== index,
    );
    if (duplicate !== -1) {
      setError(`Choice ${duplicate + 1} repeats a value.`);
      return;
    }
    onSave(result);
  }
  return (
    <Modal
      title="Edit text choices"
      onClose={onCancel}
      width="min(620px, 94vw)"
      maxHeight="88vh"
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={save}>
            Save choices
          </ModalButton>
        </>
      }
    >
      <div className={s.heading} aria-hidden="true">
        <span>Value</span>
        <span>Label (optional)</span>
        <span />
      </div>
      <div className={s.rows}>
        {rows.map((row, index) => (
          <div className={s.row} key={index}>
            <span className={s.mobileLabel}>Value</span>
            <TextField
              bare
              label={`Choice ${index + 1} value`}
              value={row.value}
              dir="auto"
              resetKey={`select-choice-value-${index}`}
              onCommit={(value) => patch(index, { value })}
            />
            <span className={s.mobileLabel}>Label (optional)</span>
            <TextField
              bare
              label={`Choice ${index + 1} label`}
              value={row.label}
              dir="auto"
              resetKey={`select-choice-label-${index}`}
              onCommit={(label) => patch(index, { label })}
            />
            <Button
              variant="danger"
              size="sm"
              className={s.remove}
              aria-label={`Remove choice ${index + 1}`}
              onClick={() => {
                setRows((current) => current.filter((_, at) => at !== index));
                setError(null);
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      {error !== null && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {connectedFileCount > 0 && (
        <p className={s.warning} role="status">
          Connected data files and value rules may need updating after these choices change.
        </p>
      )}
      <div className={s.bottom}>
        <span>{rows.length} choices</span>
        <Button
          variant="secondary"
          onClick={() => {
            setRows((current) => {
              let n = current.length + 1;
              while (current.some((row) => row.value === `option${n}`)) n++;
              return [...current, { value: `option${n}`, label: '' }];
            });
            setError(null);
          }}
        >
          Add choice
        </Button>
      </div>
    </Modal>
  );
}
