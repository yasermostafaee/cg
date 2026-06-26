import { Maximize, Square } from 'lucide-react';
import type {
  AnimatableProperty,
  ClockElement,
  ClockTarget,
  Element,
  Filter,
  ImageElement,
  Padding,
  RepeaterElement,
  SequenceElement,
  Shadow,
  ShapeElement,
  Stroke,
  TextElement,
  TickerElement,
} from '@cg/shared-schema';
import { columnsForFields } from '../fields/repeater-columns.js';
import {
  SEQUENCE_PRESET_ORDER,
  SEQUENCE_TRANSITION_PRESETS,
  sequencePresetKeyFor,
} from './sequence-presets.js';
import { ListItemsEditor } from '../fields/ListItemsEditor.js';
import { SharedImagePicker } from '../sharedLibrary/SharedImagePicker.js';
import * as dds from './DynamicDataSection.css.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import {
  effectiveColorAt as evColor,
  effectiveNumberAt as evNum,
} from '../timeline/keyframe-helpers.js';
import { KeyframeDot } from './keyframe-diamond.js';
import { applyFillModeChange } from './fill-commit.js';
import { CollapseSection } from './CollapseSection.js';
import {
  ColorField,
  NumberField,
  RealtimeNumberInput,
  SelectField,
  TextField,
  VectorField,
} from './controls.js';
import { cx } from '../../cx.js';
import * as padCss from './TextPaddingSection.css.js';
import { FillField } from './FillPopover.js';
import { FontFamilySelect } from './FontFamilySelect.js';
import { TextStyleSection, TogglePair } from './TextStyleSection.js';
import { AlignButtonGroup, H_ALIGN_OPTIONS, V_ALIGN_OPTIONS } from './AlignButtonGroup.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as radiusCss from './BorderRadiusSection.css.js';
import * as fieldCss from './controls.css.js';

