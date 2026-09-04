import { useCallback, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight, Crop, Maximize, Scan, Square } from 'lucide-react';
import { lottieClipMidpoint, lottieFollowWindow, lottieTiming } from '@cg/lottie-bridge';
import type { LottieTiming } from '@cg/lottie-bridge';
import {
  DEFAULT_LIVE_FIT_MODE,
  LIVE_FIT_MODES,
  followWindowMs,
  followsComposition,
} from '@cg/shared-schema';
import type { FollowAnchors, FollowWindow, LiveFitMode } from '@cg/shared-schema';
import type {
  AnimatableProperty,
  ClockElement,
  ClockTarget,
  Element,
  Filter,
  ImageElement,
  LottieElement,
  Padding,
  PathElement,
  RepeaterElement,
  SequenceElement,
  Shadow,
  ShapeElement,
  Stroke,
  TextElement,
  TickerElement,
  VideoElement,
  VideoPlaceholderElement,
} from '@cg/shared-schema';
import { LiveSourceIdSchema } from '@cg/shared-schema';
import {
  ASPECT_CUSTOM,
  ASPECT_PRESETS,
  ASPECT_UNSPECIFIED,
  effectiveAspect,
  fitToAspect,
  matchesAspect,
  optionLabelFor,
  presetKeyFor,
  presetValueFor,
} from './aspect-presets.js';
import { columnsForFields } from '../fields/repeater-columns.js';
import {
  SEQUENCE_PRESET_ORDER,
  SEQUENCE_TRANSITION_PRESETS,
  sequencePresetKeyFor,
} from './sequence-presets.js';
import { ListItemsEditor } from '../fields/ListItemsEditor.js';
import { SharedImagePicker } from '../sharedLibrary/SharedImagePicker.js';
import { TickerSeparatorControl } from './TickerSeparatorControl.js';
import * as dds from './DynamicDataSection.css.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { isAspectLocked } from '../../state/slices/view.js';
import { activeDocOf, activeFieldData, activeLayersOf } from '../../state/scene-doc.js';
import { lottieFollowAttachPhases, videoFollowAttachPhases } from '../../state/follow-attach.js';
import { deriveLookSources, videoFollowClipFacts } from '@cg/shared-schema';
import { contentStartDefaultFrom } from './content-start-default.js';
import * as lottieAssetCache from '../assets/lottieAssetCache.js';
import { useAssetUrl, useAssets } from '../assets/useAssets.js';
import { VideoPoster } from '../assets/VideoPoster.js';
import { posterTimeMs } from '../assets/video-convert-args.js';
import * as lt from './LottieTiming.css.js';
import {
  effectiveColorAt as evColor,
  effectiveNumberAt as evNum,
} from '../timeline/keyframe-helpers.js';
import { KeyframeDot } from './keyframe-diamond.js';
import { applyFillModeChange } from './fill-commit.js';
import { CollapseSection } from './CollapseSection.js';
import { InfoTip, StateLine } from './InfoTip.js';
import { withheldReason } from './field-registry.js';
import * as prose from './prose.css.js';
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
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as radiusCss from './BorderRadiusSection.css.js';
import * as fieldCss from './controls.css.js';

