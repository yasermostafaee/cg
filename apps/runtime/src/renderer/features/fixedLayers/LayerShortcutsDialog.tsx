import { useState, type KeyboardEvent } from 'react';
import {
  LAYER_SHORTCUT_VERBS,
  type LayerShortcutBindings,
  type LayerShortcutVerb,
} from '@cg/shared-ipc';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction, type ModalMessage } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { layerShortcutChord, layerShortcutLabel } from './layer-shortcuts.js';
import { useLayerAltF4 } from './useLayerAltF4.js';

const labels = { play: 'Play', next: 'Next', stop: 'Stop', clear: 'Clear' } as const;

interface ShortcutRow {
  layer: number;
  name: string;
}

type ShortcutDraft = Record<string, Partial<Record<LayerShortcutVerb, string | null>>>;

export function LayerShortcutsDialog({
  rows,
  shortcuts,
  canAssignNext,
  onClose,
  onApply,
}: {
  rows: readonly ShortcutRow[];
  shortcuts: LayerShortcutBindings;
  canAssignNext: boolean;
  onClose: () => void;
  onApply: (shortcuts: LayerShortcutBindings) => Promise<string | null>;
}): JSX.Element {
  const verbs = LAYER_SHORTCUT_VERBS.filter((verb) => verb !== 'next' || canAssignNext);
  const [draft, setDraft] = useState<ShortcutDraft>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<ModalMessage | null>(null);
  const [busy, setBusy] = useState(false);
  // Overlay only edited cells on the latest settings from the station.
  const bindings = { ...shortcuts };
  for (const [layer, edits] of Object.entries(draft)) {
    const row = { ...bindings[layer] };
    for (const verb of verbs) {
      const chord = edits[verb];
      if (chord === null) delete row[verb];
      else if (chord !== undefined) row[verb] = chord;
    }
    bindings[layer] = row;
  }
  const dirty = rows.some(({ layer }) =>
    verbs.some((verb) => bindings[layer]?.[verb] !== shortcuts[layer]?.[verb]),
  );
  useLayerAltF4(recording !== null);

  function revert(): void {
    setDraft({});
    setRecording(null);
    setMessage(null);
  }

  async function apply(): Promise<void> {
    if (busy || !dirty) return;
    setBusy(true);
    setRecording(null);
    setMessage(null);
    try {
      const refusal = await onApply(bindings);
      if (refusal === null) setDraft({});
      setMessage(
        refusal === null
          ? { role: 'notice', text: 'Layer shortcuts applied.' }
          : { role: 'refusal', text: refusal },
      );
    } catch (error) {
      setMessage({
        role: 'refusal',
        text: error instanceof Error ? error.message : 'Request failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  function setShortcut(layer: number, verb: LayerShortcutVerb, chord: string | null): void {
    const row = { ...draft[layer] };
    if ((shortcuts[layer]?.[verb] ?? null) === chord) delete row[verb];
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
      setMessage({ role: 'refusal', text: 'Press a function key or a key combination.' });
      return;
    }
    for (const row of rows) {
      const conflict = LAYER_SHORTCUT_VERBS.find(
        (action) =>
          (row.layer !== layer || action !== verb) && bindings[row.layer]?.[action] === chord,
      );
      if (conflict !== undefined) {
        setMessage({
          role: 'refusal',
          text: `${layerShortcutLabel(chord)} is assigned to ${labels[conflict]} on layer ${String(row.layer)}.`,
        });
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
      busy={busy}
      message={message ?? []}
      footer={
        <>
          <ModalAction actionRole="cancel" disabled={busy || !dirty} onClick={revert}>
            Revert
          </ModalAction>
          <ModalAction actionRole="primary" disabled={busy || !dirty} onClick={() => void apply()}>
            Apply
          </ModalAction>
        </>
      }
    >
      <div className="cg-table-scroll">
        <table className="cg-table" aria-label="Fixed layer shortcuts">
          <thead>
            <tr>
              <th scope="col">Layer</th>
              {verbs.map((verb) => (
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
                {verbs.map((verb) => {
                  const chord = bindings[row.layer]?.[verb];
                  const key = `${String(row.layer)}:${verb}`;
                  const active = recording === key;
                  const label = `${labels[verb]} shortcut for layer ${String(row.layer)}`;
                  return (
                    <td key={verb}>
                      <Button
                        variant="neutral"
                        active={active}
                        disabled={busy}
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
                          disabled={busy}
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
