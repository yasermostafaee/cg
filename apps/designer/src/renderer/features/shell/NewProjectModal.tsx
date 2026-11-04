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
  DEFAULT_PROJECT_RESOLUTION_PRESET,
  PROJECT_FRAME_RATES,
  PROJECT_RESOLUTION_PRESETS,
  projectResolution,
  type ProjectResolutionPresetKey,
} from './new-project-options.js';
import * as s from './NewProjectModal.css.js';

interface Props {
  onClose: () => void;
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
export function NewProjectModal({ onClose }: Props): JSX.Element {
  const [name, setName] = useState('Untitled');
  const [presetKey, setPresetKey] = useState<ProjectResolutionPresetKey>(
    DEFAULT_PROJECT_RESOLUTION_PRESET,
  );
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [frameRate, setFrameRate] = useState<FrameRate>(50);
  const [durationFrames, setDurationFrames] = useState(50);
  const isCustom = presetKey === 'custom';

  async function confirm(): Promise<void> {
    const resolution = projectResolution(presetKey, customW, customH);
    const result = await window.cg.projects.create({
      name: name.trim().length > 0 ? name.trim() : 'Untitled',
      templateType: DEFAULT_TEMPLATE_TYPE,
      resolution,
      frameRate,
      durationFrames: normalizeProjectFrames(durationFrames),
    });
    designerStore.setScene(result.scene, result.path);
    onClose();
  }

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={() => void confirm()}>
            Create
          </ModalButton>
        </>
      }
    >
      <div className={s.row}>
        <span className={s.label}>Name</span>
        <input
          className={s.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          aria-label="Project name"
        />
      </div>

      <div className={s.row}>
        <span className={s.label}>Resolution</span>
        <Select
          className={s.input}
          value={presetKey}
          onChange={(e) => setPresetKey(e.target.value as ProjectResolutionPresetKey)}
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
              onCommit={setCustomW}
              ariaLabel="Width"
            />
            <span style={{ color: colors.textMuted }}>×</span>
            <RealtimeNumberInput
              className={s.input}
              min={1}
              step={1}
              value={customH}
              onCommit={setCustomH}
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
          onChange={(e) => setFrameRate(Number(e.target.value) as FrameRate)}
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
          onCommit={(frames) => setDurationFrames(normalizeProjectFrames(frames))}
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
          onCommit={(seconds) => setDurationFrames(projectFramesFromSeconds(seconds, frameRate))}
          suffix="s"
        />
      </div>
    </Modal>
  );
}
