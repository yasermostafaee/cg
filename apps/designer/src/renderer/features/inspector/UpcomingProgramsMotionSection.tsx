import { upcomingProgramsSceneEffectsOf, type UpcomingProgramsElement } from '@cg/shared-schema';
import { CollapseSection } from './CollapseSection.js';
import { NumberField, SelectField } from './controls.js';

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
        effect={entrance}
        onCommit={(entranceEffect) => update({ entranceEffect })}
      />
      <EffectFields label="Exit" effect={exit} onCommit={(exitEffect) => update({ exitEffect })} />
    </CollapseSection>
  );
}

function EffectFields({
  label,
  effect,
  onCommit,
}: {
  label: 'Entrance' | 'Exit';
  effect: Effect;
  onCommit: (effect: Effect) => void;
}): JSX.Element {
  return (
    <>
      <SelectField
        label={`${label} effect`}
        options={edges}
        labels={motionLabels[label]}
        value={effect.edge}
        onCommit={(edge) => onCommit({ ...effect, edge })}
      />
      {effect.edge !== 'none' && (
        <NumberField
          label={`${label} duration`}
          value={effect.durationMs / 1000}
          min={0.05}
          max={Number.MAX_SAFE_INTEGER / 1000}
          step={0.05}
          suffix="s"
          onCommit={(seconds) => {
            const durationMs = Math.round(seconds * 1000);
            if (Number.isSafeInteger(durationMs) && durationMs >= 50) {
              onCommit({ ...effect, durationMs });
            }
          }}
        />
      )}
    </>
  );
}
