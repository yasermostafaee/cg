import {
  FieldDigitsSchema,
  upcomingProgramsCardStyleOf,
  type UpcomingProgramsElement,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { CollapseSection } from './CollapseSection.js';
import { DigitsField } from './DigitsField.js';
import { CheckRow } from './DynamicDataSection.js';
import { FontFamilySelect } from './FontFamilySelect.js';
import { ColorField, NumberField, SelectField, VectorField } from './controls.js';

type CardStyle = NonNullable<UpcomingProgramsElement['cardStyle']>;
type TextStyle = NonNullable<CardStyle['title']>;
type CardRect = NonNullable<TextStyle['rect']>;
type ResolvedTextStyle = ReturnType<typeof upcomingProgramsCardStyleOf>['title'];

export function UpcomingProgramsCardSections({
  element,
  update,
}: {
  element: UpcomingProgramsElement;
  update: (patch: CardStyle) => void;
}): JSX.Element {
  const style = upcomingProgramsCardStyleOf(element);
  const { w, h } = element.transform.size;
  const showsSeveral = element.layout === 'grid' || element.layout === 'carousel';
  const updateMedia = (patch: NonNullable<CardStyle['media']>): void =>
    update({ media: { ...element.cardStyle?.media, ...patch } });
  const updateCarousel = (patch: NonNullable<CardStyle['carousel']>): void =>
    update({ carousel: { ...element.cardStyle?.carousel, ...patch } });
  return (
    <>
      <CollapseSection title="Card appearance">
        <OptionalPixelsField
          label="Card width"
          value={style.width}
          initial={showsSeveral ? Math.min(320, w) : w}
          onCommit={(width) => update({ width })}
        />
        <OptionalPixelsField
          label="Card height"
          value={style.height}
          initial={h}
          onCommit={(height) => update({ height })}
        />
        {showsSeveral && (
          <>
            <OptionalPixelsField
              label="Card gap"
              value={style.gap}
              initial={16}
              min={0}
              onCommit={(gap) => update({ gap })}
            />
            <SelectField
              label="Vertical alignment"
              options={['top', 'center', 'bottom'] as const}
              labels={['Top', 'Center', 'Bottom']}
              value={style.verticalAlign}
              onCommit={(verticalAlign) => update({ verticalAlign })}
            />
          </>
        )}
        <ColorField
          label="Card background"
          value={style.background}
          onCommit={(background) => update({ background })}
        />
        <ColorField
          label="Focused background"
          value={style.focusedBackground}
          onCommit={(focusedBackground) => update({ focusedBackground })}
        />
        <ColorField
          label="Border"
          value={style.borderColor}
          onCommit={(borderColor) => update({ borderColor })}
        />
        <ColorField
          label="Focused border"
          value={style.focusedBorderColor}
          onCommit={(focusedBorderColor) => update({ focusedBorderColor })}
        />
        <NumberField
          label="Border width"
          value={style.borderWidth}
          step={1}
          min={0}
          suffix="px"
          onCommit={(borderWidth) => {
            if (borderWidth >= 0) update({ borderWidth });
          }}
        />
        <NumberField
          label="Corner radius"
          value={style.cornerRadius}
          step={1}
          min={0}
          suffix="px"
          onCommit={(cornerRadius) => {
            if (cornerRadius >= 0) update({ cornerRadius });
          }}
        />
      </CollapseSection>
      {element.layout === 'carousel' && (
        <CollapseSection title="Carousel focus">
          <SelectField
            label="Focus behavior"
            options={['fixed', 'across'] as const}
            labels={['Fixed slot', 'Across cards']}
            value={style.carousel.focusMovement}
            onCommit={(focusMovement) => updateCarousel({ focusMovement })}
          />
          {style.carousel.focusMovement === 'fixed' ? (
            <SelectField
              label="Focus position"
              options={['start', 'center', 'end'] as const}
              labels={['Start', 'Center', 'End']}
              value={style.carousel.focusPosition}
              onCommit={(focusPosition) => updateCarousel({ focusPosition })}
            />
          ) : (
            <NumberField
              label="Focus move duration"
              value={style.carousel.focusMotionMs / 1000}
              min={0}
              max={Number.MAX_SAFE_INTEGER / 1000}
              step={0.05}
              suffix="s"
              onCommit={(seconds) => {
                const focusMotionMs = Math.round(seconds * 1000);
                if (Number.isSafeInteger(focusMotionMs) && focusMotionMs >= 0) {
                  updateCarousel({ focusMotionMs });
                }
              }}
            />
          )}
          <CheckRow
            label="Allow focus overlap"
            title="Let the enlarged card cover its neighbors."
            checked={style.carousel.allowOverlap}
            onChange={(allowOverlap) => updateCarousel({ allowOverlap })}
          />
          <CardPercentField
            label="Focused scale"
            value={style.carousel.focusedScale}
            min={10}
            max={200}
            onCommit={(focusedScale) => updateCarousel({ focusedScale })}
          />
          <CardPercentField
            label="Unfocused scale"
            value={style.carousel.unfocusedScale}
            min={10}
            max={200}
            onCommit={(unfocusedScale) => updateCarousel({ unfocusedScale })}
          />
          <CardPercentField
            label="Focused opacity"
            value={style.carousel.focusedOpacity}
            min={0}
            max={100}
            onCommit={(focusedOpacity) => updateCarousel({ focusedOpacity })}
          />
          <CardPercentField
            label="Unfocused opacity"
            value={style.carousel.unfocusedOpacity}
            min={0}
            max={100}
            onCommit={(unfocusedOpacity) => updateCarousel({ unfocusedOpacity })}
          />
        </CollapseSection>
      )}
      <CollapseSection title="Card title">
        <CardTextFields
          label="Title"
          value={style.title}
          initialFontSize={32}
          update={(patch) => update({ title: { ...element.cardStyle?.title, ...patch } })}
        />
      </CollapseSection>
      {element.layout === 'carousel' && (
        <>
          <CollapseSection title="Focused card title">
            <CardTextFields
              label="Focused title"
              value={style.focusedTitle}
              initialFontSize={32}
              update={(patch) =>
                update({ focusedTitle: { ...element.cardStyle?.focusedTitle, ...patch } })
              }
              focus={{
                authored: element.cardStyle?.focusedTitle,
                reset: () => update({ focusedTitle: undefined }),
              }}
            />
          </CollapseSection>
          <CollapseSection title="Focused card airtime">
            <CardTextFields
              label="Focused airtime"
              value={style.focusedAirtime}
              initialFontSize={22}
              update={(patch) =>
                update({ focusedAirtime: { ...element.cardStyle?.focusedAirtime, ...patch } })
              }
              focus={{
                authored: element.cardStyle?.focusedAirtime,
                reset: () => update({ focusedAirtime: undefined }),
              }}
            />
          </CollapseSection>
        </>
      )}
      <CollapseSection title="Card airtime">
        <CardTextFields
          label="Airtime"
          value={style.airtime}
          initialFontSize={22}
          update={(patch) => update({ airtime: { ...element.cardStyle?.airtime, ...patch } })}
        />
      </CollapseSection>
      <CollapseSection title="Media frame">
        <CheckRow
          label="Show media frame"
          checked={style.media.visible}
          onChange={(visible) => updateMedia({ visible })}
        />
        {style.media.visible && (
          <>
            <CardRectFields
              label="Media"
              value={style.media.rect}
              onCommit={(rect) => updateMedia({ rect })}
            />
            <SelectField
              label="Media fit"
              options={['contain', 'cover'] as const}
              labels={['Contain', 'Cover']}
              value={style.media.fit}
              onCommit={(fit) => updateMedia({ fit })}
            />
            <NumberField
              label="Frame border width"
              value={style.media.borderWidth}
              min={0}
              step={1}
              suffix="px"
              onCommit={(borderWidth) => updateMedia({ borderWidth })}
            />
            <ColorField
              label="Frame border"
              value={style.media.borderColor}
              onCommit={(borderColor) => updateMedia({ borderColor })}
            />
            <NumberField
              label="Frame corner radius"
              value={style.media.cornerRadius}
              min={0}
              step={1}
              suffix="px"
              onCommit={(cornerRadius) => updateMedia({ cornerRadius })}
            />
            <ColorField
              label="Frame background"
              value={style.media.backgroundColor}
              onCommit={(backgroundColor) => updateMedia({ backgroundColor })}
            />
          </>
        )}
      </CollapseSection>
    </>
  );
}

function CardPercentField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (ratio: number) => void;
}): JSX.Element {
  return (
    <NumberField
      label={label}
      value={Math.round(value * 100)}
      min={min}
      max={max}
      step={1}
      suffix="%"
      onCommit={(percent) => onCommit(percent / 100)}
    />
  );
}

