import { useUiText } from '../../i18n/locale.js';
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
import { liveLayoutArtwork } from '../../theme.js';
import { CONTROL_LIVE_LAYOUT_FALLBACK_ACCEPT } from './controlLiveLayoutCompiler.js';
import { LiveLayoutAssetThumbnail, useLiveLayoutAssetUrl } from './LiveLayoutAssetThumbnail.js';
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
  fallbackImage: { asset: Blob | undefined; reading: boolean; onPick: (file: File) => void };
  presetOverrides?:
    | {
        id: string;
        value: ControlLiveLayoutPlateOverride | undefined;
        inheritedAspect: number;
        inheritedFit: ControlLiveLayoutFrame['fitMode'];
        geometryControls?: boolean;
        onChange: (patch: ControlLiveLayoutPlateOverride) => void;
      }
    | undefined;
  borderVisibility?:
    | {
        showInPreset: boolean;
        showInFocus: boolean | undefined;
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
  const localizeUi = useUiText();
  const id = useId();
  const fallbackPick = useRef<HTMLInputElement>(null);
  const fit = frame.fitMode ?? DEFAULT_LIVE_FIT_MODE;
  const resize = frame.operatorPlacement ?? 'free';
  const mask = frame.liveMask;
  const border = frame.border ?? DEFAULT_BORDER;
  const windows = mask?.rects ?? [];
  const activeWindow = windows[activeIndex];
  const fallback = frame.fallback;
  const fallbackUrl = useLiveLayoutAssetUrl(fallbackImage.asset);

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
      <LiveLayoutEditorSectionHeading
        icon={SlidersHorizontal}
        label={localizeUi('Advanced plate controls')}
      />
      <div
        className="cg-live-layout-frame-option-section"
        role="group"
        aria-labelledby={id + '-appearance'}
      >
        <h4 id={id + '-appearance'}>{localizeUi('Plate appearance')}</h4>
        {presetOverrides !== undefined && (
          <div
            className="cg-live-layout-frame-option-group"
            role="group"
            aria-label={localizeUi('This preset')}
          >
            <span>{localizeUi('In this preset')}</span>
            <LiveLayoutEditorPlatePresentation
              key={`${presetOverrides.id}:${frame.id}`}
              scope="plate"
              value={presetOverrides.value}
              inheritedAspect={presetOverrides.inheritedAspect}
              inheritedFit={localizeUi('Inherit · {fit}', {
                fit: localizeUi(
                  presetOverrides.inheritedFit === 'cover' ? 'Crop edges' : 'Fit whole picture',
                ),
              })}
              geometryControls={presetOverrides.geometryControls ?? true}
              onChange={presetOverrides.onChange}
            />
            {crop !== undefined && (
              <LiveLayoutEditorCropControls
                key={`${presetOverrides.id}:${frame.id}:crop`}
                scope="plate"
                {...crop}
              />
            )}
          </div>
        )}
        <div
          className="cg-live-layout-frame-option-group"
          role="group"
          aria-label={localizeUi('Plate input fit across presets')}
        >
          <div className="cg-live-layout-fit-label">
            <span>{localizeUi('Default plate fit')}</span>
            <button
              type="button"
              className="cg-live-layout-fit-info"
              aria-label={localizeUi(DEFAULT_FIT_HELP)}
              title={localizeUi(DEFAULT_FIT_HELP)}
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
                title={localizeUi(DEFAULT_FIT_HELP)}
                onClick={() => onChange({ fitMode })}
              >
                {localizeUi(label)}
              </Button>
            ))}
          </div>
        </div>
        <section
          className="cg-live-layout-frame-option-group"
          aria-label={localizeUi('Fallback background')}
        >
          <span>{localizeUi('Fallback background')}</span>
          <div className="cg-live-layout-frame-option-buttons">
            <Button
              active={fallback?.kind === 'bars'}
              aria-pressed={fallback?.kind === 'bars'}
              disabled={fallbackImage.reading}
              onClick={() => onChange({ fallback: { kind: 'bars' } })}
            >
              {localizeUi('Bars')}
            </Button>
            <span className="cg-live-layout-solid-color">
              <Button
                active={fallback?.kind === 'color'}
                aria-pressed={fallback?.kind === 'color'}
                disabled={fallbackImage.reading}
                onClick={() =>
                  onChange({
                    fallback: {
                      kind: 'color',
                      color:
                        fallback?.kind === 'color'
                          ? fallback.color
                          : liveLayoutArtwork.fallbackColor,
                    },
                  })
                }
              >
                {localizeUi('Solid colour')}
              </Button>
              {fallback?.kind === 'color' && (
                <ColorInput
                  appearance="swatch"
                  aria-label={localizeUi('Fallback colour')}
                  value={fallback.color.slice(0, 7)}
                  onChange={(color) => onChange({ fallback: { kind: 'color', color } })}
                />
              )}
            </span>
            <Button
              active={fallback?.kind === 'image'}
              aria-pressed={fallback?.kind === 'image'}
              title={fallback?.kind === 'image' ? fallback.name : undefined}
              disabled={fallbackImage.reading}
              onClick={() => fallbackPick.current?.click()}
            >
              {fallback?.kind === 'image' ? (
                <LiveLayoutAssetThumbnail kind="image" src={fallbackUrl} />
              ) : (
                <Icon icon={ImagePlus} size={14} />
              )}
              {localizeUi('Image…')}
            </Button>
            <FileInput
              ref={fallbackPick}
              aria-label={localizeUi('Fallback image file')}
              accept={CONTROL_LIVE_LAYOUT_FALLBACK_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file !== undefined) fallbackImage.onPick(file);
              }}
            />
          </div>
          <label
            className="cg-live-layout-frame-option-check"
            htmlFor={id + '-fallback-on-air'}
            title={localizeUi(
              'Show the selected background on air when the input is empty or leaves space in the plate.',
            )}
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
            {localizeUi('Show fallback on air')}
          </label>
        </section>
        <section
          className="cg-live-layout-frame-option-group"
          aria-label={localizeUi('Plate border')}
        >
          <div className="cg-live-layout-plate-border-fields">
            <div className="cg-live-layout-plate-border-color">
              <span>{localizeUi('Border')}</span>
              <ColorInput
                appearance="swatch"
                aria-label={localizeUi('Border color')}
                value={border.color.slice(0, 7)}
                onChange={(color) => onChange({ border: { ...border, color } })}
              />
            </div>
            <LiveLayoutEditorNumber
              key={frame.id}
              label={localizeUi('Border width (px)')}
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
                {localizeUi('Show border in preset')}
              </label>
              {borderVisibility.showInFocus !== undefined && (
                <label className="cg-live-layout-frame-option-check" htmlFor={id + '-border-focus'}>
                  <Checkbox
                    id={id + '-border-focus'}
                    checked={borderVisibility.showInFocus}
                    onChange={borderVisibility.onFocusChange}
                  />
                  {localizeUi('Show border in Focus')}
                </label>
              )}
            </div>
          )}
        </section>
        <section className="cg-live-layout-frame-mask" aria-label={localizeUi('Plate mask')}>
          <div className="cg-live-layout-frame-option-buttons">
            <Button
              variant="neutral"
              disabled={windows.length >= LIVE_REVEAL_MAX_RECTS}
              onClick={addWindow}
            >
              <Icon icon={Plus} size={14} />
              {localizeUi('Add mask window')}
            </Button>
            {mask !== undefined && (
              <>
                <Button variant="neutral" onClick={removeWindow}>
                  <Icon icon={Trash2} size={14} />
                  {localizeUi('Remove mask window')}
                </Button>
                <Button
                  variant="neutral"
                  disabled={!canEditMask}
                  active={editingMask}
                  aria-pressed={editingMask}
                  title={localizeUi(
                    canEditMask
                      ? 'Move or resize the mask in Preview'
                      : 'Show this plate in Preview to edit its mask',
                  )}
                  onClick={() => onMaskEditingChange(!editingMask)}
                >
                  <Icon icon={Move} size={14} />
                  {localizeUi('Edit mask in preview')}
                </Button>
              </>
            )}
          </div>
          {mask !== undefined && activeWindow !== undefined && (
            <>
              <div
                className="cg-live-layout-frame-option-buttons"
                role="group"
                aria-label={localizeUi('Mask mode')}
              >
                <Button
                  active={mask.mode === 'inside'}
                  aria-pressed={mask.mode === 'inside'}
                  onClick={() => onChange({ liveMask: { ...mask, mode: 'inside' } })}
                >
                  {localizeUi('Show inside')}
                </Button>
                <Button
                  active={mask.mode === 'outside'}
                  aria-pressed={mask.mode === 'outside'}
                  onClick={() => onChange({ liveMask: { ...mask, mode: 'outside' } })}
                >
                  {localizeUi('Show outside')}
                </Button>
              </div>
              {windows.length > 1 && (
                <div
                  className="cg-live-layout-frame-option-buttons"
                  role="group"
                  aria-label={localizeUi('Mask windows')}
                >
                  {windows.map((_, index) => (
                    <Button
                      key={index}
                      aria-label={localizeUi('Mask window {number}', { number: index + 1 })}
                      active={index === activeIndex}
                      aria-pressed={index === activeIndex}
                      onClick={() => onSelectMaskWindow(index)}
                    >
                      {index + 1}
                    </Button>
                  ))}
                </div>
              )}
              <div
                className="cg-form-grid cg-live-layout-frame-mask-values"
                key={frame.id + ':' + activeIndex}
              >
                {MASK_FIELDS.map(({ key, limit, label, min }) => (
                  <LiveLayoutEditorNumber
                    key={key}
                    label={localizeUi(label)}
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
          <Icon icon={ShieldCheck} size={14} /> {localizeUi('Operator permissions in CG Control')}
        </h4>
        <label htmlFor={id + '-move'} className="cg-live-layout-frame-option-check">
          <Checkbox
            id={id + '-move'}
            checked={frame.operatorMove ?? true}
            onChange={(operatorMove) => onChange({ operatorMove })}
          />
          {localizeUi('Move plate')}
        </label>
        <div
          className="cg-live-layout-frame-option-group"
          role="group"
          aria-label={localizeUi('Resize plate')}
        >
          <span>{localizeUi('Resize plate')}</span>
          <div className="cg-live-layout-frame-option-buttons">
            {RESIZE_CHOICES.map(([operatorPlacement, label]) => (
              <Button
                key={operatorPlacement}
                active={resize === operatorPlacement}
                aria-pressed={resize === operatorPlacement}
                onClick={() => onChange({ operatorPlacement })}
              >
                {localizeUi(label)}
              </Button>
            ))}
          </div>
        </div>
        <label
          htmlFor={id + '-crop'}
          className="cg-live-layout-frame-option-check"
          aria-label={localizeUi('Crop input')}
          title={localizeUi('Available for unmasked plates using Crop edges')}
        >
          <Checkbox
            id={id + '-crop'}
            checked={mask === undefined && (frame.operatorCrop ?? true)}
            disabled={mask !== undefined}
            onChange={(operatorCrop) => onChange({ operatorCrop })}
          />
          {localizeUi('Crop input')}
        </label>
        {mask !== undefined && (
          <label htmlFor={id + '-mask-edit'} className="cg-live-layout-frame-option-check">
            <Checkbox
              id={id + '-mask-edit'}
              checked={frame.allowOperatorMaskEdit === true}
              onChange={(allowOperatorMaskEdit) => onChange({ allowOperatorMaskEdit })}
            />
            {localizeUi('Allow mask editing')}
          </label>
        )}
      </div>
    </details>
  );
}
