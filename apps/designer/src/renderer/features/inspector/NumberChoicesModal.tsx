import { useState } from 'react';
import { numberFieldValueAlias } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { NumberField, TextField } from './controls.js';
import {
  suggestNumberChoiceValue,
  validateNumberChoiceRows,
  type NumberChoiceEditorRow,
} from './number-choice-aliases.js';
import * as s from './NumberChoicesModal.css.js';

interface Props {
  values: readonly number[];
  labels: Readonly<Record<string, string>>;
  connectedFileCount?: number;
  onCancel: () => void;
  onSave: (values: readonly number[], labels: Readonly<Record<string, string>>) => void;
}

function initialRows(
  values: readonly number[],
  labels: Readonly<Record<string, string>>,
): NumberChoiceEditorRow[] {
  return values.map((value) => ({
    value: String(value),
    alias:
      numberFieldValueAlias({ allowedValues: values, allowedValueLabels: labels }, value) ?? '',
  }));
}

/** Row-based editor for numeric values and their operator-facing aliases. */
export function NumberChoicesModal({
  values,
  labels,
  connectedFileCount = 0,
  onCancel,
  onSave,
}: Props): JSX.Element {
  const [rows, setRows] = useState<NumberChoiceEditorRow[]>(() => initialRows(values, labels));
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<NumberChoiceEditorRow>): void {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
    setError(null);
  }

  function save(): void {
    const parsed = validateNumberChoiceRows(rows);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onSave(parsed.values, parsed.labels);
  }

  const aliasCount = rows.filter((row) => row.alias.trim() !== '').length;

  return (
    <Modal
      title="Edit number choices"
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
        <span>Alias (optional)</span>
        <span />
      </div>
      <div className={s.rows}>
        {rows.map((row, index) => (
          <div className={s.row} key={index}>
            <span className={s.mobileLabel}>Value</span>
            <NumberField
              bare
              label={`Choice ${index + 1} value`}
              value={Number(row.value)}
              digits="as-typed"
              onCommit={(value) => updateRow(index, { value: String(value) })}
            />
            <span className={s.mobileLabel}>Alias (optional)</span>
            <TextField
              bare
              label={`Choice ${index + 1} alias`}
              value={row.alias}
              dir="auto"
              placeholder={`alias${index + 1}`}
              resetKey={`number-choice-alias-${index}`}
              onCommit={(alias) => updateRow(index, { alias })}
            />
            <Button
              variant="danger"
              size="sm"
              className={s.remove}
              aria-label={`Remove choice ${index + 1}`}
              onClick={() => {
                setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
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
          {connectedFileCount === 1
            ? 'A connected data file may need replacement after these choices change.'
            : `${String(connectedFileCount)} connected data files may need replacement after these choices change.`}
        </p>
      )}

      <div className={s.bottom}>
        <span>
          {rows.length} {rows.length === 1 ? 'choice' : 'choices'} · {aliasCount}{' '}
          {aliasCount === 1 ? 'alias' : 'aliases'}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setRows((current) => [
              ...current,
              { value: suggestNumberChoiceValue(current), alias: '' },
            ]);
            setError(null);
          }}
        >
          Add choice
        </Button>
      </div>
    </Modal>
  );
}
