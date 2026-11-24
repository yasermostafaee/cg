import { useUiText } from '../../i18n/locale.js';
import { useId } from 'react';
import { ArrowLeftRight, Maximize2, Sparkles } from 'lucide-react';
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
import { PresetPlateDirectionControl } from '../inspector/FrameEffectControls.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import { LiveLayoutEditorSectionHeading } from './LiveLayoutEditorSectionHeading.js';
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
  const localizeUi = useUiText();
  const { focus, switch: change } = effects;
  const fadeId = useId();
  const setFocus = (patch: Partial<typeof focus>): void =>
    onChange({ ...effects, focus: { ...focus, ...patch } });
  const setSwitch = (patch: Partial<typeof change>): void =>
    onChange({ ...effects, switch: { ...change, ...patch } });

  return (
    <details className="cg-live-layout-effects">
      <LiveLayoutEditorSectionHeading icon={Sparkles} label={localizeUi('Layout effects')} />
      <div className="cg-live-layout-effect-grid">
        <fieldset className="cg-live-layout-effect-controls">
          <legend>
            <Icon icon={Maximize2} size={14} /> {localizeUi('Focus and Return')}
          </legend>
          <div className="cg-form-grid cg-live-layout-effect-fields">
            <label
              className="cg-form-field cg-live-layout-effect-method"
              htmlFor={fadeId + '-motion'}
            >
              {localizeUi('Motion')}
              <SelectInput
                id={fadeId + '-motion'}
                aria-label={localizeUi('Motion')}
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
                    {localizeUi(motions[motion])}
                  </option>
                ))}
              </SelectInput>
            </label>
            <LiveLayoutEditorNumber
              label={localizeUi('Focus duration (ms)')}
              value={focus.durationMs}
              min={FRAME_TRANSITION_MIN_MS}
              max={FRAME_TRANSITION_MAX_MS}
              step={20}
              onChange={(durationMs) => setFocus({ durationMs })}
            />
            <label className="cg-live-layout-effect-fade" htmlFor={fadeId}>
              <Checkbox id={fadeId} checked={focus.fade} onChange={(fade) => setFocus({ fade })} />
              {localizeUi('Fade')}
            </label>
            {(focus.motion !== 'cut' || focus.fade) && (
              <>
                <PresetPlateDirectionControl
                  phase="enter"
                  direction={focus.enterDirection}
                  onChange={(enterDirection) => setFocus({ enterDirection })}
                />
                <PresetPlateDirectionControl
                  phase="exit"
                  direction={focus.exitDirection}
                  onChange={(exitDirection) => setFocus({ exitDirection })}
                />
              </>
            )}
          </div>
        </fieldset>
        <fieldset className="cg-live-layout-effect-controls">
          <legend>
            <Icon icon={ArrowLeftRight} size={14} /> {localizeUi('Switch focused plate')}
          </legend>
          <div className="cg-form-grid cg-live-layout-effect-fields">
            <label
              className="cg-form-field cg-live-layout-effect-method"
              htmlFor={fadeId + '-switch'}
            >
              {localizeUi('Effect')}
              <SelectInput
                id={fadeId + '-switch'}
                aria-label={localizeUi('Effect')}
                value={change.mode}
                onChange={(event) => {
                  const mode = ControlLiveLayoutSwitchModeSchema.safeParse(
                    event.currentTarget.value,
                  );
                  if (mode.success) setSwitch({ mode: mode.data });
                }}
              >
                <option value="motion">{localizeUi('Focus and Return motion')}</option>
                <option value="cut">{localizeUi('Cut')}</option>
                <option value="fade">{localizeUi('Fade')}</option>
                <option value="push">{localizeUi('Push')}</option>
                <option value="slide-over">{localizeUi('Slide over')}</option>
              </SelectInput>
            </label>
            <LiveLayoutEditorNumber
              label={localizeUi('Switch duration (ms)')}
              value={change.durationMs}
              min={FRAME_TRANSITION_MIN_MS}
              max={FRAME_TRANSITION_MAX_MS}
              step={20}
              disabled={change.mode === 'cut'}
              onChange={(durationMs) => setSwitch({ durationMs })}
            />
            {(change.mode === 'push' || change.mode === 'slide-over') && (
              <label className="cg-form-field" htmlFor={fadeId + '-direction'}>
                {localizeUi('Direction')}
                <SelectInput
                  id={fadeId + '-direction'}
                  aria-label={localizeUi('Direction')}
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
                      {localizeUi(directions[direction])}
                    </option>
                  ))}
                </SelectInput>
              </label>
            )}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
