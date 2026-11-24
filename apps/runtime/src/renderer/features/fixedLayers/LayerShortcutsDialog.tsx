import { useFeedbackText, useUiText } from '../../i18n/locale.js';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  LAYER_SHORTCUT_VERBS,
  LAYER_SPACE_SHORTCUT,
  type LayerShortcutBindings,
  type LayerShortcutVerb,
} from '@cg/shared-ipc';
import { X } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction, type ModalMessage } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { LayerShortcutsToggle } from '../layers/LayerShortcutsToggle.js';
import { layerShortcutChord, layerShortcutLabel } from './layer-shortcuts.js';
import { useLayerAltF4 } from './useLayerAltF4.js';
import './LayerShortcutsDialog.css';

const labels = { play: 'Play', next: 'Next', stop: 'Stop', clear: 'Clear' } as const;
const conflictMessages = {
  play: '{shortcut} is assigned to Play on layer {layer}.',
  next: '{shortcut} is assigned to Next on layer {layer}.',
  stop: '{shortcut} is assigned to Stop on layer {layer}.',
  clear: '{shortcut} is assigned to Clear on layer {layer}.',
} as const;

interface ShortcutRow {
  layer: number;
  name: string;
}

type ShortcutDraft = Record<string, Partial<Record<LayerShortcutVerb, string | null>>>;

export function LayerShortcutsDialog({
  rows,
  shortcuts,
  canAssignNext,
  canAssignSpace,
  onClose,
  onApply,
}: {
  rows: readonly ShortcutRow[];
  shortcuts: LayerShortcutBindings;
  canAssignNext: boolean;
  canAssignSpace: boolean;
  onClose: () => void;
  onApply: (shortcuts: LayerShortcutBindings) => Promise<string | null>;
}): JSX.Element {
  const localizeUi = useUiText();
  const localizeFeedback = useFeedbackText();
  const verbs = LAYER_SHORTCUT_VERBS.filter((verb) => verb !== 'next' || canAssignNext);
  const [draft, setDraft] = useState<ShortcutDraft>({});
  const [recording, setRecording] = useState<string | null>(null);
  const recordedSpace = useRef(false);
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
          ? { role: 'notice', text: localizeFeedback('Layer shortcuts applied.') }
          : { role: 'refusal', text: localizeFeedback(refusal) },
      );
    } catch (error) {
      setMessage({
        role: 'refusal',
        text: localizeFeedback(error instanceof Error ? error.message : 'Request failed.'),
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
    if (event.code === LAYER_SPACE_SHORTCUT && recordedSpace.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (recording !== `${String(layer)}:${verb}`) return;
    if (event.code === 'Tab' || event.code === 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === LAYER_SPACE_SHORTCUT) recordedSpace.current = true;
    if (event.code === 'Escape') {
      setRecording(null);
      setMessage(null);
      return;
    }
    if (/^(?:Alt|Control|Shift|Meta)(?:Left|Right)$/.test(event.code) || event.repeat) return;
    const chord = layerShortcutChord(event.nativeEvent);
    if (chord === null) {
      setMessage({
        role: 'refusal',
        text: localizeFeedback('Press a function key or a key combination.'),
      });
      return;
    }
    if (chord === LAYER_SPACE_SHORTCUT && !canAssignSpace) {
      setMessage({
        role: 'refusal',
        text: localizeFeedback('Assigning Space requires a newer CG Bridge.'),
      });
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
          text: localizeFeedback(conflictMessages[conflict], {
            shortcut:
              chord === LAYER_SPACE_SHORTCUT
                ? localizeFeedback('Space')
                : layerShortcutLabel(chord),
            layer: row.layer,
          }),
        });
        return;
      }
    }
    setShortcut(layer, verb, chord);
  }

  return (
    <Modal
      title={localizeUi('Layer shortcuts')}
      layer="sub"
      size="wide"
      onClose={onClose}
      busy={busy}
      message={message ?? []}
      footer={
        <>
          <ModalAction actionRole="cancel" disabled={busy || !dirty} onClick={revert}>
            {localizeUi('Revert')}
          </ModalAction>
          <ModalAction actionRole="primary" disabled={busy || !dirty} onClick={() => void apply()}>
            {localizeUi('Apply')}
          </ModalAction>
        </>
      }
    >
      <LayerShortcutsToggle />
      <div className="cg-table-scroll cg-layer-shortcut-scroll">
        <table
          className="cg-table cg-layer-shortcut-table"
          aria-label={localizeUi('Fixed layer shortcuts')}
        >
          <thead>
            <tr>
              <th scope="col">{localizeUi('Layer')}</th>
              {verbs.map((verb) => (
                <th key={verb} scope="col">
                  {localizeUi(labels[verb])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.layer}>
                <th scope="row" title={row.name}>
                  <span className="cg-layer-shortcut-row-name">
                    <bdi dir="ltr">{row.layer}</bdi>
                    <span aria-hidden="true"> · </span>
                    <IsolatedName className="cg-layer-shortcut-alias" alignWithInterface>
                      {row.name}
                    </IsolatedName>
                  </span>
                </th>
                {verbs.map((verb) => {
                  const chord = bindings[row.layer]?.[verb];
                  const key = `${String(row.layer)}:${verb}`;
                  const active = recording === key;
                  const label = localizeUi('{verb} shortcut for layer {layer}', {
                    verb: localizeUi(labels[verb]),
                    layer: row.layer,
                  });
                  const assigned =
                    chord === LAYER_SPACE_SHORTCUT
                      ? localizeUi('Space')
                      : chord === undefined
                        ? undefined
                        : layerShortcutLabel(chord);
                  return (
                    <td key={verb}>
                      <div className="cg-layer-shortcut-cell">
                        <Button
                          variant="neutral"
                          className="cg-layer-shortcut-record"
                          active={active}
                          disabled={busy}
                          aria-label={label}
                          aria-description={
                            active
                              ? localizeUi('Press keys to record')
                              : (assigned ?? localizeUi('Unassigned'))
                          }
                          aria-pressed={active}
                          title={assigned}
                          onClick={() => {
                            setMessage(null);
                            setRecording(active ? null : key);
                          }}
                          onBlur={() => {
                            recordedSpace.current = false;
                            setRecording((value) => (value === key ? null : value));
                          }}
                          onKeyDown={(event) => record(event, row.layer, verb)}
                          onKeyUp={(event) => {
                            if (event.code !== LAYER_SPACE_SHORTCUT || !recordedSpace.current)
                              return;
                            recordedSpace.current = false;
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          <span>
                            {active ? (
                              localizeUi('Press keys…')
                            ) : (
                              <bdi dir={chord === LAYER_SPACE_SHORTCUT ? 'auto' : 'ltr'}>
                                {assigned ?? '—'}
                              </bdi>
                            )}
                          </span>
                        </Button>
                        {chord !== undefined && (
                          <Button
                            variant="ghost"
                            className="cg-layer-shortcut-remove"
                            disabled={busy}
                            aria-label={localizeUi('Remove {name}', { name: label })}
                            onClick={() => setShortcut(row.layer, verb, null)}
                          >
                            <Icon icon={X} size={14} />
                          </Button>
                        )}
                      </div>
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
