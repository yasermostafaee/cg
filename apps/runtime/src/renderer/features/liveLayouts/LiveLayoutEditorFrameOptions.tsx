import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_LIVE_FIT_MODE,
  LIVE_REVEAL_MAX_RECTS,
  LiveRevealRectSchema,
  type ControlLiveLayoutFrame,
  type LiveRevealRect,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Icon } from '../../ui/Icon.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import './live-layout-frame-options.css';

const FIT_CHOICES = [
  ['contain', 'Fit whole picture'],
  ['cover', 'Crop edges'],
] as const;

const RESIZE_CHOICES = [
  ['locked', 'Locked'],
  ['proportional', 'Keep aspect'],
  ['free', 'Free'],
] as const;

const MASK_FIELDS = [
  { key: 'x', limit: 'width', label: 'Mask X (%)', min: 0 },
  { key: 'y', limit: 'height', label: 'Mask Y (%)', min: 0 },
  { key: 'width', limit: 'x', label: 'Mask width (%)', min: 0.1 },
  { key: 'height', limit: 'y', label: 'Mask height (%)', min: 0.1 },
] as const;

export function LiveLayoutEditorFrameOptions({
  frame,
  onChange,
}: {
  frame: ControlLiveLayoutFrame;
  onChange: (patch: Partial<ControlLiveLayoutFrame>) => void;
}): JSX.Element {
  const id = useId();
  const [selection, setSelection] = useState<{ frameId: string; index: number }>();
  const fit = frame.fitMode ?? DEFAULT_LIVE_FIT_MODE;
  const resize = frame.operatorPlacement ?? 'free';
  const mask = frame.liveMask;
  const windows = mask?.rects ?? [];
  const activeIndex = Math.min(
    selection?.frameId === frame.id ? selection.index : 0,
    windows.length - 1,
  );
  const activeWindow = windows[activeIndex];

  function chooseWindow(index: number): void {
    setSelection({ frameId: frame.id, index });
  }

  function addWindow(): void {
    if (windows.length >= LIVE_REVEAL_MAX_RECTS) return;
    const next = {
      x: 0.25 + (windows.length % 4) * 0.075,
      y: windows.length < 4 ? 0.25 : 0.15,
      width: 0.5,
      height: 0.5,
    };
    onChange({ liveMask: { mode: mask?.mode ?? 'inside', rects: [...windows, next] } });
    chooseWindow(windows.length);
  }

  function removeWindow(): void {
    if (mask === undefined || activeWindow === undefined) return;
    const rects = windows.filter((_, index) => index !== activeIndex);
    onChange(rects.length === 0 ? { liveMask: undefined } : { liveMask: { ...mask, rects } });
    chooseWindow(Math.max(0, Math.min(activeIndex, rects.length - 1)));
  }

  function changeWindow(
    key: keyof LiveRevealRect,
    limit: keyof LiveRevealRect,
    value: number,
  ): void {
    if (mask === undefined || activeWindow === undefined) return;
    const next = { ...activeWindow, [key]: Math.min(value / 100, 1 - activeWindow[limit]) };
    if (!LiveRevealRectSchema.safeParse(next).success) return;
    const rects = windows.map((rect, index) => (index === activeIndex ? next : rect));
    onChange({ liveMask: { ...mask, rects } });
  }

  return (
    <details className="cg-live-layout-frame-options">
      <summary>Advanced frame controls</summary>
      <div className="cg-live-layout-frame-option-group" role="group" aria-label="Input fit">
        <span>Input fit</span>
        <div className="cg-live-layout-frame-option-buttons">
          {FIT_CHOICES.map(([fitMode, label]) => (
            <Button
              key={fitMode}
              active={fit === fitMode}
              aria-pressed={fit === fitMode}
              onClick={() => onChange({ fitMode })}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="cg-live-layout-frame-option-group" role="group" aria-label="Resize">
        <span>Resize</span>
        <div className="cg-live-layout-frame-option-buttons">
          {RESIZE_CHOICES.map(([operatorPlacement, label]) => (
            <Button
              key={operatorPlacement}
              active={resize === operatorPlacement}
              aria-pressed={resize === operatorPlacement}
              onClick={() => onChange({ operatorPlacement })}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <label htmlFor={id + '-move'} className="cg-live-layout-frame-option-check">
        <Checkbox
          id={id + '-move'}
          checked={frame.operatorMove ?? true}
          onChange={(operatorMove) => onChange({ operatorMove })}
        />
        Allow move
      </label>
      <section className="cg-live-layout-frame-mask" aria-label="Frame mask">
        <div className="cg-live-layout-frame-option-buttons">
          <Button
            variant="add"
            disabled={windows.length >= LIVE_REVEAL_MAX_RECTS}
            onClick={addWindow}
          >
            <Icon icon={Plus} size={14} />
            Add mask window
          </Button>
          {mask !== undefined && (
            <Button variant="secondary" onClick={removeWindow}>
              <Icon icon={Trash2} size={14} />
              Remove mask window
            </Button>
          )}
        </div>
        {mask !== undefined && activeWindow !== undefined && (
          <>
            <div
              className="cg-live-layout-frame-option-buttons"
              role="group"
              aria-label="Mask mode"
            >
              <Button
                active={mask.mode === 'inside'}
                aria-pressed={mask.mode === 'inside'}
                onClick={() => onChange({ liveMask: { ...mask, mode: 'inside' } })}
              >
                Show inside
              </Button>
              <Button
                active={mask.mode === 'outside'}
                aria-pressed={mask.mode === 'outside'}
                onClick={() => onChange({ liveMask: { ...mask, mode: 'outside' } })}
              >
                Show outside
              </Button>
            </div>
            {windows.length > 1 && (
              <div
                className="cg-live-layout-frame-option-buttons"
                role="group"
                aria-label="Mask windows"
              >
                {windows.map((_, index) => (
                  <Button
                    key={index}
                    aria-label={'Mask window ' + (index + 1)}
                    active={index === activeIndex}
                    aria-pressed={index === activeIndex}
                    onClick={() => chooseWindow(index)}
                  >
                    {index + 1}
                  </Button>
                ))}
              </div>
            )}
            <div className="cg-live-layout-frame-mask-values" key={frame.id + ':' + activeIndex}>
              {MASK_FIELDS.map(({ key, limit, label, min }) => (
                <LiveLayoutEditorNumber
                  key={key}
                  label={label}
                  min={min}
                  max={100}
                  decimal
                  value={Math.round(activeWindow[key] * 10000) / 100}
                  onChange={(value) => changeWindow(key, limit, value)}
                />
              ))}
            </div>
            <label htmlFor={id + '-mask-edit'} className="cg-live-layout-frame-option-check">
              <Checkbox
                id={id + '-mask-edit'}
                checked={frame.allowOperatorMaskEdit === true}
                onChange={(allowOperatorMaskEdit) => onChange({ allowOperatorMaskEdit })}
              />
              Allow mask editing in CG Control
            </label>
          </>
        )}
      </section>
    </details>
  );
}
