import {
  authoredLookEffect,
  CUT_LOOK_TRANSITION,
  FRAME_TRANSITION_DEFAULT_MS,
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  FrameTransitionSchema,
  InputTransitionDirectionSchema,
  type FrameTransition,
  type Look,
  type InputTransitionDirection,
} from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { NumberField, SelectField } from './controls.js';
import { CheckRow } from './DynamicDataSection.js';

const motions = FrameTransitionSchema.shape.motion.options;
const motionLabels: Record<FrameTransition['motion'], string> = {
  cut: 'Cut',
  linear: 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in/out',
  bounce: 'Bounce',
  elastic: 'Elastic',
};

const directions = ['', ...InputTransitionDirectionSchema.options] as const;
const directionRows = [
  {
    field: 'enterDirection',
    label: 'Arriving plates',
    labels: ['Fade', 'From left', 'From right', 'From top', 'From bottom'],
  },
  {
    field: 'exitDirection',
    label: 'Departing plates',
    labels: ['Fade', 'Slide left', 'Slide right', 'Slide up', 'Slide down'],
  },
] as const;

const defaultEffect: FrameTransition = {
  motion: 'cut',
  fade: false,
  durationMs: FRAME_TRANSITION_DEFAULT_MS,
};

export function PresetEffectSettings({ preset }: { preset: Look }): JSX.Element {
  const effect = authoredLookEffect(preset.entered);
  const movesOrFades = effect !== undefined && (effect.motion !== 'cut' || effect.fade);

  function changeEffect(change: Partial<FrameTransition>): void {
    const next = { ...(effect ?? defaultEffect), ...change };
    designerStore.setLookTransition(
      preset.id,
      next.motion === 'cut' && !next.fade
        ? { mode: 'cut', authored: true }
        : { mode: 'animate', effect: next },
    );
  }

  function setDirection(
    field: 'enterDirection' | 'exitDirection',
    direction: InputTransitionDirection | '',
  ): void {
    changeEffect({ [field]: direction || undefined });
  }

  return (
    <CollapseSection title="Preset effect">
      <SelectField
        label="Preset motion"
        value={effect?.motion ?? 'console'}
        options={['console', ...motions]}
        labels={['Use console setting', ...motions.map((motion) => motionLabels[motion])]}
        onCommit={(motion) => {
          if (motion === 'console') designerStore.setLookTransition(preset.id, CUT_LOOK_TRANSITION);
          else changeEffect({ motion, ...(motion === 'cut' && { fade: false }) });
        }}
      />
      {effect !== undefined && (
        <CheckRow label="Fade" checked={effect.fade} onChange={(fade) => changeEffect({ fade })} />
      )}
      {movesOrFades && (
        <>
          <NumberField
            label="Duration (ms)"
            value={effect.durationMs}
            min={FRAME_TRANSITION_MIN_MS}
            max={FRAME_TRANSITION_MAX_MS}
            step={20}
            onCommit={(value) => changeEffect({ durationMs: Math.round(value) })}
          />
          {directionRows.map(({ field, label, labels }) => (
            <SelectField
              key={field}
              label={label}
              value={effect[field] ?? ''}
              options={directions}
              labels={labels}
              onCommit={(direction) => setDirection(field, direction)}
            />
          ))}
        </>
      )}
    </CollapseSection>
  );
}
