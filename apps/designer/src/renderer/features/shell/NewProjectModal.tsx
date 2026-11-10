import { useState } from 'react';
import type { FrameRate, TemplateType } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { NumberField, RealtimeNumberInput } from '../inspector/controls.js';
import { Select } from '../../ui/Select.js';
import { Modal, ModalButton } from './Modal.js';
import {
  normalizeProjectFrames,
  projectFramesFromSeconds,
  projectSecondsFromFrames,
} from './new-project-duration.js';
import {
  PROJECT_FRAME_RATES,
  PROJECT_RESOLUTION_PRESETS,
  projectResolution,
  type ProjectResolutionPresetKey,
} from './new-project-options.js';
import {
  readNewProjectDefaults,
  saveNewProjectDefaults,
  type NewProjectDefaults,
} from '../settings/new-project-defaults.js';
import * as s from './NewProjectModal.css.js';

interface Props {
  onClose: () => void;
  defaultsOnly?: boolean;
  onDefaultsSaved?: (defaults: NewProjectDefaults) => void;
}

// Template choice was removed from the modal — `projects.create` still
// needs a TemplateType, so every new project ships as 'custom' and the
// operator picks a starter from the Library panel afterwards if needed.
const DEFAULT_TEMPLATE_TYPE: TemplateType = 'custom';

/**
 * Modal dialog for the "New project" landing action (D-007). Collects
 * a name, resolution preset (or custom W×H), frame rate, and template
 * type, then calls `projects.create` with the overrides and switches
 * to the Studio view.
 */
export function NewProjectModal({
  onClose,
  defaultsOnly = false,
  onDefaultsSaved,
}: Props): JSX.Element {
  const [form, setForm] = useState(readNewProjectDefaults);
  const [showDefaults, setShowDefaults] = useState(false);
  const { name, presetKey, customW, customH, frameRate, durationFrames } = form;
  const isCustom = presetKey === 'custom';

  function update(patch: Partial<NewProjectDefaults>): void {
    setForm((previous) => ({ ...previous, ...patch }));
  }

  async function confirm(): Promise<void> {
    const projectName = name.trim() || 'Untitled';
    if (defaultsOnly) {
      const custom = projectResolution('custom', customW, customH);
      const saved = {
        ...form,
        name: projectName,
        customW: custom.width,
        customH: custom.height,
        durationFrames: normalizeProjectFrames(durationFrames),
      };
      saveNewProjectDefaults(saved);
      onDefaultsSaved?.(saved);
      onClose();
      return;
    }
    const result = await window.cg.projects.create({
      name: projectName,
      templateType: DEFAULT_TEMPLATE_TYPE,
      resolution: projectResolution(presetKey, customW, customH),
      frameRate,
      durationFrames: normalizeProjectFrames(durationFrames),
    });
    designerStore.setScene(result.scene, result.path);
    onClose();
  }

  if (showDefaults) {
    return (
      <NewProjectModal
        defaultsOnly
        onClose={() => setShowDefaults(false)}
        onDefaultsSaved={setForm}
      />
    );
  }

  return (
    <Modal
      title={defaultsOnly ? 'Project defaults' : 'New project'}
      onClose={onClose}
      footer={
        <>
          {!defaultsOnly && (
            <ModalButton onClick={() => setShowDefaults(true)}>Project defaults…</ModalButton>
          )}
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={() => void confirm()}>
            {defaultsOnly ? 'Save defaults' : 'Create'}
          </ModalButton>
        </>
      }
    >
      <div className={s.row}>
        <span className={s.label}>Name</span>
        <input
          className={s.input}
          value={name}
          onChange={(e) => update({ name: e.target.value })}
          autoFocus
          aria-label="Project name"
        />
      </div>

      <div className={s.row}>
        <span className={s.label}>Resolution</span>
        <Select
          className={s.input}
          value={presetKey}
          onChange={(e) => update({ presetKey: e.target.value as ProjectResolutionPresetKey })}
          aria-label="Resolution preset"
        >
          {PROJECT_RESOLUTION_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      {isCustom && (
        <div className={s.row}>
          <span className={s.label}>Custom W × H</span>
          <div className={s.inlinePair}>
            <RealtimeNumberInput
              className={s.input}
              min={1}
              step={1}
              value={customW}
              onCommit={(value) => update({ customW: value })}
              ariaLabel="Width"
            />
            <span style={{ color: colors.textMuted }}>×</span>
            <RealtimeNumberInput
              className={s.input}
              min={1}
              step={1}
              value={customH}
              onCommit={(value) => update({ customH: value })}
              ariaLabel="Height"
            />
          </div>
        </div>
      )}

      <div className={s.row}>
        <span className={s.label}>Frame rate</span>
        <Select
          className={s.input}
          value={String(frameRate)}
          onChange={(e) => update({ frameRate: Number(e.target.value) as FrameRate })}
          aria-label="Frame rate"
        >
          {PROJECT_FRAME_RATES.map((f) => (
            <option key={f} value={String(f)}>
              {f} fps
            </option>
          ))}
        </Select>
      </div>

      <div className={s.row}>
        <span className={s.label}>Total frames</span>
        <NumberField
          bare
          label="Total frames"
          min={1}
          step={1}
          value={durationFrames}
          onCommit={(frames) => update({ durationFrames: normalizeProjectFrames(frames) })}
        />
      </div>

      <div className={s.row}>
        <span className={s.label}>Duration</span>
        <NumberField
          bare
          label="Duration in seconds"
          min={1 / frameRate}
          step={0.1}
          value={projectSecondsFromFrames(durationFrames, frameRate)}
          onCommit={(seconds) =>
            update({ durationFrames: projectFramesFromSeconds(seconds, frameRate) })
          }
          suffix="s"
        />
      </div>
    </Modal>
  );
}
