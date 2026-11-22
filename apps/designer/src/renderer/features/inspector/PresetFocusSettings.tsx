import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  ControlLiveLayoutSwitchModeSchema,
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  FrameTransitionSchema,
  InputTransitionDirectionSchema,
  type ControlLiveLayoutEffects,
  type DesignerPresetFocus,
  type Look,
  type Scene,
} from '@cg/shared-schema';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import { scopeSceneToComposition } from '../../state/scene-doc.js';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { CheckRow } from './DynamicDataSection.js';
import { NumberField, SelectField } from './controls.js';

export function PresetFocusSettings({
  project,
  preset,
  homeId,
}: {
  project: Scene;
  preset: Look;
  homeId: string | null | undefined;
}): JSX.Element | null {
  const scene = homeId === null ? project : scopeSceneToComposition(project, homeId ?? null);
  if (scene === null) return null;
  const live = buildTemplateLiveSources(scene);
  const looks = live.looks ?? [];
  const current = looks.find(({ id }) => id === preset.id);
  const plateIds = Object.keys(current?.rects ?? {});
  if (plateIds.length < 2) return null;

  const settings: DesignerPresetFocus = preset.presetFocus ?? {
    effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
    targets: {},
  };
  const { focus, switch: change } = settings.effects;
  const targetsInUse = new Set(
    looks
      .filter(({ id }) => id !== preset.id)
      .flatMap(({ presetFocus }) => Object.values(presetFocus?.targets ?? {})),
  );
  const setEffects = (effects: ControlLiveLayoutEffects): void =>
    designerStore.setPresetFocus(preset.id, { ...settings, effects });

  return (
    <CollapseSection title="Focus effects">
      {plateIds.map((plateId, index) => {
        const choices = looks.filter(
          ({ id, rects }) =>
            id !== live.defaultLookId &&
            !targetsInUse.has(id) &&
            Object.keys(rects).length === 1 &&
            rects[plateId] !== undefined,
        );
        const destination = settings.targets[plateId];
        return (
          <SelectField
            key={plateId}
            label={'Focus ' + String(index + 1)}
            value={choices.some(({ id }) => id === destination) ? (destination ?? '') : ''}
            options={['', ...choices.map(({ id }) => id)]}
            labels={['No destination', ...choices.map(({ name }) => name)]}
            onCommit={(id) => {
              const targets = { ...settings.targets };
              if (id === '') delete targets[plateId];
              else targets[plateId] = id;
              designerStore.setPresetFocus(preset.id, { ...settings, targets });
            }}
          />
        );
      })}
      <SelectField
        label="Focus and Return motion"
        value={focus.motion}
        options={FrameTransitionSchema.shape.motion.options}
        labels={['Cut', 'Linear', 'Ease in', 'Ease out', 'Ease in/out', 'Bounce', 'Elastic']}
        onCommit={(motion) => setEffects({ ...settings.effects, focus: { ...focus, motion } })}
      />
      <CheckRow
        label="Focus and Return fade"
        checked={focus.fade}
        onChange={(fade) => setEffects({ ...settings.effects, focus: { ...focus, fade } })}
      />
      <NumberField
        label="Focus duration (ms)"
        value={focus.durationMs}
        min={FRAME_TRANSITION_MIN_MS}
        max={FRAME_TRANSITION_MAX_MS}
        step={20}
        onCommit={(value) =>
          setEffects({ ...settings.effects, focus: { ...focus, durationMs: Math.round(value) } })
        }
      />
      <SelectField
        label="Switch focused plate"
        value={change.mode}
        options={ControlLiveLayoutSwitchModeSchema.options}
        labels={['Focus and Return motion', 'Cut', 'Fade', 'Push', 'Slide over']}
        onCommit={(mode) => setEffects({ ...settings.effects, switch: { ...change, mode } })}
      />
      {change.mode !== 'cut' && (
        <NumberField
          label="Switch duration (ms)"
          value={change.durationMs}
          min={FRAME_TRANSITION_MIN_MS}
          max={FRAME_TRANSITION_MAX_MS}
          step={20}
          onCommit={(value) =>
            setEffects({
              ...settings.effects,
              switch: { ...change, durationMs: Math.round(value) },
            })
          }
        />
      )}
      {(change.mode === 'push' || change.mode === 'slide-over') && (
        <SelectField
          label="Switch direction"
          value={change.direction}
          options={InputTransitionDirectionSchema.options}
          labels={['From left', 'From right', 'From top', 'From bottom']}
          onCommit={(direction) =>
            setEffects({ ...settings.effects, switch: { ...change, direction } })
          }
        />
      )}
    </CollapseSection>
  );
}
