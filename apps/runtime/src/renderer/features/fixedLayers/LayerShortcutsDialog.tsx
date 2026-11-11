import { useState, type KeyboardEvent } from 'react';
import { LAYER_SHORTCUT_VERBS, type LayerShortcuts, type LayerShortcutVerb } from '@cg/shared-ipc';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { layerShortcutChord, layerShortcutLabel } from './layer-shortcuts.js';

const labels = { play: 'Play', stop: 'Stop', clear: 'Clear' } as const;

interface ShortcutRow {
  layer: number;
  name: string;
}

export function LayerShortcutsDialog({
  rows,
  shortcuts,
  onClose,
  onDone,
}: {
  rows: readonly ShortcutRow[];
  shortcuts: LayerShortcuts;
  onClose: () => void;
  onDone: (shortcuts: LayerShortcuts) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(shortcuts);
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function setShortcut(layer: number, verb: LayerShortcutVerb, chord: string | null): void {
    const row = { ...draft[layer] };
    if (chord === null) delete row[verb];
    else row[verb] = chord;
    const next = { ...draft };
    if (Object.keys(row).length === 0) delete next[layer];
    else next[layer] = row;
    setDraft(next);
    setRecording(null);
    setMessage(null);
  }

  function record(event: KeyboardEvent<HTMLButtonElement>, layer: number, verb: LayerShortcutVerb) {
    if (recording !== `${String(layer)}:${verb}`) return;
    if (['Tab', 'Enter', 'Space'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      setRecording(null);
      setMessage(null);
      return;
    }
    if (/^(?:Alt|Control|Shift|Meta)(?:Left|Right)$/.test(event.code) || event.repeat) return;
    const chord = layerShortcutChord(event.nativeEvent);
    if (chord === null) {
      setMessage('Press a function key or a key combination.');
      return;
    }
    for (const row of rows) {
      const conflict = LAYER_SHORTCUT_VERBS.find(
        (action) =>
          (row.layer !== layer || action !== verb) && draft[row.layer]?.[action] === chord,
      );
      if (conflict !== undefined) {
        setMessage(
          `${layerShortcutLabel(chord)} is assigned to ${labels[conflict]} on layer ${String(row.layer)}.`,
        );
        return;
      }
    }
    setShortcut(layer, verb, chord);
  }

  return (
    <Modal
      title="Layer shortcuts"
      layer="sub"
      onClose={onClose}
      message={message === null ? [] : { role: 'refusal', text: message }}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onClose}>
            Cancel
          </ModalAction>
          <ModalAction actionRole="primary" onClick={() => onDone(draft)}>
            Done
          </ModalAction>
        </>
      }
    >
      <div className="cg-table-scroll">
        <table className="cg-table" aria-label="Fixed layer shortcuts">
          <thead>
            <tr>
              <th scope="col">Layer</th>
              {LAYER_SHORTCUT_VERBS.map((verb) => (
                <th key={verb} scope="col">
                  {labels[verb]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.layer}>
                <th scope="row">
                  <IsolatedName>{row.name}</IsolatedName> <span>· {row.layer}</span>
                </th>
                {LAYER_SHORTCUT_VERBS.map((verb) => {
                  const chord = draft[row.layer]?.[verb];
                  const key = `${String(row.layer)}:${verb}`;
                  const active = recording === key;
                  const label = `${labels[verb]} shortcut for layer ${String(row.layer)}`;
                  return (
                    <td key={verb}>
                      <Button
                        variant="neutral"
                        active={active}
                        aria-label={label}
                        aria-pressed={active}
                        onClick={() => {
                          setMessage(null);
                          setRecording(active ? null : key);
                        }}
                        onBlur={() => setRecording((value) => (value === key ? null : value))}
                        onKeyDown={(event) => record(event, row.layer, verb)}
                      >
                        {active
                          ? 'Press keys…'
                          : chord === undefined
                            ? 'Assign'
                            : layerShortcutLabel(chord)}
                      </Button>
                      {chord !== undefined && (
                        <Button
                          variant="ghost"
                          aria-label={`Remove ${label}`}
                          onClick={() => setShortcut(row.layer, verb, null)}
                        >
                          <Icon icon={X} size={14} />
                        </Button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
