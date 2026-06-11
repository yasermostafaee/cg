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
import * as dds from './DynamicDataSection.css.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import {
  effectiveAnimatableValue,
  effectiveColorAt as evColor,
  effectiveNumberAt as evNum,
  hasKeyframeAt,
  keyframeVariantFor,
} from '../timeline/keyframe-helpers.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField, TextField, VectorField } from './controls.js';
import { FillField } from './FillPopover.js';
import { FontFamilySelect } from './FontFamilySelect.js';
import { TextStyleSection } from './TextStyleSection.js';

interface Props {
  element: Element;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * D-010 — empty point icon for property rows that aren't yet in
 * AnimatableProperty (currently colours and the shape "kind" select).
 * Clicking is a no-op.
 */
function pointIcon(label: string): JSX.Element {
  return (
    <KeyframeIndicator
      variant="empty"
      onClick={() => {
        /* intentionally no-op — colour properties not yet animatable */
      }}
      ariaLabel={`${label} — animation not yet supported`}
    />
  );
}

/**
 * Real keyframe indicator for a numeric or colour animatable property.
 * Reads variant from keyframeVariantFor; clicking toggles a keyframe at the
 * current frame. The added keyframe CAPTURES the evaluated value at the playhead
 * (what the field shows and the canvas renders), with `read` as the static
 * fallback when the property isn't yet animated — so adding a keyframe past an
 * existing one holds the animated value instead of reverting it (B-005/B-006).
 */
function animPointIcon(
  element: Element,
  property: AnimatableProperty,
  currentFrame: number,
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null,
  read: (el: Element) => number | string,
): JSX.Element {
  const variant = keyframeVariantFor(element, property, currentFrame, selectedKeyframe);
  return (
    <KeyframeIndicator
      variant={variant}
      onClick={() => {
        if (hasKeyframeAt(element, property, currentFrame)) {
          designerStore.removeKeyframe(element.id, property, currentFrame);
        } else {
          const value = effectiveAnimatableValue(element, property, currentFrame, read(element));
          designerStore.upsertKeyframe(element.id, property, currentFrame, value);
        }
      }}
      ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)}`}
    />
  );
}

/**
 * Routes to per-element-type style sections. Each type renders its own
 * stack of CollapseSections matching the D-010 reference screenshots:
 *
 *   Shape  → Path style · Border radius · Drop Shadow · Filter
 *   Text   → Text · Drop Shadow · Text Padding · Border radius · Filter
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
  return <></>;
}

interface SectionProps<E extends Element> {
  element: E;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
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
        title="Drop Shadow"
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <TextPaddingSection
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
              designerStore.updateElement(id, { fill: f } as Partial<Element>);
            }
          }}
          trailing={
            element.fill === undefined || element.fill.kind === 'solid'
              ? animPointIcon(
                  element,
                  'fill.color',
                  currentFrame,
                  selectedKeyframe,
                  () => fillColor,
                )
              : pointIcon('fill')
          }
        />
        <ColorField
          label="stroke"
          value={strokeColor}
          resetKey={id}
          onCommit={(color) => designerStore.commitAnimatable(id, 'stroke.color', color)}
          trailing={animPointIcon(
            element,
            'stroke.color',
            currentFrame,
            selectedKeyframe,
            () => strokeColor,
          )}
        />
        <NumberField
          label="stroke width"
          value={strokeWidth}
          step={1}
          min={0}
          onCommit={(width) => designerStore.commitAnimatable(id, 'stroke.width', width)}
          trailing={animPointIcon(element, 'stroke.width', currentFrame, selectedKeyframe, (el) =>
            el.type === 'shape' ? (el.stroke?.width ?? 0) : 0,
          )}
        />
        <NumberField
          label="dash array"
          value={strokeDashFirst}
          step={1}
          min={0}
          onCommit={(d) => designerStore.commitAnimatable(id, 'stroke.dash', d)}
          trailing={animPointIcon(element, 'stroke.dash', currentFrame, selectedKeyframe, (el) =>
            el.type === 'shape' ? (el.stroke?.dash?.[0] ?? 0) : 0,
          )}
        />
      </CollapseSection>

      <BorderRadiusSection
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />

      <DropShadowSection
        title="Drop Shadow"
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
          trailing={pointIcon('fit')}
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
          trailing={pointIcon('direction')}
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
          trailing={pointIcon('speed')}
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
          trailing={pointIcon('gap')}
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

      {/* Style parity with text: family/weight/size, colour, band background
          (default transparent). Plain commits — ticker styling isn't
          keyframe-animatable (the crawl is time-driven, not timeline-driven). */}
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
          value={element.color}
          resetKey={id}
          onCommit={(color) => designerStore.updateElement(id, { color } as Partial<Element>)}
        />
        <FillField
          label="background"
          value={
            element.backgroundFill ?? {
              kind: 'solid',
              color: element.backgroundColor ?? '#00000000',
            }
          }
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                backgroundFill: undefined,
                backgroundColor: f.color,
              } as Partial<Element>);
            } else {
              designerStore.updateElement(id, { backgroundFill: f } as Partial<Element>);
            }
          }}
        />
      </CollapseSection>

      <CollapseSection title="Drop Shadow">
        <TickerShadowRows element={element} />
      </CollapseSection>

      <CollapseSection title="Band Padding">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            label={side}
            value={element.padding?.[side] ?? 0}
            step={1}
            min={0}
            suffix="px"
            onCommit={(v) => {
              const p = element.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
              designerStore.updateElement(id, {
                padding: { ...p, [side]: Math.max(0, v) },
              } as Partial<Element>);
            }}
          />
        ))}
      </CollapseSection>

      <CollapseSection title="Border Radius">
        <NumberField
          label="radius"
          value={element.cornerRadius ?? 0}
          step={1}
          min={0}
          suffix="px"
          onCommit={(v) =>
            designerStore.updateElement(id, {
              cornerRadius: Math.max(0, v),
            } as Partial<Element>)
          }
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
 * mirrors the ticker's parity sections (plain commits — clock styling isn't
 * keyframe-animatable).
 */
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
          trailing={pointIcon('mode')}
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
          trailing={pointIcon('digits')}
        />
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
          Plain commits — clock styling isn't keyframe-animatable (the clock is
          time-driven, not timeline-driven). */}
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
        <SelectField
          label="align"
          value={element.align}
          options={['start', 'center', 'end'] as const}
          onCommit={(align) => designerStore.updateElement(id, { align } as Partial<Element>)}
        />
        <FillField
          label="text color"
          value={element.colorFill ?? { kind: 'solid', color: element.color }}
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                color: f.color,
                colorFill: undefined,
              } as Partial<Element>);
            } else {
              designerStore.updateElement(id, { colorFill: f } as Partial<Element>);
            }
          }}
        />
        <FillField
          label="background"
          value={
            element.backgroundFill ?? {
              kind: 'solid',
              color: element.backgroundColor ?? '#00000000',
            }
          }
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                backgroundFill: undefined,
                backgroundColor: f.color,
              } as Partial<Element>);
            } else {
              designerStore.updateElement(id, { backgroundFill: f } as Partial<Element>);
            }
          }}
        />
      </CollapseSection>

      <CollapseSection title="Drop Shadow">
        <TickerShadowRows element={element} />
      </CollapseSection>

      <CollapseSection title="Box Padding">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            label={side}
            value={element.padding?.[side] ?? 0}
            step={1}
            min={0}
            suffix="px"
            onCommit={(v) => {
              const p = element.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
              designerStore.updateElement(id, {
                padding: { ...p, [side]: Math.max(0, v) },
              } as Partial<Element>);
            }}
          />
        ))}
      </CollapseSection>

      <CollapseSection title="Border Radius">
        <NumberField
          label="radius"
          value={element.cornerRadius ?? 0}
          step={1}
          min={0}
          suffix="px"
          onCommit={(v) =>
            designerStore.updateElement(id, {
              cornerRadius: Math.max(0, v),
            } as Partial<Element>)
          }
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

      {/* Style parity with the ticker/clock text sections — plain commits
          (sequence styling isn't keyframe-animatable; time-driven). */}
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
        <SelectField
          label="align"
          value={element.align}
          options={['start', 'center', 'end'] as const}
          onCommit={(align) => designerStore.updateElement(id, { align } as Partial<Element>)}
        />
        <FillField
          label="text color"
          value={element.colorFill ?? { kind: 'solid', color: element.color }}
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                color: f.color,
                colorFill: undefined,
              } as Partial<Element>);
            } else {
              designerStore.updateElement(id, { colorFill: f } as Partial<Element>);
            }
          }}
        />
        <FillField
          label="background"
          value={
            element.backgroundFill ?? {
              kind: 'solid',
              color: element.backgroundColor ?? '#00000000',
            }
          }
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                backgroundFill: undefined,
                backgroundColor: f.color,
              } as Partial<Element>);
            } else {
              designerStore.updateElement(id, { backgroundFill: f } as Partial<Element>);
            }
          }}
        />
      </CollapseSection>

      <CollapseSection title="Drop Shadow">
        <TickerShadowRows element={element} />
      </CollapseSection>

      <CollapseSection title="Box Padding">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <NumberField
            key={side}
            label={side}
            value={element.padding?.[side] ?? 0}
            step={1}
            min={0}
            suffix="px"
            onCommit={(v) => {
              const p = element.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
              designerStore.updateElement(id, {
                padding: { ...p, [side]: Math.max(0, v) },
              } as Partial<Element>);
            }}
          />
        ))}
      </CollapseSection>

      <CollapseSection title="Border Radius">
        <NumberField
          label="radius"
          value={element.cornerRadius ?? 0}
          step={1}
          min={0}
          suffix="px"
          onCommit={(v) =>
            designerStore.updateElement(id, {
              cornerRadius: Math.max(0, v),
            } as Partial<Element>)
          }
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

/** Ticker/clock/sequence text-shadow rows — plain (non-animatable) commits. */
function TickerShadowRows({
  element,
}: {
  element: TickerElement | ClockElement | SequenceElement;
}): JSX.Element {
  const id = element.id;
  const s = element.textShadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
  const patch = (p: Partial<typeof s>): void => {
    designerStore.updateElement(id, { textShadow: { ...s, ...p } } as Partial<Element>);
  };
  return (
    <>
      <NumberField
        label="offset X"
        value={s.offsetX}
        step={1}
        onCommit={(v) => patch({ offsetX: v })}
      />
      <NumberField
        label="offset Y"
        value={s.offsetY}
        step={1}
        onCommit={(v) => patch({ offsetY: v })}
      />
      <NumberField
        label="blur"
        value={s.blur}
        step={1}
        min={0}
        onCommit={(v) => patch({ blur: v })}
      />
      <ColorField
        label="color"
        value={s.color}
        resetKey={id}
        onCommit={(color) => patch({ color })}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                       REUSABLE SECTIONS
// ────────────────────────────────────────────────────────────────────────

function DropShadowSection({
  title,
  element,
  currentFrame,
  selectedKeyframe,
}: {
  title: string;
  element: ShapeElement | TextElement;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}): JSX.Element {
  const id = element.id;
  const staticShadow: Shadow | undefined =
    element.type === 'shape' ? element.shadow : element.textShadow;
  const s: Shadow = staticShadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
  // Evaluated-at-playhead values so animated shadow fields track the canvas.
  const offsetX = evNum(element, 'shadow.offsetX', currentFrame, s.offsetX);
  const offsetY = evNum(element, 'shadow.offsetY', currentFrame, s.offsetY);
  const blur = evNum(element, 'shadow.blur', currentFrame, s.blur);
  const color = evColor(element, 'shadow.color', currentFrame, s.color);
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
            onCommit: (v) => designerStore.commitAnimatable(id, 'shadow.offsetX', v),
            point: animPointIcon(
              element,
              'shadow.offsetX',
              currentFrame,
              selectedKeyframe,
              () => s.offsetX,
            ),
          },
          {
            icon: 'Y',
            ariaLabel: 'offset Y',
            value: offsetY,
            step: 1,
            suffix: 'px',
            onCommit: (v) => designerStore.commitAnimatable(id, 'shadow.offsetY', v),
            point: animPointIcon(
              element,
              'shadow.offsetY',
              currentFrame,
              selectedKeyframe,
              () => s.offsetY,
            ),
          },
        ]}
      />
      <NumberField
        label="blur"
        value={blur}
        step={1}
        min={0}
        suffix="px"
        onCommit={(v) => designerStore.commitAnimatable(id, 'shadow.blur', v)}
        trailing={animPointIcon(
          element,
          'shadow.blur',
          currentFrame,
          selectedKeyframe,
          () => s.blur,
        )}
      />
      <ColorField
        label="color"
        value={color}
        resetKey={id}
        onCommit={(color) => designerStore.commitAnimatable(id, 'shadow.color', color)}
        trailing={animPointIcon(
          element,
          'shadow.color',
          currentFrame,
          selectedKeyframe,
          () => s.color,
        )}
      />
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
  return (
    <CollapseSection title="Text Padding">
      <NumberField
        label="top"
        value={evNum(element, 'padding.top', currentFrame, p.top)}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.top', v)}
        trailing={animPointIcon(
          element,
          'padding.top',
          currentFrame,
          selectedKeyframe,
          () => p.top,
        )}
      />
      <NumberField
        label="right"
        value={evNum(element, 'padding.right', currentFrame, p.right)}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.right', v)}
        trailing={animPointIcon(
          element,
          'padding.right',
          currentFrame,
          selectedKeyframe,
          () => p.right,
        )}
      />
      <NumberField
        label="bottom"
        value={evNum(element, 'padding.bottom', currentFrame, p.bottom)}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.bottom', v)}
        trailing={animPointIcon(
          element,
          'padding.bottom',
          currentFrame,
          selectedKeyframe,
          () => p.bottom,
        )}
      />
      <NumberField
        label="left"
        value={evNum(element, 'padding.left', currentFrame, p.left)}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.left', v)}
        trailing={animPointIcon(
          element,
          'padding.left',
          currentFrame,
          selectedKeyframe,
          () => p.left,
        )}
      />
    </CollapseSection>
  );
}

function BorderRadiusSection({
  element,
  currentFrame,
  selectedKeyframe,
}: {
  element: ShapeElement | TextElement;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}): JSX.Element {
  const id = element.id;
  const radius =
    element.type === 'shape'
      ? typeof element.cornerRadius === 'number'
        ? element.cornerRadius
        : Array.isArray(element.cornerRadius)
          ? element.cornerRadius[0]
          : 0
      : (element.cornerRadius ?? 0);
  return (
    <CollapseSection title="Border Radius">
      <NumberField
        label="radius"
        value={evNum(element, 'cornerRadius', currentFrame, radius)}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'cornerRadius', v)}
        trailing={animPointIcon(
          element,
          'cornerRadius',
          currentFrame,
          selectedKeyframe,
          () => radius,
        )}
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
        trailing={animPointIcon(
          element,
          property,
          currentFrame,
          selectedKeyframe,
          (el) => (el.filter?.[key] ?? fallback) as number,
        )}
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
