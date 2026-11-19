import { useId, useRef } from 'react';
import { ImagePlus, Info, Move, Plus, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  CONTROL_LIVE_LAYOUT_PLATE_BORDER_MAX_PX,
  DEFAULT_LIVE_FIT_MODE,
  LIVE_REVEAL_MAX_RECTS,
  LiveRevealRectSchema,
  controlLiveLayoutShowFallback,
  type ControlLiveLayoutFrame,
  type ControlLiveLayoutPlateOverride,
  type LiveCropFocus,
  type LiveRevealRect,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { liveLayoutArtwork } from '../../theme.js';
import { CONTROL_LIVE_LAYOUT_FALLBACK_ACCEPT } from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditorCropControls } from './LiveLayoutEditorCropControls.js';
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
const DEFAULT_FIT_HELP = 'Applies in Focus and when the preset inherits this plate’s fit.';

const MASK_FIELDS = [
  { key: 'x', limit: 'width', label: 'Mask X (%)', min: 0 },
  { key: 'y', limit: 'height', label: 'Mask Y (%)', min: 0 },
  { key: 'width', limit: 'x', label: 'Mask width (%)', min: 0.1 },
  { key: 'height', limit: 'y', label: 'Mask height (%)', min: 0.1 },
] as const;

export function LiveLayoutEditorFrameOptions({
  frame,
  fallbackImage,
  presetOverrides,
  borderVisibility,
  crop,
  activeIndex,
  canEditMask,
  editingMask,
  onSelectMaskWindow,
  onMaskEditingChange,
  onChange,
}: {
  frame: ControlLiveLayoutFrame;
  fallbackImage: { reading: boolean; onPick: (file: File) => void };
  presetOverrides?:
    | {
        id: string;
        value: ControlLiveLayoutPlateOverride | undefined;
        inheritedAspect: number;
        inheritedFit: ControlLiveLayoutFrame['fitMode'];
        onChange: (patch: ControlLiveLayoutPlateOverride) => void;
      }
    | undefined;
  borderVisibility?:
    | {
        showInPreset: boolean;
        showInFocus: boolean;
        belongsToPreset: boolean;
        onPresetChange: (show: boolean) => void;
        onFocusChange: (show: boolean) => void;
      }
    | undefined;
  crop?:
    | {
        value: LiveCropFocus;
        editing: boolean;
        canEditPreview: boolean;
        canReset: boolean;
        onChange: (focus: LiveCropFocus) => void;
        onEditChange: (editing: boolean) => void;
        onReset: () => void;
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
  const fallbackPick = useRef<HTMLInputElement>(null);
  const fit = frame.fitMode ?? DEFAULT_LIVE_FIT_MODE;
  const resize = frame.operatorPlacement ?? 'free';
  const mask = frame.liveMask;
  const border = frame.border ?? DEFAULT_BORDER;
  const windows = mask?.rects ?? [];
  const activeWindow = windows[activeIndex];
  const fallback = frame.fallback;

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
        if (event.currentTarget.open) return;
        if (editingMask) onMaskEditingChange(false);
        if (crop?.editing === true) crop.onEditChange(false);
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
            {crop !== undefined && <LiveLayoutEditorCropControls scope="plate" {...crop} />}
          </div>
        )}
        <div
          className="cg-live-layout-frame-option-group"
          role="group"
          aria-label="Plate input fit across presets"
        >
          <div className="cg-live-layout-fit-label">
            <span>Default plate fit</span>
            <button
              type="button"
              className="cg-live-layout-fit-info"
              aria-label={DEFAULT_FIT_HELP}
              title={DEFAULT_FIT_HELP}
            >
              <Icon icon={Info} size={14} />
            </button>
          </div>
          <div className="cg-live-layout-frame-option-buttons">
            {FIT_CHOICES.map(([fitMode, label]) => (
              <Button
                key={fitMode}
                active={fit === fitMode}
                aria-pressed={fit === fitMode}
                title={DEFAULT_FIT_HELP}
                onClick={() => onChange({ fitMode })}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <section className="cg-live-layout-frame-option-group" aria-label="Fallback background">
          <span>Fallback background</span>
          <div className="cg-live-layout-frame-option-buttons">
            <Button
              active={fallback?.kind === 'bars'}
              aria-pressed={fallback?.kind === 'bars'}
              disabled={fallbackImage.reading}
              onClick={() => onChange({ fallback: { kind: 'bars' } })}
            >
              Bars
            </Button>
            <Button
              active={fallback?.kind === 'color'}
              aria-pressed={fallback?.kind === 'color'}
              disabled={fallbackImage.reading}
              onClick={() =>
                onChange({
                  fallback: {
                    kind: 'color',
                    color: fallback?.kind === 'color' ? fallback.color : '#000000',
                  },
                })
              }
            >
              Solid colour
            </Button>
            <Button
              active={fallback?.kind === 'image'}
              aria-pressed={fallback?.kind === 'image'}
              disabled={fallbackImage.reading}
              onClick={() => fallbackPick.current?.click()}
            >
              <Icon icon={ImagePlus} size={14} />
              Image…
            </Button>
            <FileInput
              ref={fallbackPick}
              aria-label="Fallback image file"
              accept={CONTROL_LIVE_LAYOUT_FALLBACK_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file !== undefined) fallbackImage.onPick(file);
              }}
            />
          </div>
          {fallback?.kind === 'color' && (
            <ColorInput
              className="cg-field"
              aria-label="Fallback colour"
              value={fallback.color.slice(0, 7)}
              onChange={(color) => onChange({ fallback: { kind: 'color', color } })}
            />
          )}
          {fallback?.kind === 'image' && <IsolatedName>{fallback.name}</IsolatedName>}
          <label
            className="cg-live-layout-frame-option-check"
            htmlFor={id + '-fallback-on-air'}
            title="Show the selected background on air when the input is empty or leaves space in the plate."
          >
            <Checkbox
              id={id + '-fallback-on-air'}
              checked={controlLiveLayoutShowFallback(frame)}
              onChange={(showFallback) =>
                onChange({
                  showFallback,
                  ...(showFallback && fallback === undefined && { fallback: { kind: 'bars' } }),
                })
              }
            />
            Show fallback on air
          </label>
        </section>
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
          {borderVisibility !== undefined && (
            <div className="cg-live-layout-border-visibility">
              <label className="cg-live-layout-frame-option-check" htmlFor={id + '-border-preset'}>
                <Checkbox
                  id={id + '-border-preset'}
                  checked={borderVisibility.showInPreset}
                  disabled={!borderVisibility.belongsToPreset}
                  onChange={borderVisibility.onPresetChange}
                />
                Show border in preset
              </label>
              <label className="cg-live-layout-frame-option-check" htmlFor={id + '-border-focus'}>
                <Checkbox
                  id={id + '-border-focus'}
                  checked={borderVisibility.showInFocus}
                  onChange={borderVisibility.onFocusChange}
                />
                Show border in Focus
              </label>
            </div>
          )}
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
        <label htmlFor={id + '-move'} className="cg-live-layout-frame-option-check">
          <Checkbox
            id={id + '-move'}
            checked={frame.operatorMove ?? true}
            onChange={(operatorMove) => onChange({ operatorMove })}
          />
          Move plate
        </label>
        <div className="cg-live-layout-frame-option-group" role="group" aria-label="Resize plate">
          <span>Resize plate</span>
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
        <label
          htmlFor={id + '-crop'}
          className="cg-live-layout-frame-option-check"
          aria-label="Crop input"
          title="Available for unmasked plates using Crop edges"
        >
          <Checkbox
            id={id + '-crop'}
            checked={mask === undefined && (frame.operatorCrop ?? true)}
            disabled={mask !== undefined}
            onChange={(operatorCrop) => onChange({ operatorCrop })}
          />
          Crop input
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
