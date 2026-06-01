import type {
  AnimatableProperty,
  Element,
  Filter,
  ImageElement,
  Padding,
  Shadow,
  ShapeElement,
  TextElement,
} from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import { hasKeyframeAt, keyframeVariantFor } from '../timeline/keyframe-helpers.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField } from './controls.js';
import { TextStyleSection } from './TextStyleSection.js';

interface Props {
  element: Element;
  currentFrame: number;
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
 * Real keyframe indicator for a numeric animatable property. Reads
 * variant from keyframeVariantFor; clicking toggles a keyframe at the
 * current frame using the current static value.
 */
function animPointIcon(
  element: Element,
  property: AnimatableProperty,
  currentFrame: number,
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null,
  read: (el: Element) => number,
): JSX.Element {
  const variant = keyframeVariantFor(element, property, currentFrame, selectedKeyframe);
  return (
    <KeyframeIndicator
      variant={variant}
      onClick={() => {
        if (hasKeyframeAt(element, property, currentFrame)) {
          designerStore.removeKeyframe(element.id, property, currentFrame);
        } else {
          designerStore.upsertKeyframe(element.id, property, currentFrame, read(element));
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
export function StyleSection({ element, currentFrame, selectedKeyframe }: Props): JSX.Element {
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
  const fillColor =
    element.fill !== undefined && element.fill.kind === 'solid' ? element.fill.color : '#000000';
  const strokeColor = element.stroke?.color ?? '#000000';
  const strokeWidth = element.stroke?.width ?? 0;
  const strokeDashFirst = element.stroke?.dash?.[0] ?? 0;
  return (
    <>
      <CollapseSection title="Path style" defaultExpanded>
        <SelectField
          label="shape"
          value={element.shape}
          options={['rect', 'rounded-rect', 'ellipse'] as const}
          onCommit={(shape) =>
            designerStore.updateElement(id, { shape } as unknown as Partial<Element>)
          }
          trailing={pointIcon('shape')}
        />
        <ColorField
          label="fill"
          value={fillColor}
          onCommit={(color) =>
            designerStore.updateElement(id, {
              fill: { kind: 'solid', color },
            } as Partial<Element>)
          }
          trailing={pointIcon('fill')}
        />
        <ColorField
          label="stroke"
          value={strokeColor}
          onCommit={(color) =>
            designerStore.updateElement(id, {
              stroke: { ...(element.stroke ?? { width: 0 }), color },
            } as Partial<Element>)
          }
          trailing={pointIcon('stroke')}
        />
        <NumberField
          label="stroke width"
          value={strokeWidth}
          step={1}
          min={0}
          onCommit={(width) => designerStore.commitAnimatable(id, 'stroke.width', width)}
          trailing={animPointIcon(
            element,
            'stroke.width',
            currentFrame,
            selectedKeyframe,
            (el) => (el.type === 'shape' ? (el.stroke?.width ?? 0) : 0),
          )}
        />
        <NumberField
          label="dash array"
          value={strokeDashFirst}
          step={1}
          min={0}
          onCommit={(d) => designerStore.commitAnimatable(id, 'stroke.dash', d)}
          trailing={animPointIcon(
            element,
            'stroke.dash',
            currentFrame,
            selectedKeyframe,
            (el) => (el.type === 'shape' ? (el.stroke?.dash?.[0] ?? 0) : 0),
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
  function setShadowColor(color: string): void {
    if (element.type === 'shape') {
      designerStore.updateElement(id, { shadow: { ...s, color } } as unknown as Partial<Element>);
    } else {
      designerStore.updateElement(id, {
        textShadow: { ...s, color },
      } as unknown as Partial<Element>);
    }
  }
  return (
    <CollapseSection title={title}>
      <NumberField
        label="offset X"
        value={s.offsetX}
        step={1}
        onCommit={(v) => designerStore.commitAnimatable(id, 'shadow.offsetX', v)}
        trailing={animPointIcon(element, 'shadow.offsetX', currentFrame, selectedKeyframe, () => s.offsetX)}
      />
      <NumberField
        label="offset Y"
        value={s.offsetY}
        step={1}
        onCommit={(v) => designerStore.commitAnimatable(id, 'shadow.offsetY', v)}
        trailing={animPointIcon(element, 'shadow.offsetY', currentFrame, selectedKeyframe, () => s.offsetY)}
      />
      <NumberField
        label="blur"
        value={s.blur}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'shadow.blur', v)}
        trailing={animPointIcon(element, 'shadow.blur', currentFrame, selectedKeyframe, () => s.blur)}
      />
      <ColorField
        label="color"
        value={s.color}
        onCommit={setShadowColor}
        trailing={pointIcon('shadow color')}
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
        value={p.top}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.top', v)}
        trailing={animPointIcon(element, 'padding.top', currentFrame, selectedKeyframe, () => p.top)}
      />
      <NumberField
        label="right"
        value={p.right}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.right', v)}
        trailing={animPointIcon(element, 'padding.right', currentFrame, selectedKeyframe, () => p.right)}
      />
      <NumberField
        label="bottom"
        value={p.bottom}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.bottom', v)}
        trailing={animPointIcon(element, 'padding.bottom', currentFrame, selectedKeyframe, () => p.bottom)}
      />
      <NumberField
        label="left"
        value={p.left}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'padding.left', v)}
        trailing={animPointIcon(element, 'padding.left', currentFrame, selectedKeyframe, () => p.left)}
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
    <CollapseSection title="Border radius">
      <NumberField
        label="radius"
        value={radius}
        step={1}
        min={0}
        onCommit={(v) => designerStore.commitAnimatable(id, 'cornerRadius', v)}
        trailing={animPointIcon(element, 'cornerRadius', currentFrame, selectedKeyframe, () => radius)}
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
  ): JSX.Element {
    const key = property.slice('filter.'.length) as keyof Filter;
    const value = f[key] ?? fallback;
    return (
      <NumberField
        label={label}
        value={value}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
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
      {row('blur', 'filter.blur', 0, 0.5, 0, undefined)}
      {row('brightness %', 'filter.brightness', 100, 1, 0, undefined)}
      {row('contrast %', 'filter.contrast', 100, 1, 0, undefined)}
      {row('grayscale %', 'filter.grayscale', 0, 1, 0, 100)}
      {row('hue rotate °', 'filter.hueRotate', 0, 1, undefined, undefined)}
      {row('invert %', 'filter.invert', 0, 1, 0, 100)}
      {row('opacity %', 'filter.opacity', 100, 1, 0, 100)}
      {row('saturate %', 'filter.saturate', 100, 1, 0, undefined)}
      {row('sepia %', 'filter.sepia', 0, 1, 0, 100)}
    </CollapseSection>
  );
}
