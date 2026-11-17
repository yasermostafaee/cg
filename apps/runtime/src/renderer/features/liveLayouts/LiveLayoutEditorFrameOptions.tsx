import { useId } from 'react';
import { Move, Plus, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  CONTROL_LIVE_LAYOUT_PLATE_BORDER_MAX_PX,
  DEFAULT_LIVE_FIT_MODE,
  LIVE_REVEAL_MAX_RECTS,
  LiveRevealRectSchema,
  type ControlLiveLayoutFrame,
  type ControlLiveLayoutPlateOverride,
  type LiveRevealRect,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { Icon } from '../../ui/Icon.js';
import { liveLayoutArtwork } from '../../theme.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import { LiveLayoutEditorPlatePresentation } from './LiveLayoutEditorPlatePresentation.js';
import { LiveLayoutEditorSectionHeading } from './LiveLayoutEditorSectionHeading.js';
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

const DEFAULT_BORDER = { color: liveLayoutArtwork.plateBorder, width: 0 };

const MASK_FIELDS = [
  { key: 'x', limit: 'width', label: 'Mask X (%)', min: 0 },
  { key: 'y', limit: 'height', label: 'Mask Y (%)', min: 0 },
  { key: 'width', limit: 'x', label: 'Mask width (%)', min: 0.1 },
  { key: 'height', limit: 'y', label: 'Mask height (%)', min: 0.1 },
] as const;

export function LiveLayoutEditorFrameOptions({
  frame,
  presetOverrides,
  activeIndex,
  canEditMask,
  editingMask,
  onSelectMaskWindow,
  onMaskEditingChange,
  onChange,
}: {
  frame: ControlLiveLayoutFrame;
  presetOverrides?:
    | {
        id: string;
        value: ControlLiveLayoutPlateOverride | undefined;
        inheritedAspect: number;
        inheritedFit: ControlLiveLayoutFrame['fitMode'];
        onChange: (patch: ControlLiveLayoutPlateOverride) => void;
      }
    | undefined;
  activeIndex: number;
  canEditMask: boolean;
  editingMask: boolean;
  onSelectMaskWindow: (index: number) => void;
  onMaskEditingChange: (editing: boolean) => void;
  onChange: (patch: Partial<ControlLiveLayoutFrame>) => void;
}): JSX.Element {
  const id = useId();
  const fit = frame.fitMode ?? DEFAULT_LIVE_FIT_MODE;
  const resize = frame.operatorPlacement ?? 'free';
  const mask = frame.liveMask;
  const border = frame.border ?? DEFAULT_BORDER;
  const windows = mask?.rects ?? [];
  const activeWindow = windows[activeIndex];

  function addWindow(): void {
    if (windows.length >= LIVE_REVEAL_MAX_RECTS) return;
    const next = {
      x: 0.25 + (windows.length % 4) * 0.075,
      y: windows.length < 4 ? 0.25 : 0.15,
      width: 0.5,
      height: 0.5,
    };
    onChange({ liveMask: { mode: mask?.mode ?? 'inside', rects: [...windows, next] } });
    onSelectMaskWindow(windows.length);
  }

  function removeWindow(): void {
    if (mask === undefined || activeWindow === undefined) return;
    const rects = windows.filter((_, index) => index !== activeIndex);
    onChange(rects.length === 0 ? { liveMask: undefined } : { liveMask: { ...mask, rects } });
    onSelectMaskWindow(Math.max(0, Math.min(activeIndex, rects.length - 1)));
    if (rects.length === 0) onMaskEditingChange(false);
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
    <details
      className="cg-live-layout-frame-options"
      onToggle={(event) => {
        if (!event.currentTarget.open && editingMask) onMaskEditingChange(false);
      }}
    >
      <LiveLayoutEditorSectionHeading icon={SlidersHorizontal} label="Advanced plate controls" />
      <div
        className="cg-live-layout-frame-option-section"
        role="group"
        aria-labelledby={id + '-appearance'}
      >
        <h4 id={id + '-appearance'}>Plate appearance</h4>
        {presetOverrides !== undefined && (
          <div className="cg-live-layout-frame-option-group" role="group" aria-label="This preset">
            <span>In this preset</span>
            <LiveLayoutEditorPlatePresentation
              key={`${presetOverrides.id}:${frame.id}`}
              scope="plate"
              value={presetOverrides.value}
              inheritedAspect={presetOverrides.inheritedAspect}
              inheritedFit={`Inherit · ${presetOverrides.inheritedFit === 'cover' ? 'Crop edges' : 'Fit whole picture'}`}
              onChange={presetOverrides.onChange}
            />
            <p>Crop edges fills the plate. Eligible plates also get Crop input in PVW.</p>
          </div>
        )}
        <div
          className="cg-live-layout-frame-option-group"
          role="group"
          aria-label="Plate input fit across presets"
        >
          <span>Default input fit</span>
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
          <p>Used in Focus and when the current preset inherits the plate’s fit.</p>
        </div>
        <section className="cg-live-layout-frame-option-group" aria-label="Plate border">
          <span>Border</span>
          <div className="cg-live-layout-plate-border-fields">
            <div>
              <span>Color</span>
              <ColorInput
                className="cg-field"
                aria-label="Border color"
                value={border.color.slice(0, 7)}
                onChange={(color) => onChange({ border: { ...border, color } })}
              />
            </div>
            <LiveLayoutEditorNumber
              label="Border width (px)"
              min={0}
              max={CONTROL_LIVE_LAYOUT_PLATE_BORDER_MAX_PX}
              value={border.width}
              onChange={(width) => onChange({ border: { ...border, width } })}
            />
          </div>
        </section>
        <section className="cg-live-layout-frame-mask" aria-label="Plate mask">
          <div className="cg-live-layout-frame-option-buttons">
            <Button
              variant="neutral"
              disabled={windows.length >= LIVE_REVEAL_MAX_RECTS}
              onClick={addWindow}
            >
              <Icon icon={Plus} size={14} />
              Add mask window
            </Button>
            {mask !== undefined && (
              <>
                <Button variant="neutral" onClick={removeWindow}>
                  <Icon icon={Trash2} size={14} />
                  Remove mask window
                </Button>
                <Button
                  variant="neutral"
                  disabled={!canEditMask}
                  active={editingMask}
                  aria-pressed={editingMask}
                  title={
                    canEditMask
                      ? 'Move or resize the mask in Preview'
                      : 'Show this plate in Preview to edit its mask'
                  }
                  onClick={() => onMaskEditingChange(!editingMask)}
                >
                  <Icon icon={Move} size={14} />
                  Edit mask in preview
                </Button>
              </>
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
                      onClick={() => onSelectMaskWindow(index)}
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
            </>
          )}
        </section>
      </div>
      <div
        className="cg-live-layout-frame-option-section"
        role="group"
        aria-labelledby={id + '-operator'}
      >
        <h4 id={id + '-operator'}>
          <Icon icon={ShieldCheck} size={14} /> Operator permissions in CG Control
        </h4>
        <div className="cg-live-layout-frame-option-group" role="group" aria-label="Resize mode">
          <span>Resize mode</span>
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
        {mask !== undefined && (
          <label htmlFor={id + '-mask-edit'} className="cg-live-layout-frame-option-check">
            <Checkbox
              id={id + '-mask-edit'}
              checked={frame.allowOperatorMaskEdit === true}
              onChange={(allowOperatorMaskEdit) => onChange({ allowOperatorMaskEdit })}
            />
            Allow mask editing
          </label>
        )}
      </div>
    </details>
  );
}