interface Props {
  element: Element;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * Routes to per-element-type style sections. Each type renders its own
 * stack of CollapseSections matching the D-010 reference screenshots:
 *
 *   Shape  → Path style · Border radius · Box Shadow · Filter
 *   Text   → Text · Text Shadow · Box Shadow · Text Padding · Border radius · Filter (D-057)
 *   Image  → Image · Filter
 */
export function StyleSection({ element, selectedKeyframe }: Props): JSX.Element {
  // Self-subscribe so only this section re-renders during playback (the inner
  // type-specific sub-sections re-render with it via the currentFrame prop).
  const currentFrame = useDesignerSelector((s) => s.currentFrame);
  if (element.type === 'text')
    return (
      <TextSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'shape')
    return (
      <ShapeSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'image')
    return (
      <ImageSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'ticker')
    return (
      <TickerSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'clock')
    return (
      <ClockSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'sequence')
    return (
      <SequenceSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'repeater')
    return (
      <RepeaterSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  // composition / container / lottie / video-placeholder have no kind-specific
  // style section, but the universal CSS Filter is animatable on every kind — render
  // it so the right inspector's keyframe-able set matches the timeline-left (D-051
  // parity). Transform comes from InspectorPanel's TransformSection.
  return (
    <FilterSection
      element={element}
      currentFrame={currentFrame}
      selectedKeyframe={selectedKeyframe}
    />
  );
}

interface SectionProps<E extends Element> {
  element: E;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * D-045 — a labeled HORIZONTAL-align row using the shared {@link AlignButtonGroup} (the text
 * group is the model). Clock + sequence (the ticker is a crawl → no horizontal align).
 * Non-keyframable: writes `element.align` via `updateElement`, no diamond.
 */
function HAlignRow({ element }: { element: ClockElement | SequenceElement }): JSX.Element {
  return (
    <div className={fieldCss.row}>
      <span className={fieldCss.label}>align</span>
      <AlignButtonGroup
        ariaLabel="Horizontal alignment"
        current={element.align}
        options={H_ALIGN_OPTIONS}
        onChange={(align) => designerStore.updateElement(element.id, { align } as Partial<Element>)}
      />
    </div>
  );
}

/**
 * D-045 — a labeled VERTICAL-align row using the shared {@link AlignButtonGroup}. Ticker,
 * clock, and sequence. `verticalAlign` defaults to 'middle' (the prior centring).
 * Non-keyframable: writes `element.verticalAlign` via `updateElement`, no diamond.
 */
function VAlignRow({
  element,
}: {
  element: TickerElement | ClockElement | SequenceElement;
}): JSX.Element {
  return (
    <div className={fieldCss.row}>
      <span className={fieldCss.label}>vertical</span>
      <AlignButtonGroup
        ariaLabel="Vertical alignment"
        current={element.verticalAlign ?? 'middle'}
        options={V_ALIGN_OPTIONS}
        onChange={(v) =>
          designerStore.updateElement(element.id, {
            verticalAlign: v,
          } as unknown as Partial<Element>)
        }
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              TEXT
// ────────────────────────────────────────────────────────────────────────

function TextSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<TextElement>): JSX.Element {
  return (
    <>
      {/* D-010-pic-5 — custom layout (toggles, swatches, font dropdown,
          icon chips, alignment button groups). */}
      <TextStyleSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <DropShadowSection
        title="Text Shadow"
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      {/* D-057 — the text element's independent box shadow (box-shadow on the box). */}
      <DropShadowSection
        title="Box Shadow"
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
        keyPrefix="boxShadow"
        staticField="shadow"
      />

      <TextPaddingSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <StrokeSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <BorderRadiusSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              SHAPE
// ────────────────────────────────────────────────────────────────────────

// D-051 — keyframe-ability + which properties the timeline-left and the
// multi-select editor expose now come from the central `field-registry.ts`; the
// diamond here renders via `KeyframeDot` (real iff the registry marks the property
// keyframe-able). Adding/changing a shape property is a single registry edit — no
// more hand-mirroring into shared-properties.ts / keyframe-helpers.ts.
function ShapeSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<ShapeElement>): JSX.Element {
  const id = element.id;
  // Show the EVALUATED value at the playhead when a property is animated, so the
  // inspector reflects what the canvas renders (and a colour edit's result shows
  // immediately) — falling back to the static value when unanimated (B-006).
  const staticFill =
    element.fill !== undefined && element.fill.kind === 'solid' ? element.fill.color : '#000000';
  const fillColor = evColor(element, 'fill.color', currentFrame, staticFill);
  const displayFill =
    element.fill !== undefined && element.fill.kind === 'solid'
      ? { ...element.fill, color: fillColor }
      : element.fill;
  const strokeColor = evColor(
    element,
    'stroke.color',
    currentFrame,
    element.stroke?.color ?? '#000000',
  );
  const strokeWidth = evNum(element, 'stroke.width', currentFrame, element.stroke?.width ?? 0);
  const strokeDashFirst = evNum(
    element,
    'stroke.dash',
    currentFrame,
    element.stroke?.dash?.[0] ?? 0,
  );
  return (
    <>
      <CollapseSection title="Path Style" pinned>
        <FillField
          label="fill"
          value={displayFill}
          onChange={(f) => {
            // A plain solid edit on an already-solid fill keeps the
            // keyframe-aware routing (so fill.color can still animate);
            // switching to / editing a gradient writes the whole Fill.
            if (
              f.kind === 'solid' &&
              (element.fill === undefined || element.fill.kind === 'solid')
            ) {
              designerStore.commitAnimatable(id, 'fill.color', f.color);
            } else {
              // B-014 — switching to a gradient makes fill.color non-keyframe-able;
              // drop the now-orphaned colour track in the same undo step.
              applyFillModeChange(element, 'fill.color', { fill: f } as Partial<Element>);
            }
          }}
          trailing={KeyframeDot(element, 'fill.color', currentFrame, selectedKeyframe)}
        />
        <ColorField
          label="stroke"
          value={strokeColor}
          resetKey={id}
          onCommit={(color) => designerStore.commitAnimatable(id, 'stroke.color', color)}
          trailing={KeyframeDot(element, 'stroke.color', currentFrame, selectedKeyframe)}
        />
        <NumberField
          label="stroke width"
          value={strokeWidth}
          step={1}
          min={0}
          onCommit={(width) => designerStore.commitAnimatable(id, 'stroke.width', width)}
          trailing={KeyframeDot(element, 'stroke.width', currentFrame, selectedKeyframe)}
        />
        <NumberField
          label="dash array"
          value={strokeDashFirst}
          step={1}
          min={0}
          onCommit={(d) => designerStore.commitAnimatable(id, 'stroke.dash', d)}
          trailing={KeyframeDot(element, 'stroke.dash', currentFrame, selectedKeyframe)}
        />
      </CollapseSection>

      <BorderRadiusSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <DropShadowSection
        title="Box Shadow"
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              IMAGE
// ────────────────────────────────────────────────────────────────────────

function ImageSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<ImageElement>): JSX.Element {
  const id = element.id;
  return (
    <>
      <CollapseSection title="Image" defaultExpanded>
        <SelectField
          label="fit"
          value={element.fit}
          options={['contain', 'cover', 'fill', 'none'] as const}
          onCommit={(fit) => designerStore.updateElement(id, { fit } as Partial<Element>)}
        />
        <SharedImagePicker element={element} />
      </CollapseSection>
      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              TICKER
// ────────────────────────────────────────────────────────────────────────

/**
 * D-028 — the ticker/crawler config. There is deliberately NO duration knob:
 * the crawl duration is content-driven (measured width ÷ speed) and the
 * composition's playout `repeat` loops it. The items editor edits the
 * element's authored items (and keeps a bound `list` field's default in sync
 * via the store's `setTickerItems`).
 */
function TickerSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<TickerElement>): JSX.Element {
  const id = element.id;
  return (
    <>
      <CollapseSection title="Ticker" pinned>
        <SelectField
          label="direction"
          value={element.direction}
          options={['rtl', 'ltr'] as const}
          onCommit={(direction) =>
            designerStore.updateElement(id, { direction } as Partial<Element>)
          }
        />
        <NumberField
          label="speed"
          value={element.speed}
          step={10}
          min={1}
          suffix="px/s"
          onCommit={(speed) =>
            designerStore.updateElement(id, { speed: Math.max(1, speed) } as Partial<Element>)
          }
        />
        <NumberField
          label="gap"
          value={element.gap}
          step={4}
          min={0}
          suffix="px"
          onCommit={(gap) =>
            designerStore.updateElement(id, { gap: Math.max(0, gap) } as Partial<Element>)
          }
        />
        <TextField
          label="separator"
          value={element.separator ?? ''}
          resetKey={id}
          onCommit={(separator) =>
            designerStore.updateElement(id, {
              separator: separator === '' ? undefined : separator,
            } as Partial<Element>)
          }
        />
        {/* D-028 — the ticker's INNER repeat loop. A fresh ticker is infinite
            by design; finite passes complete cleanly (the last item fully
            exits) and signal the composition's content-driven hold. */}
        <SelectField
          label="repeat"
          value={element.repeat === 'infinite' ? 'infinite' : 'count'}
          options={['infinite', 'count'] as const}
          onCommit={(v) =>
            designerStore.updateElement(id, {
              repeat: v === 'infinite' ? 'infinite' : 2,
            } as Partial<Element>)
          }
        />
        {element.repeat !== 'infinite' && (
          <NumberField
            label="passes"
            value={element.repeat}
            step={1}
            min={1}
            onCommit={(n) =>
              designerStore.updateElement(id, {
                repeat: Math.max(1, Math.round(n)),
              } as Partial<Element>)
            }
          />
        )}
        <SelectField
          label="cycle seam"
          value={element.cycleBoundary}
          options={['seamless', 'drain'] as const}
          onCommit={(cycleBoundary) =>
            designerStore.updateElement(id, { cycleBoundary } as Partial<Element>)
          }
        />
        <p className={dds.hint}>
          Time-driven: the crawl runs during playback (its pass length comes from the measured
          content width ÷ speed) — scrubbing the timeline doesn’t move it.
        </p>
      </CollapseSection>

      <CollapseSection title="Items" defaultExpanded>
        <ListItemsEditor
          items={element.items}
          label={element.name || 'Ticker'}
          onChange={(items) => designerStore.setTickerItems(id, items)}
        />
      </CollapseSection>

      {/* Style parity with text: family/weight/size, colour, band background. D-052 —
          colour / background / shadow are keyframe-able (the crawl stays time-driven;
          only the box STYLE animates on the timeline). */}
      <CollapseSection title="Ticker Text" defaultExpanded>
        <FontFamilySelect
          value={element.font.family}
          onCommit={(family) =>
            designerStore.updateElement(id, {
              font: { ...element.font, family },
            } as Partial<Element>)
          }
        />
        <SelectField
          label="weight"
          value={String(element.font.weight)}
          options={['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const}
          onCommit={(w) =>
            designerStore.updateElement(id, {
              font: { ...element.font, weight: Number(w) },
            } as Partial<Element>)
          }
        />
        <NumberField
          label="size"
          value={element.font.size}
          step={1}
          min={1}
          suffix="px"
          onCommit={(size) => {
            if (size > 0)
              designerStore.updateElement(id, {
                font: { ...element.font, size },
              } as Partial<Element>);
          }}
        />
        <ColorField
          label="text color"
          value={evColor(element, 'text.color', currentFrame, element.color)}
          resetKey={id}
          onCommit={(color) => designerStore.commitAnimatable(id, 'text.color', color)}
          trailing={KeyframeDot(element, 'text.color', currentFrame, selectedKeyframe)}
        />
        {/* D-045 — the ticker is a crawl: VERTICAL align only (no horizontal). */}
        <VAlignRow element={element} />
      </CollapseSection>

      {/* D-056 — content-driven kinds carry only text: text-shadow only (no box
          drop-shadow / background / padding / stroke / border-radius). */}
      <CollapseSection title="Text Shadow">
        <TickerShadowSection
          element={element}
          currentFrame={currentFrame}
          selectedKeyframe={selectedKeyframe}
        />
      </CollapseSection>

      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              CLOCK
// ────────────────────────────────────────────────────────────────────────

/** Seeded when the operator switches a clock to countdown with no target. */
const DEFAULT_CLOCK_TARGET: ClockTarget = { kind: 'duration', ms: 60_000 };

/** Stored ISO → `<input type="datetime-local">` value (local components). */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * D-027 — the clock config. The clock is time-driven like the ticker (a
 * runtime driver repaints it once per second; scrubbing never moves it) and
 * has NO dynamic fields in v1, so there is no Data section. Text styling
 * mirrors the ticker's parity sections; D-052 — colour / background / shadow /
 * padding are keyframe-able (the clock tick stays time-driven, only the box STYLE
 * animates on the timeline).
 */
/**
 * D-084 — curated IANA zones for the wall-clock picker. 'Local' is the sentinel
 * for "no timezone" (machine-local time). A stored zone outside this list (a
 * hand-edited file) is surfaced as an extra leading option so it stays editable.
 */
const CLOCK_TIMEZONES: readonly string[] = [
  'Local',
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Moscow',
  'Asia/Tehran',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function ClockSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<ClockElement>): JSX.Element {
  const id = element.id;
  const target = element.target;
  return (
    <>
      <CollapseSection title="Clock" pinned>
        <SelectField
          label="mode"
          value={element.mode}
          options={['wall', 'countup', 'countdown'] as const}
          onCommit={(mode) =>
            // Switching to countdown must keep the element schema-valid:
            // countdown REQUIRES a target, so seed one if none is stored yet.
            designerStore.updateElement(id, {
              mode,
              ...(mode === 'countdown' && target === undefined
                ? { target: DEFAULT_CLOCK_TARGET }
                : {}),
            } as Partial<Element>)
          }
        />
        <TextField
          label="format"
          value={element.format}
          resetKey={id}
          onCommit={(format) => {
            if (format !== '') designerStore.updateElement(id, { format } as Partial<Element>);
          }}
        />
        <p className={dds.hint}>
          Tokens: HH H hh h mm m ss s A a — other characters render literally; the largest unit
          absorbs the overflow (mm:ss shows 90:00 for a 90-minute count).
        </p>
        <SelectField
          label="digits"
          value={element.digits}
          options={['persian', 'latin', 'arabic-indic'] as const}
          onCommit={(digits) => designerStore.updateElement(id, { digits } as Partial<Element>)}
        />
        {/* D-084 — wall mode can render a chosen IANA zone; 'Local' clears it. The
            count modes ignore a time zone, so the picker only shows for wall. */}
        {element.mode === 'wall' && (
          <SelectField
            label="time zone"
            value={element.timezone ?? 'Local'}
            options={
              element.timezone !== undefined && !CLOCK_TIMEZONES.includes(element.timezone)
                ? [element.timezone, ...CLOCK_TIMEZONES]
                : CLOCK_TIMEZONES
            }
            onCommit={(tz) =>
              designerStore.updateElement(id, {
                timezone: tz === 'Local' ? undefined : tz,
              } as Partial<Element>)
            }
          />
        )}
        {element.mode === 'countdown' && (
          <>
            <SelectField
              label="target"
              value={(target ?? DEFAULT_CLOCK_TARGET).kind}
              options={['duration', 'datetime'] as const}
              onCommit={(kind) => {
                if (kind === (target ?? DEFAULT_CLOCK_TARGET).kind) return;
                designerStore.updateElement(id, {
                  target:
                    kind === 'duration'
                      ? DEFAULT_CLOCK_TARGET
                      : { kind: 'datetime', iso: new Date().toISOString() },
                } as Partial<Element>);
              }}
            />
            {(target ?? DEFAULT_CLOCK_TARGET).kind === 'duration' ? (
              <NumberField
                label="duration"
                value={Math.round((target?.kind === 'duration' ? target.ms : 60_000) / 1000)}
                step={1}
                min={1}
                suffix="s"
                onCommit={(secs) =>
                  designerStore.updateElement(id, {
                    target: { kind: 'duration', ms: Math.max(1, Math.round(secs)) * 1000 },
                  } as Partial<Element>)
                }
              />
            ) : (
              <div className={dds.hint}>
                <input
                  type="datetime-local"
                  step={1}
                  aria-label="Countdown target date-time"
                  value={target?.kind === 'datetime' ? isoToLocalInput(target.iso) : ''}
                  onChange={(e) => {
                    const d = new Date(e.target.value);
                    if (Number.isNaN(d.getTime())) return;
                    designerStore.updateElement(id, {
                      target: { kind: 'datetime', iso: d.toISOString() },
                    } as Partial<Element>);
                  }}
                />
              </div>
            )}
          </>
        )}
        <p className={dds.hint}>
          Time-driven: the clock repaints once per second during playback — scrubbing the timeline
          doesn’t move it.
        </p>
      </CollapseSection>

      {/* Style parity with the ticker text section: family/weight/size, colour
          (solid or gradient fill), align, box background (default transparent).
          D-052 — colour / background / shadow / padding are keyframe-able (the clock
          tick stays time-driven; only the box STYLE animates on the timeline). */}
      <CollapseSection title="Clock Text" defaultExpanded>
        <FontFamilySelect
          value={element.font.family}
          onCommit={(family) =>
            designerStore.updateElement(id, {
              font: { ...element.font, family },
            } as Partial<Element>)
          }
        />
        <SelectField
          label="weight"
          value={String(element.font.weight)}
          options={['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const}
          onCommit={(w) =>
            designerStore.updateElement(id, {
              font: { ...element.font, weight: Number(w) },
            } as Partial<Element>)
          }
        />
        <NumberField
          label="size"
          value={element.font.size}
          step={1}
          min={1}
          suffix="px"
          onCommit={(size) => {
            if (size > 0)
              designerStore.updateElement(id, {
                font: { ...element.font, size },
              } as Partial<Element>);
          }}
        />
        {/* D-045 — the shared horizontal-align button-group (replaces the dropdown) plus a
            vertical-align group, matching text. Non-keyframable (updateElement, no diamond). */}
        <HAlignRow element={element} />
        <VAlignRow element={element} />
        <FillField
          label="text color"
          value={
            element.colorFill ?? {
              kind: 'solid',
              color: evColor(element, 'text.color', currentFrame, element.color),
            }
          }
          onChange={(f) => {
            // D-052 — a solid edit on a solid colour keyframes; a gradient switch drops
            // the now-orphaned text.color track (B-014).
            if (
              f.kind === 'solid' &&
              (element.colorFill === undefined || element.colorFill.kind === 'solid')
            ) {
              designerStore.commitAnimatable(id, 'text.color', f.color);
            } else {
              applyFillModeChange(element, 'text.color', {
                colorFill: f.kind === 'solid' ? undefined : f,
                ...(f.kind === 'solid' ? { color: f.color } : {}),
              } as Partial<Element>);
            }
          }}
          trailing={KeyframeDot(element, 'text.color', currentFrame, selectedKeyframe)}
        />
      </CollapseSection>

      {/* D-056 — content-driven kinds carry only text: text-shadow only (no box
          drop-shadow / background / padding / stroke / border-radius). */}
      <CollapseSection title="Text Shadow">
        <TickerShadowSection
          element={element}
          currentFrame={currentFrame}
          selectedKeyframe={selectedKeyframe}
        />
      </CollapseSection>

      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              SEQUENCE
// ────────────────────────────────────────────────────────────────────────

/**
 * D-029 — the sequence/now-next config. The transition is DECOMPOSED
 * (IN edge / OUT edge / timing) with named presets over those fields — the
 * preset select shows Custom when the combination matches none (selecting
 * Custom itself is a no-op, same as the EasingEditor). Time-driven like the
 * ticker/clock: a runtime driver advances it; scrubbing never moves it.
 * Items are edited with the shared editor (per-item dwell column on);
 * `setSequenceItems` keeps a bound list field's default in lockstep.
 */
function SequenceSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<SequenceElement>): JSX.Element {
  const id = element.id;
  const presetKey = sequencePresetKeyFor(element);
  return (
    <>
      <CollapseSection title="Sequence" pinned>
        <SelectField
          label="transition"
          value={presetKey}
          options={SEQUENCE_PRESET_ORDER.map((p) => p.key)}
          labels={SEQUENCE_PRESET_ORDER.map((p) => p.label)}
          onCommit={(key) => {
            const preset = SEQUENCE_TRANSITION_PRESETS[key];
            if (preset !== undefined) {
              designerStore.updateElement(id, { ...preset } as Partial<Element>);
            }
            // 'custom' is a display state, not a writable value — no-op.
          }}
        />
        <SelectField
          label="in"
          value={element.transitionIn}
          options={['top', 'bottom', 'left', 'right', 'none'] as const}
          onCommit={(transitionIn) =>
            designerStore.updateElement(id, { transitionIn } as Partial<Element>)
          }
        />
        <SelectField
          label="out"
          value={element.transitionOut}
          options={['top', 'bottom', 'left', 'right', 'none'] as const}
          onCommit={(transitionOut) =>
            designerStore.updateElement(id, { transitionOut } as Partial<Element>)
          }
        />
        <SelectField
          label="timing"
          value={element.transitionTiming}
          options={['simultaneous', 'sequential'] as const}
          onCommit={(transitionTiming) =>
            designerStore.updateElement(id, { transitionTiming } as Partial<Element>)
          }
        />
        <NumberField
          label="transition"
          value={element.transitionMs}
          step={50}
          min={50}
          suffix="ms"
          onCommit={(v) =>
            designerStore.updateElement(id, {
              transitionMs: Math.max(50, Math.round(v)),
            } as Partial<Element>)
          }
        />
        <SelectField
          label="advance"
          value={element.advance}
          options={['auto', 'manual'] as const}
          onCommit={(advance) => designerStore.updateElement(id, { advance } as Partial<Element>)}
        />
        <NumberField
          label="default dwell"
          value={element.defaultDwellMs / 1000}
          step={0.5}
          min={0.1}
          suffix="s"
          onCommit={(secs) =>
            designerStore.updateElement(id, {
              defaultDwellMs: Math.max(100, Math.round(secs * 1000)),
            } as Partial<Element>)
          }
        />
        <SelectField
          label="repeat"
          value={element.repeat === 'infinite' ? 'infinite' : 'count'}
          options={['infinite', 'count'] as const}
          onCommit={(v) =>
            designerStore.updateElement(id, {
              repeat: v === 'infinite' ? 'infinite' : 1,
            } as Partial<Element>)
          }
        />
        {element.repeat !== 'infinite' && (
          <NumberField
            label="passes"
            value={element.repeat}
            step={1}
            min={1}
            onCommit={(n) =>
              designerStore.updateElement(id, {
                repeat: Math.max(1, Math.round(n)),
              } as Partial<Element>)
            }
          />
        )}
        <SelectField
          label="direction"
          value={element.direction}
          options={['rtl', 'ltr'] as const}
          onCommit={(direction) =>
            designerStore.updateElement(id, { direction } as Partial<Element>)
          }
        />
        <p className={dds.hint}>
          Time-driven: items advance on their dwell / on Next during playback — scrubbing the
          timeline doesn’t move the sequence.
        </p>
      </CollapseSection>

      <CollapseSection title="Items" defaultExpanded>
        <ListItemsEditor
          items={element.items}
          label={element.name || 'Sequence'}
          showDwell
          onChange={(items) => designerStore.setSequenceItems(id, items)}
        />
      </CollapseSection>

      {/* Style parity with the ticker/clock text sections. D-052 — colour /
          background / shadow / padding are keyframe-able (paging stays time-driven;
          only the box STYLE animates on the timeline). */}
      <CollapseSection title="Sequence Text" defaultExpanded>
        <FontFamilySelect
          value={element.font.family}
          onCommit={(family) =>
            designerStore.updateElement(id, {
              font: { ...element.font, family },
            } as Partial<Element>)
          }
        />
        <SelectField
          label="weight"
          value={String(element.font.weight)}
          options={['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const}
          onCommit={(w) =>
            designerStore.updateElement(id, {
              font: { ...element.font, weight: Number(w) },
            } as Partial<Element>)
          }
        />
        <NumberField
          label="size"
          value={element.font.size}
          step={1}
          min={1}
          suffix="px"
          onCommit={(size) => {
            if (size > 0)
              designerStore.updateElement(id, {
                font: { ...element.font, size },
              } as Partial<Element>);
          }}
        />
        {/* D-045 — the shared horizontal-align button-group (replaces the dropdown) plus a
            vertical-align group, matching text. Non-keyframable (updateElement, no diamond). */}
        <HAlignRow element={element} />
        <VAlignRow element={element} />
        <FillField
          label="text color"
          value={
            element.colorFill ?? {
              kind: 'solid',
              color: evColor(element, 'text.color', currentFrame, element.color),
            }
          }
          onChange={(f) => {
            // D-052 — a solid edit on a solid colour keyframes; a gradient switch drops
            // the now-orphaned text.color track (B-014).
            if (
              f.kind === 'solid' &&
              (element.colorFill === undefined || element.colorFill.kind === 'solid')
            ) {
              designerStore.commitAnimatable(id, 'text.color', f.color);
            } else {
              applyFillModeChange(element, 'text.color', {
                colorFill: f.kind === 'solid' ? undefined : f,
                ...(f.kind === 'solid' ? { color: f.color } : {}),
              } as Partial<Element>);
            }
          }}
          trailing={KeyframeDot(element, 'text.color', currentFrame, selectedKeyframe)}
        />
      </CollapseSection>

      {/* D-056 — content-driven kinds carry only text: text-shadow only (no box
          drop-shadow / background / padding / stroke / border-radius). */}
      <CollapseSection title="Text Shadow">
        <TickerShadowSection
          element={element}
          currentFrame={currentFrame}
          selectedKeyframe={selectedKeyframe}
        />
      </CollapseSection>

      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              REPEATER
// ────────────────────────────────────────────────────────────────────────

/**
 * D-030 — the repeater config. The child composition select offers only
 * VALID choices (the existing nest cycle guard — self/ancestor references
 * are blocked); the items editor renders one column per child field. Rows
 * render statically on the canvas; at playout the row COUNT stamps at each
 * fresh play while row VALUES update live (model B).
 */
function RepeaterSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<RepeaterElement>): JSX.Element {
  const id = element.id;
  const scene = useDesignerSelector((s) => s.scene);
  const comps = scene?.compositions ?? [];
  // Valid = the existing author-time cycle guard; keep the CURRENT choice
  // listed even if momentarily invalid so the select doesn't jump.
  const options = comps.filter(
    (c) => c.id === element.compositionId || designerStore.canNestCompositionInActive(c.id),
  );
  const child = comps.find((c) => c.id === element.compositionId);
  const columns = columnsForFields(child?.fields);
  return (
    <>
      <CollapseSection title="Repeater" pinned>
        <SelectField
          label="composition"
          value={element.compositionId}
          options={options.map((c) => c.id)}
          labels={options.map((c) => c.name)}
          onCommit={(compositionId) => {
            // The guard above filters the options; re-check on commit so a
            // stale list can never write a cyclic reference.
            if (
              compositionId === element.compositionId ||
              designerStore.canNestCompositionInActive(compositionId)
            ) {
              designerStore.updateElement(id, { compositionId } as Partial<Element>);
            }
          }}
        />
        <SelectField
          label="direction"
          value={element.direction}
          options={['column', 'row'] as const}
          onCommit={(direction) =>
            designerStore.updateElement(id, { direction } as Partial<Element>)
          }
        />
        {element.direction === 'row' && (
          <SelectField
            label="flow"
            value={element.flow}
            options={['rtl', 'ltr'] as const}
            onCommit={(flow) => designerStore.updateElement(id, { flow } as Partial<Element>)}
          />
        )}
        <NumberField
          label="gap"
          value={element.gap}
          step={1}
          min={0}
          suffix="px"
          onCommit={(gap) =>
            designerStore.updateElement(id, { gap: Math.max(0, gap) } as Partial<Element>)
          }
        />
        <NumberField
          label="max items"
          value={element.maxItems ?? 0}
          step={1}
          min={0}
          onCommit={(n) =>
            designerStore.updateElement(id, {
              maxItems: n >= 1 ? Math.round(n) : undefined,
            } as Partial<Element>)
          }
        />
        <p className={dds.hint}>
          Rows stamp one “{child?.name ?? element.compositionId}” per item. Values update live on
          air; the row count is stamped at each play (0 max items = unlimited).
        </p>
      </CollapseSection>

      <CollapseSection title="Rows" defaultExpanded>
        <ListItemsEditor
          items={element.items}
          label={element.name || 'Repeater'}
          columns={columns}
          onChange={(items) => designerStore.setRepeaterItems(id, items)}
        />
      </CollapseSection>

      <FilterSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    </>
  );
}

/**
 * Ticker/clock/sequence **Text Shadow** rows (D-056 — the only shadow these kinds
 * carry). Keyframe-able via the shared `shadow.*` tracks (commitAnimatable + diamond),
 * reading/writing `el.textShadow`. Offset X/Y sit on ONE line (a combined VectorField,
 * like the text/shape shadow sections) per the ب/ج layout fix.
 */
function TickerShadowSection({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<TickerElement | ClockElement | SequenceElement>): JSX.Element {
  const id = element.id;
  const s = element.textShadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
  const offsetX = evNum(element, 'shadow.offsetX', currentFrame, s.offsetX);
  const offsetY = evNum(element, 'shadow.offsetY', currentFrame, s.offsetY);
  const blur = evNum(element, 'shadow.blur', currentFrame, s.blur);
  const color = evColor(element, 'shadow.color', currentFrame, s.color);
  return (
    <>
      <VectorField
        label="offset"
        axes={[
          {
            icon: 'X',
            ariaLabel: 'offset X',
            value: offsetX,
            step: 1,
            suffix: 'px',
            onCommit: (v: number) => designerStore.commitAnimatable(id, 'shadow.offsetX', v),
            point: KeyframeDot(element, 'shadow.offsetX', currentFrame, selectedKeyframe),
          },
          {
            icon: 'Y',
            ariaLabel: 'offset Y',
            value: offsetY,
            step: 1,
            suffix: 'px',
            onCommit: (v: number) => designerStore.commitAnimatable(id, 'shadow.offsetY', v),
            point: KeyframeDot(element, 'shadow.offsetY', currentFrame, selectedKeyframe),
          },
        ]}
      />
      <NumberField
        label="blur"
        value={blur}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'shadow.blur', v)}
        trailing={KeyframeDot(element, 'shadow.blur', currentFrame, selectedKeyframe)}
      />
      <ColorField
        label="color"
        value={color}
        resetKey={id}
        onCommit={(color) => designerStore.commitAnimatable(id, 'shadow.color', color)}
        trailing={KeyframeDot(element, 'shadow.color', currentFrame, selectedKeyframe)}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                       REUSABLE SECTIONS
// ────────────────────────────────────────────────────────────────────────

/**
 * Shadow section for shape / text. D-057 — parameterized so the text element can render
 * TWO independent sections: "Text Shadow" (`keyPrefix='shadow'`, static `textShadow`)
 * and "Box Shadow" (`keyPrefix='boxShadow'`, static `shadow`). Shape uses the defaults
 * (`shadow.*` keys + `el.shadow`), relabelled "Box Shadow". Offset X/Y on one line.
 */
function DropShadowSection({
  title,
  element,
  currentFrame,
  selectedKeyframe,
  keyPrefix = 'shadow',
  staticField,
}: {
  title: string;
  element: ShapeElement | TextElement;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  /** Which animatable keys this section drives: `shadow.*` (default) or `boxShadow.*`. */
  keyPrefix?: 'shadow' | 'boxShadow';
  /** Element field holding the static shadow (default: shape→`shadow`, text→`textShadow`). */
  staticField?: 'shadow' | 'textShadow';
}): JSX.Element {
  const id = element.id;
  const field: 'shadow' | 'textShadow' =
    staticField ?? (element.type === 'shape' ? 'shadow' : 'textShadow');
  const staticShadow: Shadow | undefined = (element as { shadow?: Shadow; textShadow?: Shadow })[
    field
  ];
  const s: Shadow = staticShadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
  // D-043 — the box-shadow sections (field === 'shadow', i.e. shape + text box) carry the
  // spread row + the inset toggle; the text-shadow section (field === 'textShadow') does NOT
  // (CSS text-shadow has neither). This is the guard that keeps spread/inset off text-shadow.
  const isBoxShadow = field === 'shadow';
  const kx: AnimatableProperty = `${keyPrefix}.offsetX`;
  const ky: AnimatableProperty = `${keyPrefix}.offsetY`;
  const kb: AnimatableProperty = `${keyPrefix}.blur`;
  const ks: AnimatableProperty = `${keyPrefix}.spread`;
  const kc: AnimatableProperty = `${keyPrefix}.color`;
  // Evaluated-at-playhead values so animated shadow fields track the canvas.
  const offsetX = evNum(element, kx, currentFrame, s.offsetX);
  const offsetY = evNum(element, ky, currentFrame, s.offsetY);
  const blur = evNum(element, kb, currentFrame, s.blur);
  const spread = evNum(element, ks, currentFrame, s.spread ?? 0);
  const color = evColor(element, kc, currentFrame, s.color);
  return (
    <CollapseSection title={title}>
      <VectorField
        label="offset"
        axes={[
          {
            icon: 'X',
            ariaLabel: 'offset X',
            value: offsetX,
            step: 1,
            suffix: 'px',
            onCommit: (v) => designerStore.commitAnimatable(id, kx, v),
            point: KeyframeDot(element, kx, currentFrame, selectedKeyframe),
          },
          {
            icon: 'Y',
            ariaLabel: 'offset Y',
            value: offsetY,
            step: 1,
            suffix: 'px',
            onCommit: (v) => designerStore.commitAnimatable(id, ky, v),
            point: KeyframeDot(element, ky, currentFrame, selectedKeyframe),
          },
        ]}
      />
      <NumberField
        label="blur"
        value={blur}
        step={1}
        min={0}
        suffix="px"
        onCommit={(v) => designerStore.commitAnimatable(id, kb, v)}
        trailing={KeyframeDot(element, kb, currentFrame, selectedKeyframe)}
      />
      {/* D-043 — box-shadow spread (keyframable, like Blur); box-shadow sections only.
          No min: a negative spread (shrink) is valid CSS. */}
      {isBoxShadow && (
        <NumberField
          label="spread"
          value={spread}
          step={1}
          suffix="px"
          onCommit={(v) => designerStore.commitAnimatable(id, ks, v)}
          trailing={KeyframeDot(element, ks, currentFrame, selectedKeyframe)}
        />
      )}
      <ColorField
        label="color"
        value={color}
        resetKey={`${id}-${keyPrefix}`}
        onCommit={(color) => designerStore.commitAnimatable(id, kc, color)}
        trailing={KeyframeDot(element, kc, currentFrame, selectedKeyframe)}
      />
      {/* D-043 — the non-keyframable inset toggle (Outset/Inset, Outset default). Box-shadow
          sections only; NOT a registry descriptor (boolean + non-animatable), so it writes
          el.shadow.inset directly via updateElement and carries no keyframe diamond. Mirrors
          the per-corner radius toggle (a direct StyleSection control). */}
      {isBoxShadow && (
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>inset</span>
          <TogglePair
            value={s.inset === true ? 'inset' : 'outset'}
            options={[
              { value: 'outset', label: 'Outset' },
              { value: 'inset', label: 'Inset' },
            ]}
            onChange={(v) =>
              designerStore.updateElement(id, {
                shadow: { ...s, inset: v === 'inset' },
              } as Partial<Element>)
            }
          />
        </div>
      )}
    </CollapseSection>
  );
}

function TextPaddingSection({
  element,
  currentFrame,
  selectedKeyframe,
}: {
  element: TextElement;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}): JSX.Element {
  const id = element.id;
  const p: Padding = element.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // D-048 — four inputs side-by-side in one row (top/right/bottom/left), each a
  // compact cell with its keyframe diamond. Matches D-048-textpadding-0.png.
  // Values + commit path (commitAnimatable) + diamonds unchanged from the old
  // one-per-row layout — appearance only.
  const cells = [
    { name: 'top', property: 'padding.top' as const, value: p.top },
    { name: 'right', property: 'padding.right' as const, value: p.right },
    { name: 'bottom', property: 'padding.bottom' as const, value: p.bottom },
    { name: 'left', property: 'padding.left' as const, value: p.left },
  ];
  return (
    <CollapseSection title="Text Padding">
      <div className={padCss.row}>
        {cells.map(({ name, property, value }) => (
          <div key={property} className={cx('cg-field', padCss.cell)}>
            <RealtimeNumberInput
              className={padCss.input}
              value={evNum(element, property, currentFrame, value)}
              step={1}
              min={0}
              onCommit={(v) => designerStore.commitAnimatable(id, property, v)}
              ariaLabel={`Padding ${name}`}
            />
            {KeyframeDot(element, property, currentFrame, selectedKeyframe)}
          </div>
        ))}
      </div>
    </CollapseSection>
  );
}

interface BoxProps {
  element: Element;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * D-042/D-055 — toggle between a single uniform radius and four independent
 * corners. ONE right-edge icon button whose icon reflects the CURRENT mode: a
 * rounded square (uniform → lucide `Square`) or the four-corners glyph
 * (per-corner → lucide `Maximize`), via the shared `Icon`. No raw button.
 */
function RadiusToggle({
  perCorner,
  onClick,
}: {
  perCorner: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <Control
      size="sm"
      onClick={onClick}
      aria-label={perCorner ? 'Use a single border radius' : 'Use per-corner border radius'}
      title={perCorner ? 'Single radius' : 'Per-corner radius'}
    >
      <Icon icon={perCorner ? Maximize : Square} size={12} />
    </Control>
  );
}

const RADIUS_CORNERS = [
  { prop: 'cornerRadius.tl', label: 'top left radius', i: 0 },
  { prop: 'cornerRadius.tr', label: 'top right radius', i: 1 },
  { prop: 'cornerRadius.br', label: 'bottom right radius', i: 2 },
  { prop: 'cornerRadius.bl', label: 'bottom left radius', i: 3 },
] as const satisfies readonly {
  prop: AnimatableProperty;
  label: string;
  i: 0 | 1 | 2 | 3;
}[];

/**
 * D-042 — border radius for any background-capable kind, with a per-element toggle
 * between a single uniform value and four independent corners (tl/tr/br/bl). The
 * value SHAPE is the toggle: a number is uniform, a 4-tuple is per-corner.
 *
 * B-015 — toggling MIGRATES the value + keyframes in one undo, it does not drop them.
 * uniform→per-corner copies the uniform `cornerRadius` keyframes into all four corner
 * sub-tracks (fresh ids) then clears the uniform track. per-corner→uniform takes the
 * top-left corner as the representative — its keyframes migrate onto `cornerRadius`,
 * the other three are dropped (lossless precisely when the four corners are
 * identical) — then clears the four sub-tracks. Clearing the orphaned track in each
 * direction keeps the runtime's track-presence mode in sync with the value shape.
 */
function BorderRadiusSection({ element, currentFrame, selectedKeyframe }: BoxProps): JSX.Element {
  const id = element.id;
  const cr = (element as { cornerRadius?: number | [number, number, number, number] }).cornerRadius;
  const perCorner = Array.isArray(cr);
  const corners: [number, number, number, number] = Array.isArray(cr)
    ? cr
    : typeof cr === 'number'
      ? [cr, cr, cr, cr]
      : [0, 0, 0, 0];

  const toPerCorner = (): void =>
    designerStore.runAsSingleHistoryEntry(() => {
      designerStore.updateElement(id, { cornerRadius: corners } as unknown as Partial<Element>);
      for (const c of RADIUS_CORNERS) designerStore.copyKeyframeTrack(id, 'cornerRadius', c.prop);
      designerStore.clearKeyframeTrack(id, 'cornerRadius');
    });
  const toUniform = (): void =>
    designerStore.runAsSingleHistoryEntry(() => {
      designerStore.updateElement(id, { cornerRadius: corners[0] } as unknown as Partial<Element>);
      // Top-left is the representative; drop any stale uniform track, then migrate tl.
      designerStore.clearKeyframeTrack(id, 'cornerRadius');
      designerStore.copyKeyframeTrack(id, 'cornerRadius.tl', 'cornerRadius');
      for (const c of RADIUS_CORNERS) designerStore.clearKeyframeTrack(id, c.prop);
    });

  // One axis (input + its diamond) for a corner — same wiring for every corner.
  const radiusAxis = (c: (typeof RADIUS_CORNERS)[number]) => ({
    ariaLabel: c.label,
    value: evNum(element, c.prop, currentFrame, corners[c.i]),
    step: 1,
    min: 0,
    onCommit: (v: number) => designerStore.commitAnimatable(id, c.prop, Math.max(0, v)),
    point: KeyframeDot(element, c.prop, currentFrame, selectedKeyframe),
  });

  return (
    <CollapseSection title="Border Radius">
      <div className={radiusCss.row}>
        <div className={radiusCss.fields}>
          {perCorner ? (
            // D-058 — two rows ordered by spatial position (NOT array order):
            // top = top-left, top-right; bottom = bottom-left, bottom-right.
            <div className={radiusCss.corners}>
              <VectorField
                label="radius"
                axes={[radiusAxis(RADIUS_CORNERS[0]), radiusAxis(RADIUS_CORNERS[1])]}
              />
              <VectorField
                label=""
                axes={[radiusAxis(RADIUS_CORNERS[3]), radiusAxis(RADIUS_CORNERS[2])]}
              />
            </div>
          ) : (
            <NumberField
              label="radius"
              value={evNum(element, 'cornerRadius', currentFrame, corners[0])}
              step={1}
              min={0}
              onCommit={(v) => designerStore.commitAnimatable(id, 'cornerRadius', Math.max(0, v))}
              trailing={KeyframeDot(element, 'cornerRadius', currentFrame, selectedKeyframe)}
            />
          )}
        </div>
        <RadiusToggle perCorner={perCorner} onClick={perCorner ? toUniform : toPerCorner} />
      </div>
    </CollapseSection>
  );
}

/**
 * D-042 — stroke / border for the background-capable kinds that don't already have
 * a Path Style section (text, ticker, clock, sequence). The diamond renders only
 * for shapes (Option A — stroke animation on the time-driven kinds is D-052), via
 * the registry-gated `KeyframeDot`, so these kinds get a STATIC stroke section.
 */
function StrokeSection({ element, currentFrame, selectedKeyframe }: BoxProps): JSX.Element {
  const id = element.id;
  const stroke = (element as { stroke?: Stroke }).stroke;
  return (
    <CollapseSection title="Path Style">
      <ColorField
        label="stroke"
        value={stroke?.color ?? '#000000'}
        resetKey={id}
        onCommit={(c) => designerStore.commitAnimatable(id, 'stroke.color', c)}
        trailing={KeyframeDot(element, 'stroke.color', currentFrame, selectedKeyframe)}
      />
      <NumberField
        label="stroke width"
        value={evNum(element, 'stroke.width', currentFrame, stroke?.width ?? 0)}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'stroke.width', v)}
        trailing={KeyframeDot(element, 'stroke.width', currentFrame, selectedKeyframe)}
      />
      <NumberField
        label="dash array"
        value={stroke?.dash?.[0] ?? 0}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'stroke.dash', v)}
        trailing={KeyframeDot(element, 'stroke.dash', currentFrame, selectedKeyframe)}
      />
    </CollapseSection>
  );
}

function FilterSection({
  element,
  currentFrame,
  selectedKeyframe,
}: {
  element: Element;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}): JSX.Element {
  const id = element.id;
  const f: Filter = element.filter ?? {};
  function row(
    label: string,
    property: AnimatableProperty,
    fallback: number,
    step: number,
    min: number | undefined,
    max: number | undefined,
    suffix: string | undefined,
  ): JSX.Element {
    const key = property.slice('filter.'.length) as keyof Filter;
    const value = evNum(element, property, currentFrame, f[key] ?? fallback);
    return (
      <NumberField
        label={label}
        value={value}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        {...(suffix !== undefined ? { suffix } : {})}
        onCommit={(v) => designerStore.commitAnimatable(id, property, v)}
        trailing={KeyframeDot(element, property, currentFrame, selectedKeyframe)}
      />
    );
  }
  return (
    <CollapseSection title="Filter">
      {row('blur', 'filter.blur', 0, 0.5, 0, undefined, 'px')}
      {row('brightness', 'filter.brightness', 100, 1, 0, undefined, '%')}
      {row('contrast', 'filter.contrast', 100, 1, 0, undefined, '%')}
      {row('grayscale', 'filter.grayscale', 0, 1, 0, 100, '%')}
      {row('hue rotate', 'filter.hueRotate', 0, 1, undefined, undefined, '°')}
      {row('invert', 'filter.invert', 0, 1, 0, 100, '%')}
      {row('opacity', 'filter.opacity', 100, 1, 0, 100, '%')}
      {row('saturate', 'filter.saturate', 100, 1, 0, undefined, '%')}
      {row('sepia', 'filter.sepia', 0, 1, 0, 100, '%')}
    </CollapseSection>
  );
}