interface Props {
  element: Element;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

/**
 * `DESIGNER-FIX-0905` — the three content-driven kinds each carried a "Time-driven: … scrubbing
 * the timeline doesn't move it" caption. One TEACHING, said once, behind one shared `i`; the
 * inline line reduces to the state.
 */
function TimeDrivenTip({ kind }: { kind: 'ticker' | 'clock' | 'sequence' }): JSX.Element {
  const what =
    kind === 'ticker'
      ? 'the crawl runs during playback, and its pass length comes from the measured content width divided by the speed'
      : kind === 'clock'
        ? 'the clock repaints once per second during playback'
        : 'items advance on their dwell, or on Next, during playback';
  return (
    <InfoTip title="Time-driven content">
      <p>
        This element runs on its own clock, not on the composition’s frames: {what}. Scrubbing the
        timeline does not move it, and it keeps running across every repeat of a hold loop.
      </p>
      <p>
        Only its box <em>style</em> — colour, background, shadow, padding — animates on the
        timeline. Press play, or open the Preview, to see it run.
      </p>
    </InfoTip>
  );
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
  if (element.type === 'path')
    return (
      <PathSections
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
  if (element.type === 'lottie')
    return (
      <LottieSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  if (element.type === 'video')
    return (
      <VideoSections
        element={element}
        currentFrame={currentFrame}
        selectedKeyframe={selectedKeyframe}
      />
    );
  // D-137 — NO `FilterSection` for a Live Source, so it takes no frame/keyframe
  // props: filters paint pixels and a Live Source paints none on air (in `'author'`
  // mode one would tint only the SMPTE bars, showing an effect that reaches nothing).
  if (element.type === 'video-placeholder') return <LiveSourceSections element={element} />;
  // composition / container have no kind-specific style section, but the universal
  // CSS Filter is animatable on every kind — render it so the right inspector's
  // keyframe-able set matches the timeline-left (D-051 parity). Transform comes from
  // InspectorPanel's TransformSection.
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
//                              PATH (D-109)
// ────────────────────────────────────────────────────────────────────────

/**
 * D-109 — the `path` inspector: fill + stroke (Path Style), a closed/open toggle,
 * and a read-only anchor count. No border-radius / box-shadow (a path is not a box).
 * Fill + stroke route through `commitAnimatable` exactly like a shape's (D-051
 * registry now marks them keyframe-able for `path`), so they animate identically.
 */
function PathSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<PathElement>): JSX.Element {
  const id = element.id;
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
      {/* D-110 — the whole-shape morph track: ONE row (never per-anchor) whose
          diamond keyframes the full anchor snapshot; the shape itself is edited
          on the canvas overlay. Mirrors the timeline's "Path" section (D-051
          registry parity). */}
      <CollapseSection title="Path" pinned>
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>shape</span>
          <span>{`${String(element.points.length)} pts`}</span>
          {KeyframeDot(element, 'path', currentFrame, selectedKeyframe)}
        </div>
      </CollapseSection>

      <CollapseSection title="Path Style" pinned>
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>path</span>
          <TogglePair
            value={element.closed ? 'closed' : 'open'}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ]}
            onChange={(v) =>
              designerStore.updateElement(id, { closed: v === 'closed' } as Partial<Element>)
            }
          />
        </div>
        <FillField
          label="fill"
          value={displayFill}
          onChange={(f) => {
            if (
              f.kind === 'solid' &&
              (element.fill === undefined || element.fill.kind === 'solid')
            ) {
              designerStore.commitAnimatable(id, 'fill.color', f.color);
            } else {
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
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>points</span>
          <span>{element.points.length}</span>
        </div>
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
        {/*
          D-149 — `fit width` / `fit height` scale one axis to the box and clip the
          overflow on the other.

          ⚠ `none` is LABELLED "original" and its STORED VALUE IS UNCHANGED. This is
          a label, not a schema change: every scene ever saved carries `'none'`, and
          renaming the stored value would be a migration bought for a word. The
          `labels` prop exists for exactly this — the option's `value` stays `none`.
        */}
        <SelectField
          label="fit"
          value={element.fit}
          options={['contain', 'cover', 'fill', 'none', 'fit-width', 'fit-height'] as const}
          labels={['contain', 'cover', 'fill', 'original', 'fit width', 'fit height']}
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
//                           LIVE SOURCE (D-137)
// ────────────────────────────────────────────────────────────────────────

/**
 * D-137 — the Live Source's own Inspector section: the source id, the optional key
 * source id, and `expectedAspect`.
 *
 * The id is validated HERE as well as at the schema boundary, and rejects rather
 * than corrects. `LiveSourceIdSchema` is the SAME schema the scene parses through —
 * imported, never re-spelt as a local regex — because two spellings of one format is
 * how the Inspector comes to accept what the file refuses (the `B-100` / `P-012`
 * shape). A refused value is reverted with a notice naming what a symbolic id is,
 * rather than silently sanitised: an author who typed `DECKLINK DEVICE 3` meant
 * something by it and needs to be told why a template may not name a device.
 *
 * `expectedAspect` is the author's DECLARATION about the source, not a fit input and
 * not a constraint on the box (design.md §3). The label says so, because the natural
 * reading — "this locks my hole to 16:9" — is wrong, and the field acquires its real
 * consumer only in phase 6, where the bridge refuses a take whose mapped source
 * disagrees with it.
 */
/**
 * `B-183` — the UI-only sentinel for "this plate has no source".
 *
 * The scene stores absence as `routeKey: undefined`; the control needs a string. `''` is safe
 * as that string because {@link LiveSourceIdSchema} is `.min(1)` — no real id can ever equal
 * it — and it is converted back at the single commit point, so it never reaches the store.
 * Kept beside the control that uses it rather than exported: a second reader would be a second
 * place the sentinel's meaning lives.
 *
 * ⚠ `B-188` retired its companion `UNASSIGNED_LABEL` (“— no source —”). That text existed to
 * NAME the empty option of a `<select>`; the control is a text box now, where the unassigned
 * state is simply an empty field and a label inside it would be a value the author had to
 * delete before typing.
 */
const UNASSIGNED = '';

function LiveSourceSections({ element }: { element: VideoPlaceholderElement }): JSX.Element {
  const id = element.id;
  // The scene ref is stable between edits, so deriving the group in the render body
  // avoids the fresh-object useSyncExternalStore trap (the C2 lesson).
  const sceneForPicker = useDesignerSelector((st) => st.scene);
  // Bumped on a REFUSED id, and folded into each input's key: an uncontrolled input
  // that committed a bad value keeps the bad text on screen otherwise (the committed
  // value did not change, so nothing re-mounts it), leaving the author looking at a
  // value the scene does not hold. Reverting is the honest feedback; the notice says
  // why.
  const [rejectSeq, setRejectSeq] = useState(0);
  const commitId = (raw: string): void => {
    const value = raw.trim();
    /*
      `B-183` — CLEARING THE FIELD UNASSIGNS, it does not fail validation.

      Without this the author has a control that can reach every state except the one a plate
      now starts in, and emptying the box would be met with "“” is not a Live Source id" —
      a refusal aimed at a typo, for a deliberate act.
    */
    if (value === UNASSIGNED) {
      designerStore.updateElement(id, { routeKey: undefined } as Partial<Element>);
      return;
    }
    if (!LiveSourceIdSchema.safeParse(value).success) {
      designerStore.showNotice(
        `“${value}” is not a Live Source id. Use letters, digits, “_” and “-”, starting ` +
          'with a letter or digit — a template names sources SYMBOLICALLY (e.g. “guest-1”). ' +
          'Which device or channel that id resolves to is set per installation, in CG Control.',
      );
      setRejectSeq((n) => n + 1);
      return;
    }
    designerStore.updateElement(id, { routeKey: value } as Partial<Element>);
  };
  /*
    🔴 `B-188` — **ONE CONTROL NOW, AND IT IS THE FREE-TEXT ONE.**

    There were two: a `<select>` over the group's DECLARED sources when the project had a
    multi-frame group, and a free-text box when it did not. The group declares nothing any more
    — the source list is derived from the plates — so a picker would be a control that can only
    ever offer what other plates already chose, and there would be no way to create the first
    source, or the next one, at all. **Typing a new key IS how a source comes into existence.**

    The existing keys are still OFFERED, through the field's datalist: the common act is
    pointing this plate at a source the template already uses, and that must stay one click.
    They are a suggestion, never a constraint — which is the whole difference from the picker
    this replaces, and the reason `look-source-undeclared` no longer exists to punish the gap.
  */
  const suggestions =
    sceneForPicker === null
      ? []
      : deriveLookSources(sceneForPicker).filter((k) => k !== element.routeKey);
  /*
    ⭐ `B-183` — THE UNASSIGNED STATE IS REPRESENTABLE IN THE CONTROL, because it is now
    representable in the scene.

    The empty string is the sentinel and it CANNOT collide: `LiveSourceIdSchema` is
    `.min(1)`, so no real source id is ever `''`. It never reaches the scene — the commit
    below turns it back into `undefined`, which is what the schema stores.

    🔴 **The select shows what the element HOLDS, in all three states**, and substitutes
    nothing: a declared id plain, a dangling id as itself labeled `(undeclared)` (which
    predates this change and was verified still true before it), and no source at all as
    its own option. Falling back to the first declared entry would silently bind the plate
    to an input the author never chose — the owner's rejected alternative, and the reason
    that option is named in the schema's docstring rather than left to be rediscovered.
  */
  const holds = element.routeKey ?? UNASSIGNED;
  return (
    <>
      <CollapseSection title="Live Source" defaultExpanded>
        <TextField
          label="source id"
          ariaLabel="Live Source source id"
          value={holds}
          resetKey={`${id}-${String(rejectSeq)}`}
          onCommit={commitId}
          suggestions={suggestions}
          datalistId={`live-source-ids-${id}`}
        />
        <AspectRow element={element} />
        <FitModeRow element={element} />
        {/*
          ⭐ `DESIGNER-FIX-0905` — the paragraph that stood here is gone, and its sentences
          went three ways. Its CONSTRAINTS ("rotating would slide the picture out", "opacity
          and filters are withheld") now sit ON the controls they explain: the Transform
          section renders rotation and opacity disabled with the registry's reason as their
          tooltip, and the Filter section below is a withheld header with the same. Its
          MECHANISM — why a plate is static, what it paints, where the frame sits — is
          behind the `i`, at reading size, corrected for the reorder: no hole is punched any
          more (`single-clock-look-switch`), the page sits BELOW the pictures. What stays
          inline is the one-line STATE: a plate is static, and its withheld controls say why.
        */}
        <StateLine testId="live-source-state" tip={<LivePlateTip />}>
          A plate is <strong>static and axis-aligned</strong> — rotation, opacity, filters and
          keyframes are withheld, and each says why on itself.
        </StateLine>
      </CollapseSection>
      <LiveSourceFrameRow element={element} />
      {/*
        The Filter section, WITHHELD rather than absent (`DESIGNER-FIX-0905`): the header
        stays, dimmed, carrying the registry's reason. It used to be simply missing, and a
        section that vanishes teaches nothing about why it is unavailable.
      */}
      <CollapseSection title="Filter" withheld={withheldReason(element, 'filter')} />
    </>
  );
}

/**
 * `DESIGNER-FIX-0905` §1 — **what a live plate does on air, said once, and said against the
 * code as it is NOW.** Six Designer strings still described the retired mask (`D-158`'s
 * table); the two the owner photographed were the ones this panel carried. The mechanism
 * under the reorder (`single-clock-look-switch`, `a7976e14`): the page that carries the
 * plates is composited BELOW them, CasparCG draws each picture into exactly the plate's
 * declared rect, and the plate paints nothing — there is no hole, because nothing on the
 * page is ever in front of a picture. The knowledge is load-bearing (it is why rotation,
 * opacity and filters are withheld, and it sits beside `B-197`'s open question about a
 * rounded frame), so it is relocated and corrected here, not deleted.
 */
function LivePlateTip(): JSX.Element {
  return (
    <InfoTip title="Live plates on air">
      <p>
        A plate is <strong>static and axis-aligned</strong>. Its rect is sent to CasparCG once, as a
        fixed box, and the live picture is composited into exactly that box. Rotating or animating
        the plate — or a parent — would move the frame and title you drew while the picture stayed
        put, so rotation and every keyframe are withheld.
      </p>
      <p>
        On air the plate <strong>paints nothing</strong>. The page that carries the plates is
        composited <strong>below</strong> the live pictures, so nothing you draw in this template
        can appear over a picture, and nothing on the page can fade or filter one. That is why
        opacity and the Filter section are withheld: they would act on pixels the plate does not
        have. On the canvas the bars and the source label stand in for the picture.
      </p>
      <p>
        The <strong>frame</strong> is the one thing a plate draws. It is painted on the page, just
        outside the plate’s rect, so the picture never covers it and it never covers the picture —
        and it does not change the rect CasparCG is given. Rounded corners have no home on a plate
        yet.
      </p>
      <p>
        Under <strong>Fit whole picture</strong> a source of a different shape shows the page’s own
        background in the margin, never black. Artwork that must appear <em>over</em> a picture is
        its own template, on its own bank row above the live band.
      </p>
    </InfoTip>
  );
}

/**
 * ⭐ §9a.1 — the plate's FRAME: colour + width, over the shared `stroke`.
 *
 * **The write path is `updateElement`, deliberately, and NOT `commitAnimatable`.**
 * Checked rather than assumed, because "extend the list, forget the mutator" is how
 * this repo has shipped an inert control before (B-051 — the D-109 path was left out
 * of `writeStaticAnimatable`'s box-kind guard, so every Path Style stroke edit
 * silently no-oped): `writeStaticAnimatable`'s `stroke.*` arms are gated on
 * `boxKind = shape | text | path`, so routing this through them would write nothing
 * at all unless that guard were widened. It is NOT widened, because the property is
 * not keyframe-able here (below) and a static write through a keyframe router buys
 * only the guard it would have to be exempted from.
 *
 * **Not keyframe-able, and not in `FIELD_REGISTRY`.** `LIVE_SOURCE_STATIC` (1.8b)
 * removed every diamond from this kind under ONE rule; a stroke track would put two
 * rows back on the timeline-left for a property whose interaction with the
 * not-yet-chosen punch mechanism (1.5b/1.5c) is undecided. Withholding it now is a
 * subtraction that can be widened later without touching a stored scene; shipping it
 * and retracting it is not. `routeKey` / `expectedAspect` / a clock's `align` take
 * the same non-keyframed `updateElement` route.
 *
 * **`width: 0` keeps the stroke OBJECT and remembers the colour.** Zero is the "no
 * frame" state, not the "unset" state — it renders identically to an absent stroke,
 * and the colour survives a round trip through 0 so an author who dials the frame off
 * and back on does not lose it. Nothing here may read the zero as falsy-absent and
 * substitute a default (the trap this repo has met twice).
 *
 * ⚠ `updateElement` is SHALLOW (`locate` walks only a layer's direct children), so a
 * plate nested inside a container takes no edit from this row — nor from the source-id
 * or aspect rows above it, which share the route. That is a pre-existing gap
 * (`design.md` §9A.2), not one this control introduces, and it is recorded rather
 * than worked around here: a second, deeper write path used by one row would be the
 * two-spellings shape that gap already is.
 */
function LiveSourceFrameRow({ element }: { element: VideoPlaceholderElement }): JSX.Element {
  const id = element.id;
  // The DISPLAYED colour is also the one a first width edit writes, so the swatch
  // never disagrees with what the plate gets. White rather than the `#000000` used
  // elsewhere: a frame is drawn around a guest box on a designed backdrop, and a
  // black frame that lands invisibly reads as a control that did nothing.
  const color = element.stroke?.color ?? '#ffffff';
  const width = element.stroke?.width ?? 0;
  const commit = (next: Stroke): void => {
    designerStore.updateElement(id, { stroke: next } as Partial<Element>);
  };
  /*
    ⭐ `DESIGNER-FIX-0905` — "a width of 0 means no frame; the colour is kept" was a sentence
    under the fields. It is now the COLOUR FIELD'S OWN STATE: at width 0 the swatch and hex
    stay visible (the colour IS kept — that is the point of showing it) but disabled, with
    the reason as their tooltip. The mechanism the rest of that sentence carried ("painted
    by the template, outside the hole") went to the Live Source `i`, corrected: there is no
    hole; the frame is painted on the page just outside the rect, below the picture.
  */
  const off = width <= 0;
  return (
    <CollapseSection title="Frame" defaultExpanded>
      <ColorField
        label="stroke"
        value={color}
        withheld={
          off ? 'No frame at width 0. The colour is kept — set a width to paint it.' : undefined
        }
        onCommit={(next) => {
          commit({ ...(element.stroke ?? { width }), color: next });
        }}
      />
      <NumberField
        label="stroke width"
        value={width}
        step={1}
        min={0}
        suffix="px"
        onCommit={(next) => {
          commit({ ...(element.stroke ?? { color }), width: Math.max(0, next) });
        }}
      />
    </CollapseSection>
  );
}

/**
 * ⭐ `C-028` — **the FIT MODE: how the picture is placed in this plate's box.**
 *
 * ── WHAT THE AUTHOR IS ACTUALLY CHOOSING ────────────────────────────────────
 *
 * The client's decision (2026-08-23, via the owner): **the picture must not be cut.** A
 * live input keeps its own aspect, is centred on both axes, and the leftover margin shows
 * **the template's own background** — never black, because the mask hole is punched at
 * the FITTED rect rather than at the box. `cover` keeps the old centre-crop for the shots
 * where losing the edges is the accepted cost.
 *
 * 🔴 **The label says what happens to the PICTURE, not to the BOX**, because the natural
 * misreading is that the box changes shape. It does not: the box is exactly where the
 * author drew it, and only the picture inside it moves. The owner accepted the visible
 * consequence in advance — a stroke or frame authored tight around a box **no longer hugs
 * the picture** when the source aspect differs.
 *
 * ── WHY THIS IS PER ELEMENT AND NOT PER SOURCE ──────────────────────────────
 *
 * The same catalog source seated in a 16:9 box and a 3:4 box needs DIFFERENT fits, so a
 * per-source field would have to be wrong in one of them. The mode is a property of the
 * PAIRING of a picture with a box, and this is where that pairing is authored.
 *
 * ⚠ **The operator can override it per assignment, and that is not a bug in this
 * control.** The author states what the design wants; the operator, who is looking at the
 * picture on the day, may revise it. Note the direction is the OPPOSITE of `D-147`'s
 * aspect chain, where the installation outranks the author — that one resolves a
 * measurable property of the feed, this one a presentation choice about it.
 */
function FitModeRow({ element }: { element: VideoPlaceholderElement }): JSX.Element {
  const id = element.id;
  // Absent means `contain` — the shipped default. Read through the shared constant rather
  // than a literal, so the control and the runtime cannot come to disagree about what an
  // unset field means.
  const mode: LiveFitMode = element.fitMode ?? DEFAULT_LIVE_FIT_MODE;
  const options: readonly LiveFitMode[] = LIVE_FIT_MODES;
  return (
    <SelectField
      label="fit"
      value={mode}
      options={options}
      labels={options.map((m) => (m === 'contain' ? 'Fit whole picture' : 'Fill box (crop edges)'))}
      onCommit={(value) => {
        designerStore.updateElement(id, { fitMode: value } as Partial<Element>);
      }}
      trailing={
        <span
          className={dds.hint}
          title={
            mode === 'contain'
              ? 'The WHOLE picture is shown, centred, at the source’s own aspect. Where the ' +
                'source is a different shape from this box, the margin shows the template’s ' +
                'own background — not black. Nothing is cropped, so a frame drawn tight ' +
                'around this box will not hug the picture.'
              : 'The picture is scaled until it FILLS the box and the overflow is cropped ' +
                'evenly from both edges. The box is filled corner to corner, at the cost of ' +
                'the edges of the source frame.'
          }
        >
          <Icon icon={mode === 'contain' ? Scan : Crop} />
        </span>
      }
    />
  );
}

/**
 * D-147 — the aspect PICKER and the fit action.
 *
 * The stored value stays a plain number; this is an affordance over it. Three
 * states, and the third is the point of the item: a preset, `Custom…` (which
 * reveals the numeric input that existed before), and `— not specified —`, which
 * writes the field ABSENT.
 *
 * `— not specified —` is not "empty" — it is the author declining to assert. Under
 * `live-source-multibox` design.md §3 the bridge compares `expectedAspect` against
 * the installation's mapping and REFUSES THE TAKE when they disagree, so a required
 * field forces an author who has never seen the feed into a guess that can refuse a
 * take on air. Absent means no comparison and no refusal.
 */
function AspectRow({ element }: { element: VideoPlaceholderElement }): JSX.Element {
  const id = element.id;
  const stored = element.expectedAspect;
  const derivedKey = presetKeyFor(stored);
  /*
    `Custom…` is STICKY while the section is open. Picking it must reveal the numeric
    input even before a number is typed, and a value typed there that happens to land
    on a preset must not yank the input away mid-edit. Derived-from-value alone
    cannot express either, so the explicit pick wins until the selection changes.
  */
  const [pick, setPick] = useState<string | null>(null);
  const selected = pick ?? derivedKey;
  // A different element in the same slot must not inherit the previous one's pick.
  const [pickOwner, setPickOwner] = useState(id);
  if (pickOwner !== id) {
    setPickOwner(id);
    setPick(null);
  }

  // The ACTIVE DOC's frame, not the project root's: a Live Source inside a
  // composition is fitted against that composition's own resolution, which is the
  // frame its off-frame preflight is measured against too.
  const frameW = useDesignerSelector((s) =>
    s.scene === null ? 0 : activeDocOf(s.scene).resolution.width,
  );
  const frameH = useDesignerSelector((s) =>
    s.scene === null ? 0 : activeDocOf(s.scene).resolution.height,
  );
  /**
   * `D-155` / `B-218` — THIS PLATE's lock, read from the session store rather than from the
   * element. Session state, never the scene: a `.vcg` that resizes differently for two people
   * is the failure that decision avoids, and the runtime could never read it anyway. But it is
   * keyed by the plate — `B-218` was ONE flag for every plate in every look, so setting one
   * box FREE freed all of them. See `aspectLockOff` in `store-core.ts`.
   */
  const locked = useDesignerSelector((s) => isAspectLocked(s, id));

  const options = [...ASPECT_PRESETS.map((p) => p.key), ASPECT_CUSTOM, ASPECT_UNSPECIFIED] as const;

  function onPick(key: string): void {
    setPick(key);
    if (key === ASPECT_UNSPECIFIED) {
      // ABSENT, not zero and not a sentinel number: the schema field is optional
      // and `undefined` is the only spelling of "no assertion".
      designerStore.updateElement(id, { expectedAspect: undefined } as Partial<Element>);
      return;
    }
    if (key === ASPECT_CUSTOM) {
      // Reveal the input without changing the value. A custom pick over an absent
      // value seeds the current RENDERED aspect — the most likely thing the author
      // means by "custom", and better than making them read it off W and H.
      if (stored === undefined) {
        const eff = effectiveAspect(element.transform);
        if (Number.isFinite(eff) && eff > 0) {
          designerStore.updateElement(id, { expectedAspect: eff } as Partial<Element>);
        }
      }
      return;
    }
    const value = presetValueFor(key);
    if (value !== undefined) {
      designerStore.updateElement(id, { expectedAspect: value } as Partial<Element>);
    }
  }

  const fit =
    stored === undefined || frameH <= 0
      ? null
      : fitToAspect(element.transform, stored, { width: frameW, height: frameH });
  const already = stored !== undefined && matchesAspect(element.transform, stored);
  const fitDisabled = stored === undefined || already || fit === null;
  /*
    🔴 `D-155` task 3.4 — FIT IS A REPAIR NOW, AND THE WORDING SAYS SO.

    With the lock on, a plate cannot be deformed by dragging, so this button is no longer the
    normal path — it is for a plate authored BEFORE the lock, or one deformed with the lock
    OFF. Leaving it worded as the ordinary way to reach an aspect would keep teaching a
    workflow the feature exists to remove.

    ⚠ And the already-matches state READS AS SATISFIED rather than as an action that happens
    to be unavailable. "The plate already renders at this aspect" is a report, not a refusal;
    with the lock on it is the state a plate is normally IN, so a sentence that sounded like a
    disabled control would make the ordinary case look broken.
  */
  const fitTitle =
    stored === undefined
      ? 'Pick an aspect first — “not specified” asserts nothing to fit to.'
      : already
        ? // ⚠ Both spellings keep the word "already" — `D-155`'s own spec says the satisfied
          // state reads "this plate already matches", and `D-147`'s test has asserted that
          // word since the button existed. Re-wording FIT as a repair is a change to the
          // ACTION's description, not a licence to drop the vocabulary the state is named in.
          locked
          ? '✓ This plate already matches its aspect, and the lock keeps it there while you resize.'
          : '✓ This plate already renders at this aspect. Nothing to repair.'
        : fit === null
          ? 'This plate’s scale cannot be fitted (a zero or negative scale).'
          : fit.preserved === 'width'
            ? 'REPAIR a plate that does not match its aspect — keeps X, Y and W, solves for H. ' +
              'With the lock on, dragging cannot deform it, so this is only needed for a plate ' +
              'authored before the lock or resized with it off.'
            : 'REPAIR a plate that does not match its aspect — keeps X, Y and H, solves for W ' +
              '(solving for H would push the plate past the bottom of the frame).';

  function onFit(): void {
    if (fit === null) return;
    // ONE `updateElement` ⇒ ONE undo entry for the whole action. Writing `size` and
    // re-reading in two steps would leave the author undoing a resize twice.
    designerStore.updateElement(id, {
      transform: { ...element.transform, size: fit.size },
    } as Partial<Element>);
  }

  return (
    <>
      <SelectField
        label="aspect"
        value={selected}
        options={options}
        labels={options.map((k) => optionLabelFor(k, stored))}
        onCommit={onPick}
      />
      {selected === ASPECT_CUSTOM && (
        <NumberField
          label="custom aspect"
          value={stored ?? 0}
          step={0.01}
          min={0.01}
          onCommit={(expectedAspect) =>
            designerStore.updateElement(id, { expectedAspect } as Partial<Element>)
          }
        />
      )}
      {/*
        🔴 `D-155` task 3.1/3.3 — THE LOCK, beside the aspect it locks to.

        ON by default whenever an aspect is set: the complaint that produced this item is that
        the deformation happens BY ACCIDENT, and a lock the author has to find first does not
        answer that.

        ⚠ **NO KEYBOARD OVERRIDE, and the tooltip says why rather than leaving it a mystery.**
        Both plausible modifiers are already spent on ONE job — bypass snapping — and spelled
        differently per gesture: `Shift` in resize/rotate (`Gizmo.tsx`), `Alt` in the move
        gestures (`CanvasOverlay.tsx`, `D-122`'s free placement). Overloading either would put
        two meanings on one key in one canvas, and inventing a third chord for a feature that
        has a visible toggle is worse than having no keyboard path. (That `Shift` and `Alt`
        mean the same thing in different gestures is real, and is `D-156` — not this item's.)
      */}
      {stored !== undefined && (
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>keep aspect</span>
          <Button
            variant="secondary"
            // `selected`, not `active` — this app's Button primitive spells the engaged state
            // that way (the Runtime's spells it `active`; they are different design systems).
            selected={locked}
            aria-pressed={locked}
            data-aspect-lock={locked ? 'on' : 'off'}
            onClick={() => designerStore.setAspectLock(id, !locked)}
            title={
              locked
                ? 'ON — dragging a handle keeps this plate at its aspect. Turn it off to resize ' +
                  'freely. There is no keyboard override: Shift and Alt already bypass snapping.'
                : 'OFF — dragging a handle can deform this plate. Turn it on to keep its aspect ' +
                  'while you resize.'
            }
            aria-label="Keep aspect while resizing"
          >
            {locked ? 'LOCKED' : 'FREE'}
          </Button>
        </div>
      )}
      <div className={fieldCss.row}>
        <span className={fieldCss.label} />
        <Button
          variant="secondary"
          onClick={onFit}
          disabled={fitDisabled}
          title={fitTitle}
          aria-label="Fit plate to aspect"
        >
          {already ? '✓ Matches its aspect' : 'Repair to aspect'}
        </Button>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              LOTTIE (D-125)
// ────────────────────────────────────────────────────────────────────────

/**
 * D-125 Phase 3a — subscribe to the parsed-animation cache so the timing readout below
 * appears (and live-updates) as soon as an asset resolves. `getSnapshot` returns the
 * cached object identity, which only changes when that asset is (re)parsed.
 */
function useLottieAnimation(assetId: string): unknown {
  const subscribe = useCallback((cb: () => void) => lottieAssetCache.subscribe(cb), []);
  const snapshot = useCallback(() => lottieAssetCache.get(assetId), [assetId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** `0.67s` / `1.33s` / `2s` — a compact seconds readout (no trailing zeros). */
const secs = (s: number): string => `${s.toFixed(2).replace(/\.?0+$/, '')}s`;

/**
 * D-125 Phase 3b-1 — the ANIMATION-space details, collapsed by default and muted even
 * when open. These are the numbers that MISLED in Phase 3a: they live in the clip's own
 * frame space at the clip's own `fr`, which is NOT this composition's timeline, so they
 * are labelled as such and demoted below every comp-space answer.
 */
function AnimationDetails({ timing }: { timing: LottieTiming }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="bare"
        className={lt.disclosure}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={lt.disclosureChevron}>
          {open ? (
            <Icon icon={ChevronDown} size={14} />
          ) : (
            <Icon icon={ChevronRight} size={14} flipRtl />
          )}
        </span>
        animation details
      </Button>
      {open ? (
        <div className={lt.advanced} data-testid="lottie-animation-details">
          <p className={lt.muted}>
            clip {timing.meta.op} frames @ {timing.meta.fr} fps · {secs(timing.clip.seconds)}
          </p>
          {timing.hasPhases ? (
            <p className={lt.muted}>
              intro-end {timing.intro.to}, outro-start {timing.outro.from} — animation frames, not
              this comp&rsquo;s timeline.
            </p>
          ) : (
            <p className={lt.muted}>no phase markers in this clip.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

/**
 * D-125 Phase 3b-1 — the COMP-SPACE answers. Everything at this level is expressed in
 * THIS composition's frames; not one animation-frame number appears here.
 */
function LottieTimingPanel({
  timing,
  holdBehavior,
  outPoint,
}: {
  timing: LottieTiming;
  holdBehavior: LottieElement['holdBehavior'];
  outPoint: number | null;
}): JSX.Element {
  const settle = timing.settleOffset;
  const overruns = settle !== null && outPoint !== null && settle > outPoint;
  // The runtime only loops when the idle span is non-empty (`idleOut > idleIn`); a
  // zero-length hold falls back to freeze, so the copy must too.
  const loops = holdBehavior === 'idle-loop' && timing.hold.frames > 0;
  const clearFrames = timing.outro.compFrames;
  return (
    <div className={lt.panel} data-testid="lottie-timing">
      {settle === null ? (
        // Marker-less: nothing is derived, so there is no decision number to show.
        <p className={lt.muted}>
          no phase markers — the whole clip plays as the intro ({secs(timing.clip.seconds)}) and it
          does not set the content start.
        </p>
      ) : (
        <>
          <div className={lt.settleLine}>
            intro settles at frame <span className={lt.settleFrame}>{settle}</span>
            <br />
            <span className={lt.muted}>put the out-point at {settle} or later</span>
          </div>
          <p className={lt.muted}>
            {loops
              ? `on hold: loops every ${String(timing.hold.compFrames)} comp frames (${secs(timing.hold.seconds)})`
              : // FREEZE — the hold segment never plays, so quoting its duration (as Phase 3a
                // did) is actively misleading. State the behaviour, no number.
                'on hold: freezes · holds until OUT'}
          </p>
          <div className={lt.secondary}>
            after OUT: <span className={lt.secondaryNum}>{clearFrames}</span> comp frames (
            {secs(timing.outro.seconds)}) to clear
            {outPoint !== null ? (
              <span className={lt.muted}>
                {' '}
                (out-point {outPoint} → stage clears at frame {outPoint + clearFrames})
              </span>
            ) : null}
          </div>
          {overruns ? (
            <p className={lt.warn} data-testid="lottie-settle-warning">
              this Lottie&rsquo;s intro needs {settle} frames; the out-point is at {outPoint} —
              extend the out-point or the intro will be cut.
            </p>
          ) : null}
        </>
      )}
      <AnimationDetails timing={timing} />
    </div>
  );
}

/**
 * media-phases-follow-composition — the comp-side anchors the follow panels derive from.
 * Selected as PRIMITIVES (a selector snapshot is compared by identity, so an object
 * assembled inside the selector would re-render forever); the object is built in render.
 * `null` when the active document has no lifecycle — nothing to follow — or no scene.
 *
 * The effective content start is the marker when placed, else the SAME keyframes-only
 * default the Playout section's pin uses (`contentStartDefaultFrom` — extracted, not
 * copied). The runtime's richer heuristic additionally folds in other Lotties' settles;
 * see the extraction's own note for why that pre-existing display gap is not widened here.
 */
function useFollowAnchors(): FollowAnchors | null {
  const fps = useDesignerSelector((s) => s.scene?.frameRate ?? 0);
  const activeIn = useDesignerSelector((s) => {
    const scene = s.scene;
    if (scene === null) return 0;
    const doc = activeDocOf(scene);
    return doc.activeRange?.in ?? doc.frameRange.in;
  });
  const activeOut = useDesignerSelector((s) => {
    const scene = s.scene;
    if (scene === null) return 0;
    const doc = activeDocOf(scene);
    return doc.activeRange?.out ?? doc.frameRange.out;
  });
  const outPoint = useDesignerSelector((s) => {
    const scene = s.scene;
    if (scene === null) return null;
    return activeDocOf(scene).lifecycle?.outPoint ?? null;
  });
  const contentStart = useDesignerSelector((s) => {
    const scene = s.scene;
    if (scene === null) return null;
    const doc = activeDocOf(scene);
    if (doc.lifecycle === undefined) return null;
    const rIn = doc.activeRange?.in ?? doc.frameRange.in;
    return (
      doc.lifecycle.contentStart ??
      contentStartDefaultFrom(activeLayersOf(scene), rIn, doc.lifecycle.outPoint)
    );
  });
  if (outPoint === null || contentStart === null || fps <= 0) return null;
  return { activeIn, contentStart, outPoint, activeOut, fps };
}

/**
 * The §9.1 rule, settled twice now: an inert control that does not explain itself is a
 * defect. A follow-source element in a composition with NO lifecycle derives nothing —
 * this says WHY, instead of silently doing nothing (the option is never silently
 * disabled). Shared by both media kinds.
 *
 * `DESIGNER-FIX-0905` — the paragraph held three kinds of sentence. The STATE ("following
 * nothing — no out point") and its REMEDY ("set one in Playout") stay inline; the MECHANISM
 * ("no lifecycle anchors to derive the window from, so the clip behaves as if it had no
 * phase markers") is read once, behind the `i`.
 */
function FollowNoAnchors(): JSX.Element {
  return (
    <StateLine testId="follow-no-anchors" tone="text" tip={<FollowTip />}>
      <span className={prose.tagCaution}>inert</span>
      Following nothing — this composition has no out point. Set one in Playout to activate follow.
    </StateLine>
  );
}

/** What "follow the composition" derives from, said once. */
function FollowTip(): JSX.Element {
  return (
    <InfoTip title="Following the composition">
      <p>
        A clip that follows the composition takes its intro, hold and outro from the composition’s
        own anchors: the entrance (from the active in to the content start), the hold (until the out
        point) and the exit (from the out point to the active out). Its window is derived from those
        three, never authored on the clip.
      </p>
      <p>
        With no out point there are no anchors to derive from, so the clip behaves as if it had no
        phase markers: the whole clip plays as the intro and it holds its last frame. Adding an out
        point in the Playout section is what activates follow.
      </p>
    </InfoTip>
  );
}

/** The derived window's clamp warnings — the EXISTING hint styling, no second warning surface. */
function FollowClampHints({
  clamps,
  seam,
}: {
  clamps: FollowWindow['clamps'];
  /** The hold and outro-start clip times, formatted by the calling panel's own formatter. */
  seam?: { hold: string; outroStart: string };
}): JSX.Element | null {
  if (
    !clamps.introShort &&
    !clamps.holdPastEnd &&
    !clamps.noOutSegment &&
    !clamps.wholeClipOutro &&
    !clamps.outroCutByRemoval &&
    !clamps.lateSettle &&
    !clamps.holdJump
  ) {
    return null;
  }
  return (
    <div data-testid="follow-clamps">
      {clamps.holdPastEnd ? (
        <p className={lt.warn}>
          the hold time sits past the clip end — clamped to the end (a stale value after an asset
          swap?).
        </p>
      ) : null}
      {clamps.introShort ? (
        <p className={lt.warn}>
          the clip is shorter than the entrance from its head to the hold — it will freeze early.
        </p>
      ) : null}
      {clamps.noOutSegment ? (
        <p className={lt.warn}>
          the composition has no OUT segment — the out point sits at the end of the active range, so
          this clip has NO outro and holds its look through the exit. Drag the out point earlier, or
          extend the active range past it.
        </p>
      ) : null}
      {clamps.wholeClipOutro ? (
        <p className={lt.warn}>
          the OUT segment is longer than the whole clip — the outro plays the clip from its start.
        </p>
      ) : null}
      {clamps.outroCutByRemoval ? (
        <p className={lt.warn}>
          the clip's authored outro is longer than the OUT segment — the timeline removes the
          element mid-outro (on air the exit waits for it instead). It is never rescaled.
        </p>
      ) : null}
      {clamps.lateSettle ? (
        <p className={lt.warn}>
          the clip's authored intro is longer than the entrance — it starts at the composition's in
          and settles late.
        </p>
      ) : null}
      {clamps.holdJump && seam !== undefined ? (
        <p className={lt.warn}>
          on exit the clip jumps from its held look ({seam.hold}) to its outro start (
          {seam.outroStart}) — invisible for a clip that is static in its middle; check it if this
          clip is not.
        </p>
      ) : null}
    </div>
  );
}

/**
 * media-phases-follow-composition — the Lottie follow panel: the derived window READ-ONLY
 * (clip seconds + comp frames — the numbers the runtime derives, through the SAME
 * `lottieFollowWindow`), ONE editable input (`hold at`, seeded from the shared
 * poster/midpoint helper), and Detach.
 *
 * Detach bakes the derived HOLD into the manual model: `introEnd = outroStart = H`. The
 * offset intro and bounded outro are FOLLOW-ONLY capabilities the manual model cannot
 * express — leaving follow returns to `[ip → introEnd]` / `[outroStart → op]` — so the
 * hold (the load-bearing look) is what lands. `holdAt` is kept: re-attaching restores the
 * same hold time.
 */
function LottieFollowPanel({
  element,
  timing,
  anchors,
}: {
  element: LottieElement;
  timing: LottieTiming | null;
  anchors: FollowAnchors | null;
}): JSX.Element | null {
  const id = element.id;
  const phases = element.phases;
  if (phases === undefined) return null;
  if (anchors === null) return <FollowNoAnchors />;
  if (timing === null) return null;
  const fw = lottieFollowWindow(timing.meta, element.speed, anchors, phases);
  const rate = timing.meta.fr * (element.speed > 0 ? element.speed : 1);
  const sec = (f: number): string => secs(rate > 0 ? (f - timing.meta.ip) / rate : 0);
  const entranceFrames = Math.round(anchors.contentStart - anchors.activeIn);
  const outFrames = Math.round(anchors.activeOut - anchors.outPoint);
  return (
    <div className={lt.panel} data-testid="follow-window">
      <p className={lt.muted}>
        intro: clip [{sec(fw.introStartFrame)} → {sec(fw.holdFrame)}] over the entrance (
        {entranceFrames} comp frames)
      </p>
      <p className={lt.muted}>
        hold: clip {sec(fw.holdFrame)} (frame {fw.holdFrame})
        {phases.idle !== undefined && element.holdBehavior === 'idle-loop'
          ? ' · loops the idle range'
          : ' · freezes'}
      </p>
      <p className={lt.muted}>
        outro: clip [{sec(fw.outroStartFrame)} → {sec(fw.outroEndFrame)}] — the clip’s own ending,
        through the OUT ({outFrames} comp frames)
      </p>
      {fw.window.authored ? (
        <p className={dds.hint} data-testid="follow-hold-authored">
          hold frame: the clip’s own intro end (frame {fw.holdFrame}) — authored phases govern the
          window; `hold at` does not apply.
        </p>
      ) : phases.holdAt === undefined ? (
        <>
          <p className={dds.hint}>
            hold at: the frame the entrance reaches (the clip plays from its head) — set one to hold
            a specific look.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              // The seed is the SHARED poster/midpoint helper — the project's definition of
              // "the representative settled look" — never a second `(ip + op) / 2`.
              designerStore.updateElement(id, {
                phases: { ...phases, holdAt: lottieClipMidpoint(timing.meta) },
              } as Partial<Element>)
            }
          >
            Set hold frame
          </Button>
        </>
      ) : (
        <>
          <NumberField
            label="hold at"
            value={phases.holdAt}
            step={1}
            min={0}
            suffix="f"
            onCommit={(v) =>
              designerStore.updateElement(id, {
                phases: { ...phases, holdAt: Math.max(0, v) },
              } as Partial<Element>)
            }
          />
          <Button
            variant="secondary"
            onClick={() => {
              const { holdAt: _holdAt, ...rest } = phases;
              designerStore.updateElement(id, { phases: rest } as Partial<Element>);
            }}
          >
            Clear hold frame
          </Button>
        </>
      )}
      <FollowClampHints
        clamps={fw.window.clamps}
        seam={{ hold: sec(fw.holdFrame), outroStart: sec(fw.outroStartFrame) }}
      />
      <Button
        variant="secondary"
        onClick={() =>
          designerStore.updateElement(id, {
            // Session Y — Detach bakes the derived window: hold frame + the clip's own outro
            // start. Truthful by construction.
            phases: {
              ...phases,
              introEnd: fw.holdFrame,
              outroStart: fw.outroStartFrame,
              source: 'manual',
            },
          } as Partial<Element>)
        }
      >
        Detach — edit as manual
      </Button>
    </div>
  );
}

/**
 * D-125 Phase 1 — the Lottie inspector: playback speed, hold behaviour, and a
 * READ-ONLY view of the phase mapping (intro-end / outro-start). Marker-derived
 * phases are shown as text; a manually-marked mapping exposes editable frame
 * inputs; a clip with no phases shows the "plays once then freezes" hint. The
 * internal keyframe stream is opaque — there is deliberately no keyframe editor.
 * The universal CSS Filter follows (parity with ImageSections).
 *
 * D-125 Phase 3a — plus the TIMING readout: the clip's totals and every phase in the
 * animation's frames, in seconds, AND in this composition's frames, with a warning when
 * the derived entrance settle would land past the composition's out-point. The numbers
 * come from `lottieTiming` — the SAME helper the runtime derives the settle from, so what
 * is shown here is exactly what plays out.
 */
function LottieSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<LottieElement>): JSX.Element {
  const id = element.id;
  const phases = element.phases;
  // Live-updates on speed / phases (element), frame rate + out-point (scene), and on the
  // animation resolving — so every input to the readout is reactive.
  const frameRate = useDesignerSelector((s) => s.scene?.frameRate ?? 0);
  const outPoint = useDesignerSelector((s) => {
    const scene = s.scene;
    if (scene === null) return null;
    const doc = activeDocOf(scene);
    return doc.lifecycle?.outPoint ?? doc.activeRange?.out ?? doc.frameRange.out ?? null;
  });
  const animation = useLottieAnimation(element.assetId);
  const anchors = useFollowAnchors();
  const timing =
    animation === undefined
      ? null
      : lottieTiming({
          data: animation,
          speed: element.speed,
          // A FOLLOW-source element is fed the marker-less shape: its stored numbers are
          // IGNORED data, and `lottieTiming` reading them would show a settle/breakdown the
          // runtime does not derive (the follow panel shows the derived window instead).
          phases: followsComposition(phases) ? undefined : phases,
          compositionFps: frameRate,
        });
  return (
    <>
      <CollapseSection title="Lottie" defaultExpanded>
        <NumberField
          label="speed"
          value={element.speed}
          step={0.1}
          min={0.1}
          suffix="×"
          onCommit={(speed) => {
            if (speed > 0) designerStore.updateElement(id, { speed } as Partial<Element>);
          }}
        />
        <SelectField
          label="on hold"
          value={element.holdBehavior}
          options={['freeze', 'idle-loop'] as const}
          labels={['Freeze', 'Loop idle segment']}
          onCommit={(holdBehavior) =>
            designerStore.updateElement(id, { holdBehavior } as Partial<Element>)
          }
        />
        {phases === undefined ? (
          // §4.5 (A) — a marker-less clip freezes on `op`, which for a furniture clip is the
          // frame it has animated OFF to: it plays once and goes blank, on the canvas AND on
          // air, and until now the Inspector only EXPLAINED that. A hint that names a problem
          // and offers no way out teaches nothing (the same rule the owner settled for §9.1),
          // so the hint is now an affordance.
          //
          // The seed is deliberately the two values that claim the LEAST:
          //  - `introEnd` = the clip MIDPOINT, the same frame the canvas poster already
          //    picks for a marker-less clip, through the same `lottieClipMidpoint` — so
          //    converting a clip never MOVES its picture;
          //  - `outroStart` = `op`, i.e. DEGENERATE — "no outro claimed". We cannot detect
          //    where a clip animates off, and a seeded outro would invent an authorial claim,
          //    which is exactly what §4.5 rejects. A degenerate outro now holds the settled
          //    frame correctly (§4.4), so this seed is well-defined rather than a placeholder.
          //
          // Both land in the editable inputs below, where the operator SEES and corrects
          // them. That visibility is the whole justification for seeding over guessing in the
          // runtime: a seed the operator cannot see would forfeit it.
          <>
            <p className={dds.hint}>No phase markers — plays once then freezes.</p>
            <Button
              variant="secondary"
              disabled={timing === null}
              onClick={() => {
                if (timing === null) return;
                designerStore.updateElement(id, {
                  phases: {
                    introEnd: lottieClipMidpoint(timing.meta),
                    outroStart: timing.meta.op,
                    source: 'manual',
                  },
                } as Partial<Element>);
              }}
            >
              Add phase markers
            </Button>
            {/* media-phases-follow-composition — the third source. The slots carry the same
                claim-least seed as Add (midpoint / op); under follow they are IGNORED, kept
                only so a later Detach has somewhere to land. The seed is SHARED with the
                add-time duration guard's backdrop commit (`follow-attach.ts`) — one rule. */}
            <Button
              variant="secondary"
              disabled={timing === null}
              onClick={() => {
                if (timing === null) return;
                designerStore.updateElement(id, {
                  phases: lottieFollowAttachPhases(),
                } as Partial<Element>);
              }}
            >
              Follow composition
            </Button>
          </>
        ) : phases.source === 'composition' ? (
          <LottieFollowPanel element={element} timing={timing} anchors={anchors} />
        ) : phases.source === 'markers' ? (
          <>
            <div className={fieldCss.row}>
              <span className={fieldCss.label}>phases</span>
              <span>from markers</span>
            </div>
            {/* Attaching KEEPS the marker values in the slots — they are ignored under
                follow, and a Detach bakes over them (one-way by design: the markers were a
                claim about the clip; the bake is a claim about this composition). */}
            <Button
              variant="secondary"
              onClick={() =>
                designerStore.updateElement(id, {
                  phases: { ...phases, source: 'composition' },
                } as Partial<Element>)
              }
            >
              Follow composition
            </Button>
          </>
        ) : (
          // MANUAL phases are necessarily authored in the ANIMATION's frame space, so each
          // input carries a live comp-frame equivalent — the designer sees what they are
          // actually building on this composition's timeline while typing.
          <>
            <NumberField
              label="intro end"
              value={phases.introEnd ?? (timing !== null ? lottieClipMidpoint(timing.meta) : 0)}
              step={1}
              min={0}
              suffix="f"
              onCommit={(v) =>
                designerStore.updateElement(id, {
                  phases: { ...phases, introEnd: Math.max(0, v) },
                } as Partial<Element>)
              }
            />
            {timing !== null ? (
              <span className={lt.compEquiv}>= frame {timing.intro.compFrames} of this comp</span>
            ) : null}
            <NumberField
              label="outro start"
              value={phases.outroStart ?? timing?.meta.op ?? 0}
              step={1}
              min={0}
              suffix="f"
              onCommit={(v) =>
                designerStore.updateElement(id, {
                  phases: { ...phases, outroStart: Math.max(0, v) },
                } as Partial<Element>)
              }
            />
            {timing !== null ? (
              <span className={lt.compEquiv}>
                = {timing.outro.compFrames} comp frames of outro after OUT
              </span>
            ) : null}
            <Button
              variant="secondary"
              onClick={() =>
                designerStore.updateElement(id, {
                  phases: { ...phases, source: 'composition' },
                } as Partial<Element>)
              }
            >
              Follow composition
            </Button>
          </>
        )}
        {/* Under follow the FOLLOW panel carries the comp-space answers (derived values);
            the standard breakdown would read the IGNORED stored numbers. */}
        {timing === null || phases?.source === 'composition' ? null : (
          <LottieTimingPanel
            timing={timing}
            holdBehavior={element.holdBehavior}
            outPoint={outPoint}
          />
        )}
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
//                              VIDEO (D-128 Phase 3)
// ────────────────────────────────────────────────────────────────────────

/**
 * media-phases-follow-composition — the VIDEO follow panel: the same affordances as the
 * Lottie's, in the clip's own MS (video is the ms-native kind, so it consumes the shared
 * `followWindowMs` core directly — the Lottie is the kind that needs a unit adapter).
 * Detach bakes the derived hold exactly as the Lottie panel does (`introEnd = outroStart
 * = H`, `holdAt` kept, `source: 'manual'`).
 */
function VideoFollowPanel({
  element,
  anchors,
}: {
  element: VideoElement;
  anchors: FollowAnchors | null;
}): JSX.Element | null {
  const id = element.id;
  const phases = element.phases;
  if (phases === undefined) return null;
  if (anchors === null) return <FollowNoAnchors />;
  const duration = element.durationMs;
  const w = followWindowMs(anchors, {
    durationMs: duration,
    holdAtMs: phases.holdAt,
    ...videoFollowClipFacts(phases, duration),
  });
  const s = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;
  const entranceFrames = Math.round(anchors.contentStart - anchors.activeIn);
  const outFrames = Math.round(anchors.activeOut - anchors.outPoint);
  return (
    <div className={lt.panel} data-testid="follow-window">
      <p className={lt.muted}>
        intro: clip [{s(w.introStartMs)} → {s(w.holdMs)}] over the entrance ({entranceFrames} comp
        frames)
      </p>
      <p className={lt.muted}>
        hold: clip {s(w.holdMs)}
        {phases.idle !== undefined && element.holdBehavior === 'loop'
          ? ' · loops the idle range'
          : ' · freezes'}
      </p>
      <p className={lt.muted}>
        outro: clip [{s(w.outroStartMs)} → {s(w.outroEndMs)}] — the clip’s own ending, through the
        OUT ({outFrames} comp frames)
      </p>
      {w.authored ? (
        <p className={dds.hint} data-testid="follow-hold-authored">
          hold frame: the clip’s own intro end ({s(w.holdMs)}) — authored phases govern the window;
          `hold at` does not apply.
        </p>
      ) : phases.holdAt === undefined ? (
        <>
          <p className={dds.hint}>
            hold at: the time the entrance reaches (the clip plays from its head) — set one to hold
            a specific look.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              // The seed is the SHARED poster helper's midpoint — the same "representative
              // settled look" the canvas poster and the import thumbnail already use.
              designerStore.updateElement(id, {
                phases: { ...phases, holdAt: posterTimeMs(duration) },
              } as Partial<Element>)
            }
          >
            Set hold time
          </Button>
        </>
      ) : (
        <>
          <NumberField
            label="hold at"
            value={phases.holdAt}
            step={100}
            min={0}
            max={duration}
            suffix="ms"
            onCommit={(v) =>
              designerStore.updateElement(id, {
                phases: { ...phases, holdAt: Math.min(Math.max(0, Math.round(v)), duration) },
              } as Partial<Element>)
            }
          />
          <Button
            variant="secondary"
            onClick={() => {
              const { holdAt: _holdAt, ...rest } = phases;
              designerStore.updateElement(id, { phases: rest } as Partial<Element>);
            }}
          >
            Clear hold time
          </Button>
        </>
      )}
      <FollowClampHints
        clamps={w.clamps}
        seam={{ hold: s(w.holdMs), outroStart: s(w.outroStartMs) }}
      />
      <Button
        variant="secondary"
        onClick={() =>
          designerStore.updateElement(id, {
            // Session Y — Detach bakes the CURRENTLY-DERIVED window: the hold point and the
            // clip's own outro start. Truthful by construction — manual then plays the same
            // phases follow was playing.
            phases: {
              ...phases,
              introEnd: Math.round(w.holdMs),
              outroStart: Math.round(w.outroStartMs),
              source: 'manual',
            },
          } as Partial<Element>)
        }
      >
        Detach — edit as manual
      </Button>
    </div>
  );
}

/**
 * D-128 Phase 3 — the imported-clip inspector (decision (d)). Exposes the poster
 * frame (mid-clip, following the In point), the MANUAL phase marks in the clip's
 * OWN time space (ms), hold behaviour (default loop), and `drivesHold` (default
 * off). It surfaces the stored provenance READ-ONLY (decision (e)) and never
 * exposes the clip's inner content (opaque by design). Transform/opacity/filter
 * keyframe rows come from the shared Transform + Filter sections (field-registry
 * `video: UNIVERSAL_ONLY`). Playback lifecycle is Phase 4.
 */
function VideoSections({
  element,
  currentFrame,
  selectedKeyframe,
}: SectionProps<VideoElement>): JSX.Element {
  const id = element.id;
  const url = useAssetUrl(element.assetId);
  const provenance = useAssets().find((a) => a.assetId === element.assetId)?.provenance;
  const phases = element.phases;
  const duration = element.durationMs;
  const anchors = useFollowAnchors();
  const follows = followsComposition(phases);
  // `DESIGNER-FIX-0905` — `drives hold` is WITHHELD while the composition has no out point:
  // with none it is `static`, every hold source is ignored, and the flag can change nothing
  // until an out point exists. Disabled with the reason on the control, never hidden — the
  // author must still see that the flag exists and what unlocks it.
  const hasOutPoint = useDesignerSelector((s) => {
    const scene = s.scene;
    return scene !== null && activeDocOf(scene).lifecycle !== undefined;
  });
  // A follower's stored `introEnd` is IGNORED data — the poster anchor is `holdAt` (the
  // held look), mirroring the scene-builder's `videoPosterMs` rule; the runtime refines
  // the canvas dataset to the exact derived H.
  const posterMs = posterTimeMs(duration, follows ? phases?.holdAt : phases?.introEnd);

  /** Commit a phase-mark edit, clamped to [0, duration] and keeping introEnd ≤ outroStart. */
  function commitPhase(next: { introEnd?: number; outroStart?: number }): void {
    if (phases === undefined) return;
    const clamp = (v: number): number => Math.min(Math.max(0, Math.round(v)), duration);
    let introEnd = clamp(next.introEnd ?? phases.introEnd ?? Math.round(duration / 2));
    let outroStart = clamp(next.outroStart ?? phases.outroStart ?? duration);
    // keep the invariant: whichever mark the operator moved wins, the other yields.
    if (introEnd > outroStart) {
      if (next.introEnd !== undefined) outroStart = introEnd;
      else introEnd = outroStart;
    }
    designerStore.updateElement(id, {
      phases: { ...phases, introEnd, outroStart },
    } as Partial<Element>);
  }

  return (
    <>
      <CollapseSection title="Video" defaultExpanded>
        {url !== null && (
          <VideoPoster
            url={url}
            atMs={posterMs}
            ariaLabel={`Poster frame of ${element.name}`}
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 140,
              objectFit: 'contain',
              borderRadius: 4,
              // a checkerboard so alpha reads as transparency (mirrors the modal)
              background:
                'repeating-conic-gradient(#3a3e55 0% 25%, #2a2d42 0% 50%) 0 0 / 16px 16px',
            }}
          />
        )}
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>duration</span>
          <span>{(duration / 1000).toFixed(2)} s</span>
        </div>
        <SelectField
          label="on hold"
          value={element.holdBehavior}
          options={['loop', 'freeze'] as const}
          labels={['Loop', 'Freeze']}
          onCommit={(holdBehavior) =>
            designerStore.updateElement(id, { holdBehavior } as Partial<Element>)
          }
        />
        <SelectField
          label="drives hold"
          value={element.drivesHold === true ? 'on' : 'off'}
          options={['off', 'on'] as const}
          labels={['No', 'Yes']}
          withheld={
            hasOutPoint
              ? undefined
              : 'Inert: this composition has no out point, so it has no hold for a clip to ' +
                'drive. Add an out point in the Playout section first.'
          }
          // Q — the flag has exactly ONE writer, and it is the deep-reaching one.
          // `updateElement` is shallow (it goes through `locate`, which searches a layer's
          // DIRECT children only), so this control could not write a grouped element's flag;
          // `setElementDrivesHold` recurses containers and is the same action the Playout
          // checklist's row calls. Two writers with different reach is how the two surfaces
          // come to disagree about one flag.
          onCommit={(v) => designerStore.setElementDrivesHold(id, v === 'on')}
        />
        {phases === undefined ? (
          <>
            {/* `DESIGNER-FIX-0905` — the STATE inline (no marks: the whole clip is the intro);
                what that means for the hold, the outro and the poster is behind the `i`. */}
            <StateLine
              tip={
                <InfoTip title="Phase marks">
                  <p>
                    Without phase marks the whole clip is the intro: the hold loops the whole clip
                    and there is no outro. The poster frame is the clip midpoint.
                  </p>
                  <p>
                    <strong>Add phase marks</strong> splits the clip into intro, hold and outro at
                    times you set in the clip’s own milliseconds.{' '}
                    <strong>Follow composition</strong> derives them from the composition’s out
                    point instead.
                  </p>
                </InfoTip>
              }
            >
              No phase marks — the whole clip plays as the intro.
            </StateLine>
            <Button
              variant="secondary"
              onClick={() =>
                designerStore.updateElement(id, {
                  phases: { introEnd: Math.round(duration / 2), outroStart: duration },
                } as Partial<Element>)
              }
            >
              Add phase marks
            </Button>
            {/* media-phases-follow-composition — the third source, presented exactly as the
                Lottie's. The slots carry the claim-least seed (poster midpoint / duration);
                IGNORED under follow, kept as the Detach landing. Shared with the add-time
                duration guard's backdrop commit (`follow-attach.ts`) — one rule. */}
            <Button
              variant="secondary"
              onClick={() =>
                designerStore.updateElement(id, {
                  phases: videoFollowAttachPhases(),
                } as Partial<Element>)
              }
            >
              Follow composition
            </Button>
          </>
        ) : follows ? (
          <VideoFollowPanel element={element} anchors={anchors} />
        ) : (
          <>
            <NumberField
              label="in point"
              value={phases.introEnd ?? Math.round(duration / 2)}
              step={100}
              min={0}
              max={duration}
              suffix="ms"
              onCommit={(v) => commitPhase({ introEnd: v })}
            />
            <NumberField
              label="out point"
              value={phases.outroStart ?? duration}
              step={100}
              min={0}
              max={duration}
              suffix="ms"
              onCommit={(v) => commitPhase({ outroStart: v })}
            />
            <span className={lt.compEquiv}>
              Poster frame: {(posterMs / 1000).toFixed(2)} s (the In point)
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                designerStore.updateElement(id, { phases: undefined } as Partial<Element>)
              }
            >
              Clear phase marks
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                designerStore.updateElement(id, {
                  phases: { ...phases, source: 'composition' },
                } as Partial<Element>)
              }
            >
              Follow composition
            </Button>
          </>
        )}
        {/*
          `DESIGNER-FIX-0905` — the provenance is FACTS, so it is FIELDS, like `duration`
          above: one labelled row per fact instead of one sentence carrying four. Read-only
          (decision (e)); the `data-testid` wraps the group so the facts stay assertable.
        */}
        {provenance !== undefined && (
          <div data-testid="video-provenance">
            <div className={fieldCss.row}>
              <span className={fieldCss.label}>source</span>
              <span className={fieldCss.readout} title={provenance.sourceFilename}>
                {provenance.sourceFilename}
              </span>
            </div>
            <div className={fieldCss.row}>
              <span className={fieldCss.label}>source size</span>
              <span className={fieldCss.readout}>
                {String(provenance.sourceWidth)}×{String(provenance.sourceHeight)}
              </span>
            </div>
            {provenance.sourceFps !== provenance.targetFps && (
              <div className={fieldCss.row}>
                <span className={fieldCss.label}>conformed</span>
                <span className={fieldCss.readout}>
                  {String(provenance.sourceFps)}→{String(provenance.targetFps)} fps
                </span>
              </div>
            )}
            {provenance.crop !== undefined && (
              <div className={fieldCss.row}>
                <span className={fieldCss.label}>cropped to</span>
                <span className={fieldCss.readout}>
                  {String(provenance.crop.width)}×{String(provenance.crop.height)}
                </span>
              </div>
            )}
          </div>
        )}
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
        {/* D-039ext — separator is a text glyph OR an image/logo (project or shared). */}
        <TickerSeparatorControl element={element} />
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
        <StateLine tip={<TimeDrivenTip kind="ticker" />}>
          Time-driven — scrubbing does not move it.
        </StateLine>
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
        {/* D-103 — blink the colon separator(s) on/off + an adjustable rate. Applies to every
            clock mode; off by default (steady colons). */}
        <SelectField
          label="blink colon"
          value={element.blinkColon === true ? 'on' : 'off'}
          options={['off', 'on'] as const}
          onCommit={(v) =>
            designerStore.updateElement(id, { blinkColon: v === 'on' } as Partial<Element>)
          }
        />
        {element.blinkColon === true && (
          <NumberField
            label="blink rate"
            value={element.blinkPeriodMs ?? 1000}
            step={100}
            min={100}
            suffix="ms"
            onCommit={(ms) =>
              designerStore.updateElement(id, {
                blinkPeriodMs: Math.max(100, Math.round(ms)),
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
        <StateLine tip={<TimeDrivenTip kind="clock" />}>
          Time-driven — scrubbing does not move it.
        </StateLine>
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
  // D-083 — composition items pick from the scene's compositions: the nestable
  // ones (the author-time cycle guard) plus any already referenced (so a momentarily
  // invalid choice doesn't vanish from its picker).
  const scene = useDesignerSelector((sel) => sel.scene);
  const comps = scene?.compositions ?? [];
  const referenced = new Set(
    element.items.filter((it) => it.kind === 'composition').map((it) => it.compositionId),
  );
  const compChoices = comps
    .filter((c) => referenced.has(c.id) || designerStore.canNestCompositionInActive(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  // A referenced composition that no longer exists (deleted) stays visible as
  // "(missing composition)" so the picker shows the real (broken) wiring instead of
  // silently displaying the first option — matching the clock-timezone / repeater pickers.
  const missingRefs = [...referenced].filter(
    (cid) => cid !== '' && !compChoices.some((c) => c.id === cid),
  );
  const compChoicesAll = [
    ...compChoices,
    ...missingRefs.map((cid) => ({ id: cid, name: '(missing composition)' })),
  ];
  // D-083 follow-up — per-item TEXT bind: the active doc's bindings tell us each item's
  // current data key (the `sequence-item-text` binding's fieldId, '' = unbound). Read from
  // the ACTIVE composition's field data (not the root scene), matching where setSequence…
  // writes them.
  const docBindings = scene !== null ? activeFieldData(scene).bindings : [];
  const itemDataKey = (itemId: string): string => {
    const b = docBindings.find(
      (bd) =>
        bd.target.kind === 'sequence-item-text' &&
        bd.target.elementId === id &&
        bd.target.itemId === itemId,
    );
    return b?.fieldId ?? '';
  };
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
        <StateLine tip={<TimeDrivenTip kind="sequence" />}>
          Time-driven — scrubbing does not move it.
        </StateLine>
      </CollapseSection>

      <CollapseSection
        title="Items"
        defaultExpanded
        trailing={
          // `DESIGNER-FIX-0905` — the paragraph under the list held one TEACHING sentence (what
          // a composition item is) and one that DUPLICATED the per-item data-key field's own
          // placeholder ("data key — bind for operator editing (optional)"). The duplicate is
          // deleted; the teaching is read once, here.
          <InfoTip title="Sequence items">
            <p>
              A <strong>text</strong> item is one line of the rotation. Give it a data key to make
              it operator-editable; without one it is static design-time text.
            </p>
            <p>
              A <strong>composition</strong> item rotates a one-element clock or logo, or a composed
              layout, through the sequence’s transitions; its live content — a clock — keeps ticking
              while it is shown.
            </p>
          </InfoTip>
        }
      >
        <ListItemsEditor
          items={element.items}
          label={element.name || 'Sequence'}
          dir={element.direction}
          showDwell
          compositions={compChoicesAll}
          onChange={(items) => designerStore.setSequenceItems(id, items)}
          itemDataKey={itemDataKey}
          onItemDataKey={(itemId, key) => designerStore.setSequenceItemDataKey(id, itemId, key)}
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
        {/* `DESIGNER-FIX-0905` — "0 max items = unlimited" is the FIELD's own state now: the
            unit slot reads `unlimited` at 0. The stamping mechanism is behind the `i`. */}
        <NumberField
          label="max items"
          value={element.maxItems ?? 0}
          step={1}
          min={0}
          suffix={element.maxItems === undefined ? 'unlimited' : undefined}
          onCommit={(n) =>
            designerStore.updateElement(id, {
              maxItems: n >= 1 ? Math.round(n) : undefined,
            } as Partial<Element>)
          }
        />
        <StateLine
          tip={
            <InfoTip title="How a repeater stamps rows">
              <p>
                A repeater stamps one instance of “{child?.name ?? element.compositionId}” per item
                in its list, laid out by the direction and gap above.
              </p>
              <p>
                Values inside the rows update live on air. The <em>number</em> of rows is stamped
                once at each play — adding or removing items takes effect on the next take. A max
                items of 0 means no limit.
              </p>
            </InfoTip>
          }
        >
          One “{child?.name ?? element.compositionId}” per item.
        </StateLine>
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
