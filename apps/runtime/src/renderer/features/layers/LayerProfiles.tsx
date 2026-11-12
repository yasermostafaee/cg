import { useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import {
  LayerProfileSchema,
  defaultLayerAlias,
  fixedBankSlots,
  isolateText,
  type FixedLayerBank,
  type LayerProfile,
  type StackLoadProfileResult,
} from '@cg/shared-ipc';
import { retainedFromStackItem, type StackItemState } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import { pickFile } from '../../ui/pickFile.js';
import { saveFile } from '../../ui/saveFile.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';

const refusalCopy = {
  'on-air': 'Stop the graphics on this channel before loading a profile.',
  'not-declared': 'This channel has no configured layers.',
  'no-loadable-rows': 'None of the rows in this file can be loaded on this channel.',
} as const;

const issueCopy: Readonly<Record<string, string>> = {
  'unknown-template': 'Template is missing from this channel.',
  'not-fixed': 'This layer is outside the configured layers.',
  'wrong-bank': 'The template needs a different type of layer.',
  'fixed-slot-taken': 'Another item holds this layer.',
  'layer-occupied': 'Clear this layer before replacing it with a profile.',
};

function layerIssue(reason: string): string {
  return issueCopy[reason] ?? errorCodeMessage(reason) ?? 'Could not load this row.';
}

function loadNotice(result: StackLoadProfileResult, includesShortcuts: boolean): string {
  const loaded = `Loaded ${String(result.loaded)} ${result.loaded === 1 ? 'layer' : 'layers'}.`;
  if (result.shortcuts?.status === 'admin-required') {
    return `${loaded} Shortcuts skipped. Station admin access is required.`;
  }
  if (result.shortcuts?.status === 'invalid') {
    return `${loaded} Shortcuts skipped. ${result.shortcuts.message}`;
  }
  if (includesShortcuts && result.shortcuts === undefined) {
    return `${loaded} Shortcuts skipped. This CG Bridge cannot restore them.`;
  }
  return loaded;
}

function reportLoadedProfile(result: StackLoadProfileResult, includesShortcuts: boolean): void {
  const message = loadNotice(result, includesShortcuts);
  const skippedShortcuts =
    result.shortcuts === undefined ? includesShortcuts : result.shortcuts.status !== 'restored';
  if (result.issues.length === 0 && !skippedShortcuts) {
    reportCommandSuccess(message);
    return;
  }
  const detail = result.issues
    .map(({ layer, label, reason }) => {
      const name = label ? ` · ${isolateText(label)}` : '';
      return `Layer ${String(layer)}${name} — ${layerIssue(reason)}`;
    })
    .join(' ');
  reportCommandError(message, { detail });
}

export function LayerProfiles({
  bank,
  snapshot,
}: {
  bank: FixedLayerBank;
  snapshot: readonly StackItemState[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ name: string; profile: LayerProfile } | null>(null);
  const [result, setResult] = useState<StackLoadProfileResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { channel } = bank;

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    setResult(null);
    try {
      const layers = new Set(fixedBankSlots(bank).map(({ layer }) => layer));
      const items = snapshot.flatMap((item) => {
        const slot = item.slot;
        if (slot?.channel !== channel || !layers.has(slot.layer)) return [];
        const layer = String(slot.layer);
        const label =
          bank.aliases?.[layer] ?? bank.low.aliases?.[layer] ?? defaultLayerAlias(bank, slot.layer);
        return [
          {
            ...retainedFromStackItem(item),
            // A profile describes the next Take, not a still-resident programme page.
            ...(item.framePlacementsPendingReset === true && { framePlacements: [] }),
            layer: slot.layer,
            label,
          },
        ];
      });
      // The file schema drops live runtime state and retains only portable operator intent.
      const profile = LayerProfileSchema.parse({
        kind: 'apasai-cg-layer-profile',
        version: 1,
        layerShortcuts: {
          shortcuts: bank.shortcuts,
          nextShortcuts: bank.nextShortcuts,
          spaceShortcut: bank.spaceShortcut,
        },
        items,
      });
      const outcome = await saveFile(
        new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }),
        `CG-CH${String(channel)}-profile.json`,
        'APASAI CG layer profile',
        '.json',
      );
      if (outcome.kind === 'saved') setNotice(`Saved ${outcome.handle.name}.`);
      if (outcome.kind === 'download') setNotice('Profile download started.');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save the profile.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (): Promise<void> => {
    const input = picker.current;
    if (busy || input === null) return;
    setProblem(null);
    setNotice(null);
    setResult(null);
    setBusy(true);
    let file: File | null = null;
    try {
      file = await pickFile(input);
      if (file === null) {
        setNotice('File selection cancelled.');
        return;
      }
      setSelected(null);
      const contents: unknown = JSON.parse(await file.text());
      setSelected({ name: file.name, profile: LayerProfileSchema.parse(contents) });
    } catch {
      setProblem(
        file === null
          ? 'Could not open the profile file chooser.'
          : 'This is not a valid APASAI CG layer profile.',
      );
    } finally {
      setBusy(false);
    }
  };

  const load = async (): Promise<void> => {
    if (selected === null || busy) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    setResult(null);
    try {
      const response = await window.cg.stack.loadProfile({ channel, profile: selected.profile });
      if (response.refusal !== undefined) {
        setResult(response);
        return;
      }
      reportLoadedProfile(response, selected.profile.layerShortcuts !== undefined);
      setOpen(false);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load the profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="neutral"
        aria-label="Layer profiles"
        title="Save or load layer profiles"
        onClick={() => {
          setSelected(null);
          setResult(null);
          setProblem(null);
          setNotice(null);
          setOpen(true);
        }}
      >
        <Icon icon={FolderOpen} size={14} /> Profiles
      </Button>
      {open && (
        <Modal
          title="Layer profiles"
          message={
            problem !== null
              ? { role: 'refusal', text: problem }
              : notice !== null
                ? { role: 'notice', text: notice }
                : result?.refusal !== undefined
                  ? { role: 'refusal', text: refusalCopy[result.refusal] }
                  : []
          }
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          footer={
            <ModalAction
              actionRole="primary"
              disabled={busy || selected === null}
              onClick={() => void load()}
            >
              Load profile
            </ModalAction>
          }
        >
          <p>Channel {String(channel)}</p>
          <Button variant="neutral" disabled={busy} onClick={() => void save()}>
            Save profile…
          </Button>
          <Button variant="neutral" disabled={busy} onClick={() => void choose()}>
            Choose profile…
          </Button>
          <FileInput
            ref={picker}
            accept=".json,application/json"
            aria-label="Profile file"
            hidden
          />
          {selected !== null && (
            <>
              <p>
                Load <IsolatedName>{selected.name}</IsolatedName> and replace prepared layers on
                channel {String(channel)}?
              </p>
              {selected.profile.layerShortcuts !== undefined && (
                <p>This profile includes keyboard shortcuts.</p>
              )}
            </>
          )}
          {result !== null && result.issues.length > 0 && (
            <ul>
              {result.issues.map(({ layer, label, reason }, index) => (
                <li key={`${String(layer)}:${String(index)}`}>
                  Layer {String(layer)}
                  {label ? (
                    <>
                      {' '}
                      · <IsolatedName>{label}</IsolatedName>
                    </>
                  ) : null}
                  {' — '}
                  {layerIssue(reason)}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
