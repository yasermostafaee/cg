import { useId } from 'react';
import { ArrowLeftRight, ChevronDown, Maximize2, Sparkles } from 'lucide-react';
import {
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  ControlLiveLayoutSwitchModeSchema,
  FrameTransitionSchema,
  InputTransitionDirectionSchema,
  type ControlLiveLayout,
  type FrameTransition,
  type InputTransitionDirection,
} from '@cg/shared-schema';
import { Checkbox } from '../../ui/Checkbox.js';
import { Icon } from '../../ui/Icon.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import './live-layout-effects.css';

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
      <summary>
        <Icon icon={Sparkles} size={16} />
        <span>Layout effects</span>
        <Icon icon={ChevronDown} size={14} />
      </summary>
      <div className="cg-live-layout-effect-grid">
        <fieldset className="cg-live-layout-effect-controls">
          <legend>
            <Icon icon={Maximize2} size={14} /> Focus and Return
          </legend>
          <div className="cg-live-layout-effect-fields">
            <label className="cg-live-layout-effect-method">
              Motion
              <select
                className="cg-field"
                aria-label="Motion"
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
            <LiveLayoutEditorNumber
              label="Focus duration (ms)"
              value={focus.durationMs}
              min={FRAME_TRANSITION_MIN_MS}
              max={FRAME_TRANSITION_MAX_MS}
              step={20}
              onChange={(durationMs) => setFocus({ durationMs })}
            />
            <label className="cg-live-layout-effect-fade" htmlFor={fadeId}>
              <Checkbox id={fadeId} checked={focus.fade} onChange={(fade) => setFocus({ fade })} />
              Fade
            </label>
          </div>
        </fieldset>
        <fieldset className="cg-live-layout-effect-controls">
          <legend>
            <Icon icon={ArrowLeftRight} size={14} /> Switch focused plate
          </legend>
          <div className="cg-live-layout-effect-fields">
            <label className="cg-live-layout-effect-method">
              Effect
              <select
                className="cg-field"
                aria-label="Effect"
                value={change.mode}
                onChange={(event) => {
                  const mode = ControlLiveLayoutSwitchModeSchema.safeParse(
                    event.currentTarget.value,
                  );
                  if (mode.success) setSwitch({ mode: mode.data });
                }}
              >
                <option value="motion">Focus and Return motion</option>
                <option value="cut">Cut</option>
                <option value="fade">Fade</option>
                <option value="push">Push</option>
                <option value="slide-over">Slide over</option>
              </select>
            </label>
            <LiveLayoutEditorNumber
              label="Switch duration (ms)"
              value={change.durationMs}
              min={FRAME_TRANSITION_MIN_MS}
              max={FRAME_TRANSITION_MAX_MS}
              step={20}
              disabled={change.mode === 'cut'}
              onChange={(durationMs) => setSwitch({ durationMs })}
            />
            {(change.mode === 'push' || change.mode === 'slide-over') && (
              <label>
                Direction
                <select
                  className="cg-field"
                  aria-label="Direction"
                  value={change.direction}
                  onChange={(event) => {
                    const parsed = InputTransitionDirectionSchema.safeParse(
                      event.currentTarget.value,
                    );
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
          </div>
        </fieldset>
      </div>
    </details>
  );
}
