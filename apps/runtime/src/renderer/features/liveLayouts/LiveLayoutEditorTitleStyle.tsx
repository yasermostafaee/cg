import { useUiText } from '../../i18n/locale.js';
import { useId, useRef, useState } from 'react';
import { Plus, Type } from 'lucide-react';
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
import { SelectInput } from '../../ui/SelectInput.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import {
  CONTROL_LIVE_LAYOUT_FONT_ACCEPT,
  controlLiveLayoutTitleGeometry,
} from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import { LiveLayoutEditorSectionHeading } from './LiveLayoutEditorSectionHeading.js';
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
  const id = useId();
  return (
    <label className="cg-form-field" htmlFor={id}>
      {label}
      <SelectInput
        id={id}
        aria-label={label}
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
      </SelectInput>
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
  const localizeUi = useUiText();
  const color = value.slice(0, 7);
  const alpha = value.slice(7);
  return (
    <>
      <div className="cg-form-field cg-live-layout-title-field">
        <span>{label}</span>
        <ColorInput
          appearance="swatch"
          aria-label={label}
          value={color}
          onChange={(next) => onChange(next + alpha)}
        />
      </div>
      <LiveLayoutEditorNumber
        label={localizeUi('{name} opacity (%)', { name: label })}
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
  const localizeUi = useUiText();
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
          aria-label={localizeUi('Enable {name}', { name: label.toLowerCase() })}
          onChange={(next) => onChange(next ? DEFAULT_SHADOW : null)}
        />
        {localizeUi('Enabled')}
      </label>
      {value !== null && (
        <div className="cg-form-grid cg-live-layout-title-fields">
          <LiveLayoutEditorNumber
            label={localizeUi('{name} X (px)', { name: label })}
            value={toTenths(value.offsetX)}
            min={-MAX_LENGTH}
            max={MAX_LENGTH}
            decimal
            onChange={(offsetX) => update({ offsetX })}
          />
          <LiveLayoutEditorNumber
            label={localizeUi('{name} Y (px)', { name: label })}
            value={toTenths(value.offsetY)}
            min={-MAX_LENGTH}
            max={MAX_LENGTH}
            decimal
            onChange={(offsetY) => update({ offsetY })}
          />
          <LiveLayoutEditorNumber
            label={localizeUi('{name} blur (px)', { name: label })}
            value={toTenths(value.blur)}
            min={0}
            max={MAX_LENGTH}
            decimal
            onChange={(blur) => update({ blur })}
          />
          {box && (
            <>
              <LiveLayoutEditorNumber
                label={localizeUi('Box shadow spread (px)')}
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
                {localizeUi('Inset')}
              </label>
            </>
          )}
          <TitleColor
            label={localizeUi('{name} color', { name: label })}
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
  heading = 'Title style',
  shared,
  individualBase = shared,
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
  heading?: string;
  shared: ControlLiveLayoutTitleStyle | undefined;
  individualBase?: ControlLiveLayoutTitleStyle | undefined;
  override: ControlLiveLayoutTitleStyle | undefined;
  fonts: readonly ControlLiveLayoutFont[];
  readingFont: boolean;
  onSharedChange?: StyleChange;
  onOverrideChange: StyleChange;
  onResetOverride: () => void;
  onAddFont: (file: File, scope: StyleScope) => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const [scope, setScope] = useState<StyleScope>('shared');
  const id = useId();
  const fontInput = useRef<HTMLInputElement>(null);
  const sharedSelection = onSharedChange !== undefined && scope === 'shared';
  const onChange = sharedSelection ? onSharedChange : onOverrideChange;
  const title = controlLiveLayoutTitleGeometry(
    raster,
    sharedSelection ? shared : { ...individualBase, ...override },
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
      <LiveLayoutEditorSectionHeading icon={Type} label={localizeUi(heading)} />
      {onSharedChange !== undefined && (
        <div
          className="cg-live-layout-title-scope"
          role="group"
          aria-label={localizeUi('{name} scope', { name: localizeUi(heading) })}
        >
          <Button
            active={sharedSelection}
            aria-pressed={sharedSelection}
            onClick={() => setScope('shared')}
          >
            {localizeUi('All plates')}
          </Button>
          <Button
            active={!sharedSelection}
            aria-pressed={!sharedSelection}
            onClick={() => setScope('frame')}
          >
            {localizeUi('Plate {number}', { number: frameNumber })}
          </Button>
          {!sharedSelection && override !== undefined && (
            <Button variant="neutral" onClick={onResetOverride}>
              {localizeUi('Use shared style')}
            </Button>
          )}
        </div>
      )}
      {onSharedChange === undefined && override !== undefined && (
        <Button variant="neutral" onClick={onResetOverride}>
          {localizeUi('Use plate style')}
        </Button>
      )}
      <div key={sharedSelection ? 'shared' : frameId}>
        <div className="cg-form-grid cg-live-layout-title-fields">
          {numbers.map(({ label, key, min, max }) => (
            <LiveLayoutEditorNumber
              key={key}
              label={localizeUi(label)}
              value={toTenths(title[key])}
              min={min}
              max={max}
              step={0.1}
              decimal
              onChange={(value) => onChange({ [key]: value })}
            />
          ))}
          <Choice
            label={localizeUi('Title font')}
            value={title.fontFamily}
            choices={fontChoices}
            onChange={(fontFamily) => onChange({ fontFamily })}
          />
          <div className="cg-live-layout-font-add">
            <Button
              variant="neutral"
              disabled={readingFont}
              onClick={() => fontInput.current?.click()}
            >
              <Icon icon={Plus} size={14} />{' '}
              {localizeUi(readingFont ? 'Reading font…' : 'Add font')}
            </Button>
            <FileInput
              ref={fontInput}
              aria-label={localizeUi('Add title font file')}
              accept={CONTROL_LIVE_LAYOUT_FONT_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file !== undefined) onAddFont(file, sharedSelection ? 'shared' : 'frame');
              }}
            />
          </div>
          <Choice
            label={localizeUi('Title weight')}
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
            {localizeUi('Italic')}
          </label>
          <Choice
            label={localizeUi('Horizontal alignment')}
            value={title.align}
            choices={ALIGNMENTS.map(({ value, label }) => ({ value, label: localizeUi(label) }))}
            onChange={(align) => onChange({ align })}
          />
          <Choice
            label={localizeUi('Vertical alignment')}
            value={title.verticalAlign}
            choices={VERTICAL_ALIGNMENTS.map(({ value, label }) => ({
              value,
              label: localizeUi(label),
            }))}
            onChange={(verticalAlign) => onChange({ verticalAlign })}
          />
          <TitleColor
            label={localizeUi('Title color')}
            value={title.color}
            onChange={(color) => onChange({ color })}
          />
          <TitleColor
            label={localizeUi('Title background')}
            value={title.backgroundColor}
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
          <label htmlFor={id + '-wrap'} className="cg-live-layout-title-toggle">
            <Checkbox
              id={id + '-wrap'}
              checked={title.wrap}
              onChange={(wrap) => onChange({ wrap })}
            />
            {localizeUi('Text wrap')}
          </label>
        </div>
        <details className="cg-live-layout-title-subsection">
          <summary>{localizeUi('Advanced')}</summary>
          <div className="cg-form-grid cg-live-layout-title-fields">
            <Choice
              label={localizeUi('Digits')}
              value={title.digits}
              choices={DIGITS.map(({ value, label }) => ({ value, label: localizeUi(label) }))}
              onChange={(digits) => onChange({ digits })}
            />
          </div>
          <details className="cg-live-layout-title-subsection">
            <summary>{localizeUi('Path style')}</summary>
            <label htmlFor={id + '-stroke'} className="cg-live-layout-title-toggle">
              <Checkbox
                id={id + '-stroke'}
                checked={stroke !== null}
                aria-label={localizeUi('Enable title stroke')}
                onChange={(next) =>
                  onChange({
                    stroke: next ? { width: 2, color: liveLayoutArtwork.titleText } : null,
                  })
                }
              />
              {localizeUi('Stroke')}
            </label>
            {stroke !== null && (
              <div className="cg-form-grid cg-live-layout-title-fields">
                <LiveLayoutEditorNumber
                  label={localizeUi('Stroke width (px)')}
                  value={toTenths(stroke.width)}
                  min={0}
                  max={MAX_LENGTH}
                  decimal
                  onChange={(width) => onChange({ stroke: { ...stroke, width } })}
                />
                <LiveLayoutEditorNumber
                  label={localizeUi('Stroke dash (px)')}
                  value={toTenths(stroke.dash?.[0] ?? 0)}
                  min={0}
                  max={MAX_LENGTH}
                  decimal
                  onChange={(dash) => onChange({ stroke: { ...stroke, dash: dash ? [dash] : [] } })}
                />
                <TitleColor
                  label={localizeUi('Stroke color')}
                  value={stroke.color}
                  onChange={(color) => onChange({ stroke: { ...stroke, color } })}
                />
              </div>
            )}
          </details>
          <ShadowFields
            label={localizeUi('Text shadow')}
            value={title.textShadow}
            onChange={(textShadow) => onChange({ textShadow })}
          />
          <ShadowFields
            label={localizeUi('Box shadow')}
            value={title.boxShadow}
            box
            onChange={(boxShadow) => onChange({ boxShadow })}
          />
        </details>
      </div>
    </details>
  );
}
