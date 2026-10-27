import { useState, useSyncExternalStore } from 'react';
import { PencilLine, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { TextField } from '../inspector/controls.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import {
  addDesignerDelimiter,
  designerDelimitersVersion,
  listDesignerDelimiters,
  removeDesignerDelimiter,
  resetDesignerDelimiters,
  subscribeDesignerDelimiters,
  updateDesignerDelimiter,
} from './designerDelimiterStore.js';
import * as s from './DesignerDelimitersModal.css.js';

export function DesignerDelimitersModal({ onClose }: { onClose: () => void }): JSX.Element {
  useSyncExternalStore(subscribeDesignerDelimiters, designerDelimitersVersion);
  const delimiters = listDesignerDelimiters();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);

  const clearForm = (): void => {
    setFormOpen(false);
    setEditingId(null);
    setLabel('');
    setValue('');
    setError(null);
    setFormKey((key) => key + 1);
  };

  const startAdd = (): void => {
    setFormOpen(true);
    setEditingId(null);
    setLabel('');
    setValue('');
    setError(null);
    setFormKey((key) => key + 1);
  };

  const save = (): void => {
    const refusal =
      editingId === null
        ? addDesignerDelimiter(label, value)
        : updateDesignerDelimiter(editingId, label, value);
    if (refusal !== null) {
      setError(refusal);
      return;
    }
    clearForm();
  };

  return (
    <Modal
      title="Manage delimiters"
      ariaLabel="Manage delimiters"
      width="min(720px, 94vw)"
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>Done</ModalButton>}
    >
      <div className={s.header}>
        <div className={s.intro}>
          <strong>Saved choices</strong>
          <span>Reuse the same split rules when a text file supplies a list field.</span>
        </div>
        <Button size="sm" variant="primary" onClick={startAdd}>
          <Icon icon={Plus} size={14} />
          New delimiter
        </Button>
      </div>

      <div className={s.tableWrap}>
        <div className={s.tableSummary}>
          <span>{String(delimiters.length)} delimiters</span>
          <span>Templates store the split value, not a link to this list.</span>
        </div>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Split value</th>
              <th scope="col" className={s.actionHeading}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {delimiters.map((delimiter) => (
              <tr key={delimiter.id} data-delimiter-id={delimiter.id}>
                <td>
                  <bdi>{delimiter.label}</bdi>
                </td>
                <td>
                  <code className={s.delimiter} dir="ltr">
                    {delimiter.value}
                  </code>
                </td>
                <td>
                  <div className={s.actions}>
                    {removeId === delimiter.id ? (
                      <div className={s.confirmGroup}>
                        <span>Remove?</span>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const refusal = removeDesignerDelimiter(delimiter.id);
                            setRemoveId(null);
                            setError(refusal);
                            if (editingId === delimiter.id && refusal === null) clearForm();
                          }}
                        >
                          Confirm remove
                        </Button>
                        <Button size="sm" variant="bare" onClick={() => setRemoveId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Control
                          size="sm"
                          variant="secondary"
                          aria-label={`Edit delimiter ${delimiter.label}`}
                          title="Edit delimiter"
                          onClick={() => {
                            setFormOpen(true);
                            setEditingId(delimiter.id);
                            setLabel(delimiter.label);
                            setValue(delimiter.value);
                            setError(null);
                            setFormKey((key) => key + 1);
                          }}
                        >
                          <Icon icon={PencilLine} size={14} />
                        </Control>
                        <Control
                          size="sm"
                          variant="ghost"
                          className={s.deleteControl}
                          aria-label={`Remove delimiter ${delimiter.label}`}
                          title="Remove delimiter"
                          onClick={() => setRemoveId(delimiter.id)}
                        >
                          <Icon icon={Trash2} size={14} />
                        </Control>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <section
          className={s.form}
          aria-label={editingId === null ? 'Add delimiter' : 'Edit delimiter'}
        >
          <div className={s.formHeading}>
            <div>
              <h3 className={s.formTitle}>
                {editingId === null ? 'New delimiter' : 'Edit delimiter'}
              </h3>
              <p>Name the choice and enter exactly what separates two items.</p>
            </div>
          </div>
          <div className={s.formFields}>
            <TextField
              label="Name"
              value={label}
              ariaLabel="Delimiter name"
              resetKey={`delimiter-label-${String(formKey)}`}
              onCommit={setLabel}
            />
            <TextField
              label="Split value"
              value={value}
              ariaLabel="Delimiter split value"
              resetKey={`delimiter-value-${String(formKey)}`}
              onCommit={setValue}
            />
          </div>
          <p className={s.formHelp}>
            Use <code>\n</code> for a new line or <code>\t</code> for a tab. Multi-character values
            are allowed.
          </p>
          {error !== null && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <div className={s.formActions}>
            <Button size="sm" variant="bare" onClick={clearForm}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={save}>
              {editingId === null ? 'Add delimiter' : 'Save delimiter'}
            </Button>
          </div>
        </section>
      )}

      <div className={s.bottom}>
        <div className={s.resetCopy}>
          <Icon icon={RotateCcw} size={15} />
          <span>Restore the original delimiter choices</span>
        </div>
        {resetPending ? (
          <div className={s.actions}>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                resetDesignerDelimiters();
                setResetPending(false);
                clearForm();
              }}
            >
              Confirm reset
            </Button>
            <Button size="sm" variant="bare" onClick={() => setResetPending(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="bare" onClick={() => setResetPending(true)}>
            Reset to defaults
          </Button>
        )}
      </div>
    </Modal>
  );
}
