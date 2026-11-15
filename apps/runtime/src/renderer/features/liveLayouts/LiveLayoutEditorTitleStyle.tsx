import { useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  CONTROL_LIVE_LAYOUT_TITLE_FONTS,
  CONTROL_LIVE_LAYOUT_TITLE_SIZE_MAX_PERCENT,
  CONTROL_LIVE_LAYOUT_TITLE_SIZE_MIN_PERCENT,
  controlLiveLayoutFontFamily,
  type ControlLiveLayoutFont,
  type ControlLiveLayoutTitleStyle,
  type Resolution,
  type Shadow,
} from '@cg/shared-schema';
import { liveLayoutArtwork } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import {
  CONTROL_LIVE_LAYOUT_FONT_ACCEPT,
  controlLiveLayoutTitleGeometry,
} from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import './live-layout-title-style.css';

type StyleChange = (patch: ControlLiveLayoutTitleStyle) => void;
type StyleScope = 'shared' | 'frame';

const MAX_LENGTH = 10000;
const DEFAULT_SHADOW: Shadow = {
  offsetX: 0,
  offsetY: 3,
  blur: 6,
  color: liveLayoutArtwork.titleShadow,
};
const ALIGNMENTS = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'justify', label: 'Justify' },
] as const;
const VERTICAL_ALIGNMENTS = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
] as const;

const DIGITS = [
  { value: 'as-typed', label: 'Keyboard' },
  { value: 'persian', label: 'Persian' },
  { value: 'latin', label: 'Latin' },
  { value: 'arabic-indic', label: 'Arabic-Indic' },
] as const;

const toTenths = (value: number): number => Math.round(value * 10) / 10;

function Choice<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        className="cg-field"
        value={value}
        onChange={(event) => {
          const choice = choices.find((item) => item.value === event.currentTarget.value);
          if (choice !== undefined) onChange(choice.value);
        }}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TitleColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}): JSX.Element {
  const color = value.slice(0, 7);
  const alpha = value.slice(7);
  return (
    <>
      <div className="cg-live-layout-title-field">
        <span>{label}</span>
        <ColorInput
          className="cg-field"
          aria-label={label}
          value={color}
          onChange={(next) => onChange(next + alpha)}
        />
      </div>
      <LiveLayoutEditorNumber
        label={label + ' opacity (%)'}
        value={alpha === '' ? 100 : Math.round((Number.parseInt(alpha, 16) / 255) * 100)}
        min={0}
        max={100}
        onChange={(next) => {
          const opacityHex = Math.round((next / 100) * 255)
            .toString(16)
            .padStart(2, '0');
          onChange(color + opacityHex);
        }}
      />
    </>
  );
}

function ShadowFields({
  label,
  value,
  box,
  onChange,
}: {
  label: string;
  value: Shadow | null;
  box?: boolean;
  onChange: (value: Shadow | null) => void;
}): JSX.Element {
  const id = useId();

  function update(patch: Partial<Shadow>): void {
    if (value !== null) onChange({ ...value, ...patch });
  }

  return (
    <details className="cg-live-layout-title-subsection">
      <summary>{label}</summary>
      <label htmlFor={id + '-enabled'} className="cg-live-layout-title-toggle">
        <Checkbox
          id={id + '-enabled'}
          checked={value !== null}
          aria-label={'Enable ' + label.toLowerCase()}
          onChange={(next) => onChange(next ? DEFAULT_SHADOW : null)}
        />
        Enabled
      </label>
      {value !== null && (
        <div className="cg-live-layout-title-fields">
          <LiveLayoutEditorNumber
            label={label + ' X (px)'}
            value={toTenths(value.offsetX)}
            min={-MAX_LENGTH}
            max={MAX_LENGTH}
            decimal
            onChange={(offsetX) => update({ offsetX })}
          />
          <LiveLayoutEditorNumber
            label={label + ' Y (px)'}
            value={toTenths(value.offsetY)}
            min={-MAX_LENGTH}
            max={MAX_LENGTH}
            decimal
            onChange={(offsetY) => update({ offsetY })}
          />
          <LiveLayoutEditorNumber
            label={label + ' blur (px)'}
            value={toTenths(value.blur)}
            min={0}
            max={MAX_LENGTH}
            decimal
            onChange={(blur) => update({ blur })}
          />
          {box && (
            <>
              <LiveLayoutEditorNumber
                label="Box shadow spread (px)"
                value={toTenths(value.spread ?? 0)}
                min={-MAX_LENGTH}
                max={MAX_LENGTH}
                decimal
                onChange={(spread) => update({ spread })}
              />
              <label htmlFor={id + '-inset'} className="cg-live-layout-title-toggle">
                <Checkbox
                  id={id + '-inset'}
                  checked={value.inset ?? false}
                  onChange={(inset) => update({ inset })}
                />
                Inset
              </label>
            </>
          )}
          <TitleColor
            label={label + ' color'}
            value={value.color}
            onChange={(color) => update({ color })}
          />
        </div>
      )}
    </details>
  );
}

