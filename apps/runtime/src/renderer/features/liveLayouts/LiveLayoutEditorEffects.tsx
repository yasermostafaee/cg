import { useId, useState } from 'react';
import {
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  FrameTransitionSchema,
  InputTransitionDirectionSchema,
  type ControlLiveLayout,
  type FrameTransition,
  type InputTransitionDirection,
} from '@cg/shared-schema';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { Checkbox } from '../../ui/Checkbox.js';
import { NumericInput } from '../../ui/NumericInput.js';

const motions: Record<FrameTransition['motion'], string> = {
  cut: 'Cut',
  linear: 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in/out',
  bounce: 'Bounce',
  elastic: 'Elastic',
};

const directions: Record<InputTransitionDirection, string> = {
  left: 'From left',
  right: 'From right',
  up: 'From top',
  down: 'From bottom',
};

function EffectDuration({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (durationMs: number) => void;
}): JSX.Element {
  const [typed, setTyped] = useState<string>();
  return (
    <label>
      {label}
      <NumericInput
        value={typed ?? String(value)}
        allow="digits"
        scrub={{ step: 20, min: FRAME_TRANSITION_MIN_MS, max: FRAME_TRANSITION_MAX_MS }}
        onBlur={() => setTyped(undefined)}
        onValueChange={(text) => {
          setTyped(text);
          const duration = parseLocalizedNumber(text);
          if (
            duration !== null &&
            Number.isSafeInteger(duration) &&
            duration >= FRAME_TRANSITION_MIN_MS &&
            duration <= FRAME_TRANSITION_MAX_MS
          )
            onChange(duration);
        }}
      />
    </label>
  );
}

export function LiveLayoutEditorEffects({
  effects,
  onChange,
}: {
  effects: ControlLiveLayout['effects'];
  onChange: (effects: ControlLiveLayout['effects']) => void;
}): JSX.Element {
  const { focus, switch: change } = effects;
  const fadeId = useId();
  const setFocus = (patch: Partial<typeof focus>): void =>
    onChange({ ...effects, focus: { ...focus, ...patch } });
  const setSwitch = (patch: Partial<typeof change>): void =>
    onChange({ ...effects, switch: { ...change, ...patch } });

  return (
    <details className="cg-live-layout-effects">
      <summary>Layout effects</summary>
      <fieldset className="cg-live-layout-effect-controls">
        <legend>Focus and Return</legend>
        <label>
          Motion
          <select
            className="cg-field"
            value={focus.motion}
            onChange={(event) => {
              const parsed = FrameTransitionSchema.shape.motion.safeParse(
                event.currentTarget.value,
              );
              if (parsed.success) setFocus({ motion: parsed.data });
            }}
          >
            {FrameTransitionSchema.shape.motion.options.map((motion) => (
              <option key={motion} value={motion}>
                {motions[motion]}
              </option>
            ))}
          </select>
        </label>
        <label className="cg-live-layout-toggle" htmlFor={fadeId}>
          <Checkbox id={fadeId} checked={focus.fade} onChange={(fade) => setFocus({ fade })} />
          Fade
        </label>
        <EffectDuration
          label="Focus duration (ms)"
          value={focus.durationMs}
          onChange={(durationMs) => setFocus({ durationMs })}
        />
      </fieldset>
      <fieldset className="cg-live-layout-effect-controls">
        <legend>Switch focused frame</legend>
        <label>
          Effect
          <select
            className="cg-field"
            value={change.mode}
            onChange={(event) => {
              const mode = event.currentTarget.value;
              if (mode === 'motion' || mode === 'push' || mode === 'slide-over')
                setSwitch({ mode });
            }}
          >
            <option value="motion">Focus and Return motion</option>
            <option value="push">Push</option>
            <option value="slide-over">Slide over</option>
          </select>
        </label>
        {change.mode !== 'motion' && (
          <label>
            Direction
            <select
              className="cg-field"
              value={change.direction}
              onChange={(event) => {
                const parsed = InputTransitionDirectionSchema.safeParse(event.currentTarget.value);
                if (parsed.success) setSwitch({ direction: parsed.data });
              }}
            >
              {InputTransitionDirectionSchema.options.map((direction) => (
                <option key={direction} value={direction}>
                  {directions[direction]}
                </option>
              ))}
            </select>
          </label>
        )}
        <EffectDuration
          label="Switch duration (ms)"
          value={change.durationMs}
          onChange={(durationMs) => setSwitch({ durationMs })}
        />
      </fieldset>
    </details>
  );
}
