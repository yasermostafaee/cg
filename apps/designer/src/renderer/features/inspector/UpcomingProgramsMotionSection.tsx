import {
  upcomingProgramsNextPageEffectOf,
  upcomingProgramsSceneEffectsOf,
  upcomingProgramsTransitionOf,
  type UpcomingProgramsElement,
  type UpcomingProgramsNextPageEffect,
} from '@cg/shared-schema';
import { CollapseSection } from './CollapseSection.js';
import { NumberField, SelectField } from './controls.js';
import {
  SEQUENCE_PRESET_ORDER,
  SEQUENCE_TRANSITION_PRESETS,
  sequencePresetKeyFor,
} from './sequence-presets.js';

const edges = [
  'none',
  'fade',
  'left',
  'right',
  'top',
  'bottom',
  'fade-left',
  'fade-right',
  'fade-top',
  'fade-bottom',
] as const;
const motionLabels = {
  Entrance: [
    'None',
    'Fade in',
    'Move in from left',
    'Move in from right',
    'Move in from above',
    'Move in from below',
    'Fade in from left',
    'Fade in from right',
    'Fade in from above',
    'Fade in from below',
  ],
  Exit: [
    'None',
    'Fade out',
    'Move out to left',
    'Move out to right',
    'Move out above',
    'Move out below',
    'Fade out to left',
    'Fade out to right',
    'Fade out above',
    'Fade out below',
  ],
};

type Effect = ReturnType<typeof upcomingProgramsSceneEffectsOf>['entrance'];

const defaultNextPageEffect: UpcomingProgramsNextPageEffect = {
  exit: { edge: 'fade', durationMs: 300, stagger: { delayMs: 300, order: 'last-to-first' } },
  entrance: { edge: 'fade', durationMs: 300, stagger: { delayMs: 300, order: 'first-to-last' } },
};

export function UpcomingProgramsNextMotionFields({
  element,
  update,
}: {
  element: UpcomingProgramsElement;
  update: (patch: Partial<UpcomingProgramsElement>) => void;
}): JSX.Element {
  const turn = upcomingProgramsNextPageEffectOf(element);
  const transition = upcomingProgramsTransitionOf(element);
  const presetKey = sequencePresetKeyFor(transition);
  const options = SEQUENCE_PRESET_ORDER.filter(
    (preset) => preset.key !== 'custom' || presetKey === 'custom',
  );

  return (
    <>
      <SelectField
        label="Next motion"
        options={['group', 'stagger'] as const}
        labels={['Page effect', 'Exit then enter']}
        value={turn === undefined ? 'group' : 'stagger'}
        onCommit={(mode) =>
          update({ nextPageEffect: mode === 'stagger' ? defaultNextPageEffect : undefined })
        }
      />
      {turn === undefined ? (
        <>
          <SelectField
            label="Next effect"
            options={options.map((preset) => preset.key)}
            labels={options.map((preset) => preset.label)}
            value={presetKey}
            onCommit={(key) => {
              const preset = SEQUENCE_TRANSITION_PRESETS[key];
              if (preset !== undefined) update(preset);
            }}
          />
          {presetKey !== 'cut' && (
            <DurationField
              label="Next effect duration"
              durationMs={transition.transitionMs}
              onCommit={(transitionMs) => update({ transitionMs })}
            />
          )}
        </>
      ) : (
        <>
          <EffectFields
            label="Current page exit"
            kind="Exit"
            effect={turn.exit}
            onCommit={(exit) => update({ nextPageEffect: { ...turn, exit } })}
          />
          <EffectFields
            label="Next page entrance"
            kind="Entrance"
            effect={turn.entrance}
            onCommit={(entrance) => update({ nextPageEffect: { ...turn, entrance } })}
          />
        </>
      )}
    </>
  );
}

export function UpcomingProgramsMotionSection({
  element,
  update,
}: {
  element: UpcomingProgramsElement;
  update: (patch: Partial<UpcomingProgramsElement>) => void;
}): JSX.Element {
  const { entrance, exit } = upcomingProgramsSceneEffectsOf(element);
  return (
    <CollapseSection title="Entrance and exit">
      <EffectFields
        label="Entrance"
        kind="Entrance"
        effect={entrance}
        onCommit={(entranceEffect) => update({ entranceEffect })}
      />
      <EffectFields
        label="Exit"
        kind="Exit"
        effect={exit}
        onCommit={(exitEffect) => update({ exitEffect })}
      />
    </CollapseSection>
  );
}

function EffectFields({
  label,
  kind,
  effect,
  onCommit,
}: {
  label: string;
  kind: 'Entrance' | 'Exit';
  effect: Effect;
  onCommit: (effect: Effect) => void;
}): JSX.Element {
  const stagger = effect.stagger;
  return (
    <>
      <SelectField
        label={`${label} effect`}
        options={edges}
        labels={motionLabels[kind]}
        value={effect.edge}
        onCommit={(edge) => onCommit({ ...effect, edge })}
      />
      {effect.edge !== 'none' && (
        <>
          <SelectField
            label={`${label} motion`}
            options={['group', 'stagger'] as const}
            labels={['Together', 'Staggered cards']}
            value={stagger === undefined ? 'group' : 'stagger'}
            onCommit={(mode) =>
              onCommit({
                ...effect,
                stagger:
                  mode === 'stagger'
                    ? {
                        delayMs: effect.durationMs,
                        order: kind === 'Entrance' ? 'first-to-last' : 'last-to-first',
                      }
                    : undefined,
              })
            }
          />
          <DurationField
            label={`${label} duration`}
            durationMs={effect.durationMs}
            onCommit={(durationMs) => onCommit({ ...effect, durationMs })}
          />
          {stagger !== undefined && (
            <>
              <NumberField
                label={`${label} stagger`}
                value={stagger.delayMs / 1000}
                min={0}
                max={Number.MAX_SAFE_INTEGER / 1000}
                step={0.05}
                suffix="s"
                onCommit={(seconds) => {
                  const delayMs = Math.round(seconds * 1000);
                  if (Number.isSafeInteger(delayMs) && delayMs >= 0) {
                    onCommit({ ...effect, stagger: { ...stagger, delayMs } });
                  }
                }}
              />
              <SelectField
                label={`${label} card order`}
                options={['first-to-last', 'last-to-first'] as const}
                labels={['First to last', 'Last to first']}
                value={stagger.order}
                onCommit={(order) => onCommit({ ...effect, stagger: { ...stagger, order } })}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

function DurationField({
  label,
  durationMs,
  onCommit,
}: {
  label: string;
  durationMs: number;
  onCommit: (durationMs: number) => void;
}): JSX.Element {
  return (
    <NumberField
      label={label}
      value={durationMs / 1000}
      min={0.05}
      max={Number.MAX_SAFE_INTEGER / 1000}
      step={0.05}
      suffix="s"
      onCommit={(seconds) => {
        const nextDurationMs = Math.round(seconds * 1000);
        if (Number.isSafeInteger(nextDurationMs) && nextDurationMs >= 50) onCommit(nextDurationMs);
      }}
    />
  );
}