export function LiveLayoutEditorTitleStyle({
  raster,
  frameId,
  frameNumber,
  shared,
  override,
  fonts,
  readingFont,
  onSharedChange,
  onOverrideChange,
  onResetOverride,
  onAddFont,
}: {
  raster: Resolution;
  frameId: string;
  frameNumber: number;
  shared: ControlLiveLayoutTitleStyle | undefined;
  override: ControlLiveLayoutTitleStyle | undefined;
  fonts: readonly ControlLiveLayoutFont[];
  readingFont: boolean;
  onSharedChange: StyleChange;
  onOverrideChange: StyleChange;
  onResetOverride: () => void;
  onAddFont: (file: File, scope: StyleScope) => void;
}): JSX.Element {
  const [scope, setScope] = useState<StyleScope>('shared');
  const id = useId();
  const fontInput = useRef<HTMLInputElement>(null);
  const editFrame = scope === 'frame';
  const onChange = editFrame ? onOverrideChange : onSharedChange;
  const title = controlLiveLayoutTitleGeometry(
    raster,
    editFrame ? { ...shared, ...override } : shared,
  );
  const fontChoices = [
    ...fonts.map(({ id, name }) => ({ value: controlLiveLayoutFontFamily(id), label: name })),
    ...CONTROL_LIVE_LAYOUT_TITLE_FONTS.map((font) => ({ value: font, label: font })),
  ];
  const { stroke } = title;
  const numbers = [
    { label: 'Title X (%)', key: 'xPercent', min: 0, max: 100 },
    { label: 'Title Y (%)', key: 'yPercent', min: 0, max: 100 },
    { label: 'Box width (%)', key: 'widthPercent', min: 1, max: 100 },
    { label: 'Box height (%)', key: 'heightPercent', min: 1, max: 100 },
    { label: 'Title padding (px)', key: 'padding', min: 0, max: MAX_LENGTH },
    { label: 'Text vertical offset (px)', key: 'textOffsetY', min: -MAX_LENGTH, max: MAX_LENGTH },
    {
      label: 'Title size (%)',
      key: 'sizePercent',
      min: CONTROL_LIVE_LAYOUT_TITLE_SIZE_MIN_PERCENT,
      max: CONTROL_LIVE_LAYOUT_TITLE_SIZE_MAX_PERCENT,
    },
    { label: 'Corner radius (px)', key: 'borderRadius', min: 0, max: MAX_LENGTH },
  ] as const;

  return (
    <details className="cg-live-layout-title-style">
      <summary>Title style</summary>
      <div className="cg-live-layout-title-scope" role="group" aria-label="Title style scope">
        <Button active={!editFrame} aria-pressed={!editFrame} onClick={() => setScope('shared')}>
          All frames
        </Button>
        <Button active={editFrame} aria-pressed={editFrame} onClick={() => setScope('frame')}>
          Frame {frameNumber}
        </Button>
        {editFrame && override !== undefined && (
          <Button variant="secondary" onClick={onResetOverride}>
            Use shared style
          </Button>
        )}
      </div>
      <div key={editFrame ? frameId : scope}>
        <div className="cg-live-layout-title-fields">
          {numbers.map(({ label, key, min, max }) => (
            <LiveLayoutEditorNumber
              key={key}
              label={label}
              value={toTenths(title[key])}
              min={min}
              max={max}
              step={0.1}
              decimal
              onChange={(value) => onChange({ [key]: value })}
            />
          ))}
          <Choice
            label="Title font"
            value={title.fontFamily}
            choices={fontChoices}
            onChange={(fontFamily) => onChange({ fontFamily })}
          />
          <div className="cg-live-layout-font-add">
            <Button variant="add" disabled={readingFont} onClick={() => fontInput.current?.click()}>
              <Icon icon={Plus} size={14} /> {readingFont ? 'Reading font…' : 'Add font'}
            </Button>
            <FileInput
              ref={fontInput}
              aria-label="Add title font file"
              accept={CONTROL_LIVE_LAYOUT_FONT_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file !== undefined) onAddFont(file, scope);
              }}
            />
          </div>
          <Choice
            label="Title weight"
            value={String(title.fontWeight)}
            choices={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => ({
              value: String(weight),
              label: String(weight),
            }))}
            onChange={(weight) => onChange({ fontWeight: Number(weight) })}
          />
          <label htmlFor={id + '-italic'} className="cg-live-layout-title-toggle">
            <Checkbox
              id={id + '-italic'}
              checked={title.fontStyle === 'italic'}
              onChange={(italic) => onChange({ fontStyle: italic ? 'italic' : 'normal' })}
            />
            Italic
          </label>
          <Choice
            label="Horizontal alignment"
            value={title.align}
            choices={ALIGNMENTS}
            onChange={(align) => onChange({ align })}
          />
          <Choice
            label="Vertical alignment"
            value={title.verticalAlign}
            choices={VERTICAL_ALIGNMENTS}
            onChange={(verticalAlign) => onChange({ verticalAlign })}
          />
          <TitleColor
            label="Title color"
            value={title.color}
            onChange={(color) => onChange({ color })}
          />
          <TitleColor
            label="Title background"
            value={title.backgroundColor}
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
          <label htmlFor={id + '-wrap'} className="cg-live-layout-title-toggle">
            <Checkbox
              id={id + '-wrap'}
              checked={title.wrap}
              onChange={(wrap) => onChange({ wrap })}
            />
            Text wrap
          </label>
        </div>
        <details className="cg-live-layout-title-subsection">
          <summary>Advanced</summary>
          <div className="cg-live-layout-title-fields">
            <Choice
              label="Digits"
              value={title.digits}
              choices={DIGITS}
              onChange={(digits) => onChange({ digits })}
            />
          </div>
          <details className="cg-live-layout-title-subsection">
            <summary>Path style</summary>
            <label htmlFor={id + '-stroke'} className="cg-live-layout-title-toggle">
              <Checkbox
                id={id + '-stroke'}
                checked={stroke !== null}
                aria-label="Enable title stroke"
                onChange={(next) =>
                  onChange({
                    stroke: next ? { width: 2, color: liveLayoutArtwork.titleText } : null,
                  })
                }
              />
              Stroke
            </label>
            {stroke !== null && (
              <div className="cg-live-layout-title-fields">
                <LiveLayoutEditorNumber
                  label="Stroke width (px)"
                  value={toTenths(stroke.width)}
                  min={0}
                  max={MAX_LENGTH}
                  decimal
                  onChange={(width) => onChange({ stroke: { ...stroke, width } })}
                />
                <LiveLayoutEditorNumber
                  label="Stroke dash (px)"
                  value={toTenths(stroke.dash?.[0] ?? 0)}
                  min={0}
                  max={MAX_LENGTH}
                  decimal
                  onChange={(dash) => onChange({ stroke: { ...stroke, dash: dash ? [dash] : [] } })}
                />
                <TitleColor
                  label="Stroke color"
                  value={stroke.color}
                  onChange={(color) => onChange({ stroke: { ...stroke, color } })}
                />
              </div>
            )}
          </details>
          <ShadowFields
            label="Text shadow"
            value={title.textShadow}
            onChange={(textShadow) => onChange({ textShadow })}
          />
          <ShadowFields
            label="Box shadow"
            value={title.boxShadow}
            box
            onChange={(boxShadow) => onChange({ boxShadow })}
          />
        </details>
      </div>
    </details>
  );
}