function OptionalPixelsField({
  label,
  value,
  initial,
  min = 1,
  onCommit,
  inherit,
}: {
  label: string;
  value: number | undefined;
  initial: number;
  min?: number;
  onCommit: (value: number | undefined) => void;
  inherit?: { active: boolean; onCommit: () => void } | undefined;
}): JSX.Element {
  return (
    <>
      <SelectField
        label={`${label} mode`}
        options={inherit === undefined ? ['auto', 'fixed'] : ['inherit', 'auto', 'fixed']}
        labels={inherit === undefined ? ['Auto', 'Fixed'] : ['Inherit', 'Auto', 'Fixed']}
        value={inherit?.active === true ? 'inherit' : value === undefined ? 'auto' : 'fixed'}
        onCommit={(mode) => {
          if (mode === 'inherit') inherit?.onCommit();
          else onCommit(mode === 'auto' ? undefined : Math.max(min, Math.round(value ?? initial)));
        }}
      />
      {value !== undefined && inherit?.active !== true && (
        <NumberField
          label={label}
          value={value}
          min={min}
          step={1}
          suffix="px"
          onCommit={(pixels) => {
            if (pixels >= min) onCommit(pixels);
          }}
        />
      )}
    </>
  );
}

function CardTextFields({
  label,
  value,
  initialFontSize,
  update,
  focus,
}: {
  label: 'Title' | 'Airtime' | 'Focused title' | 'Focused airtime';
  value: ResolvedTextStyle;
  initialFontSize: number;
  update: (patch: TextStyle) => void;
  focus?: { authored: TextStyle | undefined; reset: () => void } | undefined;
}): JSX.Element {
  return (
    <>
      <FontFamilySelect
        ariaLabel={`${label} font family`}
        value={value.fontFamily}
        onCommit={(fontFamily) => update({ fontFamily })}
      />
      <OptionalPixelsField
        label={`${label} font size`}
        value={value.fontSize}
        initial={initialFontSize}
        onCommit={(fontSize) =>
          update({ fontSize: fontSize ?? (focus === undefined ? undefined : null) })
        }
        inherit={
          focus === undefined
            ? undefined
            : {
                active: focus.authored?.fontSize === undefined,
                onCommit: () => update({ fontSize: undefined }),
              }
        }
      />
      <NumberField
        label={`${label} weight`}
        value={value.fontWeight}
        min={100}
        max={900}
        step={100}
        onCommit={(fontWeight) => update({ fontWeight: Math.round(fontWeight) })}
      />
      <ColorField
        label={`${label} color`}
        value={value.color}
        onCommit={(color) => update({ color })}
      />
      <SelectField
        label={`${label} alignment`}
        options={['start', 'center', 'end', 'left', 'right'] as const}
        labels={['Start', 'Center', 'End', 'Left', 'Right']}
        value={value.align}
        onCommit={(align) => update({ align })}
      />
      <SelectField
        label={`${label} direction`}
        options={['auto', 'rtl', 'ltr'] as const}
        labels={['Auto', 'Right to left', 'Left to right']}
        value={value.direction}
        onCommit={(direction) => update({ direction })}
      />
      <DigitsField
        label={`${label} digits`}
        value={value.digits}
        options={FieldDigitsSchema.options}
        onCommit={(digits) => update({ digits })}
        inherit={
          focus === undefined
            ? undefined
            : {
                active: focus.authored?.digits === undefined,
                onCommit: () => update({ digits: undefined }),
              }
        }
      />
      <CardRectFields label={label} value={value.rect} onCommit={(rect) => update({ rect })} />
      {focus !== undefined && (
        <Button size="sm" disabled={focus.authored === undefined} onClick={focus.reset}>
          Reset to card style
        </Button>
      )}
    </>
  );
}

function CardRectFields({
  label,
  value,
  onCommit,
}: {
  label: 'Title' | 'Airtime' | 'Focused title' | 'Focused airtime' | 'Media';
  value: CardRect;
  onCommit: (rect: CardRect) => void;
}): JSX.Element {
  const axis = (property: keyof CardRect, icon: string, name: string, min: number) => ({
    icon,
    ariaLabel: `${label} ${name}`,
    value: value[property] * 100,
    step: 1,
    min,
    max: 100,
    suffix: '%',
    onCommit: (percent: number) => {
      if (percent >= min && percent <= 100) onCommit({ ...value, [property]: percent / 100 });
    },
  });
  return (
    <>
      <VectorField label="Position" axes={[axis('x', 'X', 'X', 0), axis('y', 'Y', 'Y', 0)]} />
      <VectorField
        label="Region size"
        axes={[axis('width', 'W', 'width', 1), axis('height', 'H', 'height', 1)]}
      />
    </>
  );
}
