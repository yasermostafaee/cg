import type {
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
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField, TextField } from './controls.js';

interface Props {
  element: Element;
}

/**
 * D-010 — empty point icon next to every property row. Visual parity
 * with the timeline label column; clicking is a no-op for now because
 * these properties aren't in AnimatableProperty yet (the existing 8
 * Transform rows in TransformSection have real, clickable indicators).
 */
function pointIcon(label: string): JSX.Element {
  return (
    <KeyframeIndicator
      variant="empty"
      onClick={() => {
        /* intentionally no-op — D-010 properties are static-only */
      }}
      ariaLabel={`${label} — animation not yet supported`}
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
export function StyleSection({ element }: Props): JSX.Element {
  if (element.type === 'text') return <TextSections element={element} />;
  if (element.type === 'shape') return <ShapeSections element={element} />;
  if (element.type === 'image') return <ImageSections element={element} />;
  return <></>;
}

// ────────────────────────────────────────────────────────────────────────
//                              TEXT
// ────────────────────────────────────────────────────────────────────────

function TextSections({ element }: { element: TextElement }): JSX.Element {
  const id = element.id;
  return (
    <>
      <CollapseSection title="Text" defaultExpanded>
        <TextField
          label="text"
          value={element.text}
          onCommit={(text) => designerStore.updateElement(id, { text } as Partial<Element>)}
          trailing={pointIcon('text')}
        />
        <TextField
          label="font"
          value={element.font.family}
          onCommit={(family) =>
            designerStore.updateElement(id, {
              font: { ...element.font, family },
            } as Partial<Element>)
          }
          trailing={pointIcon('font')}
        />
        <NumberField
          label="font size"
          value={element.font.size}
          step={1}
          min={1}
          onCommit={(size) =>
            designerStore.updateElement(id, {
              font: { ...element.font, size },
            } as Partial<Element>)
          }
          trailing={pointIcon('font size')}
        />
        <NumberField
          label="weight"
          value={element.font.weight}
          step={100}
          min={100}
          max={900}
          onCommit={(weight) =>
            designerStore.updateElement(id, {
              font: { ...element.font, weight },
            } as Partial<Element>)
          }
          trailing={pointIcon('weight')}
        />
        <NumberField
          label="line height"
          value={element.font.lineHeight}
          step={0.05}
          min={0.1}
          onCommit={(lineHeight) =>
            designerStore.updateElement(id, {
              font: { ...element.font, lineHeight },
            } as Partial<Element>)
          }
          trailing={pointIcon('line height')}
        />
        <NumberField
          label="letter spacing"
          value={element.font.letterSpacing}
          step={0.01}
          onCommit={(letterSpacing) =>
            designerStore.updateElement(id, {
              font: { ...element.font, letterSpacing },
            } as Partial<Element>)
          }
          trailing={pointIcon('letter spacing')}
        />
        <ColorField
          label="color"
          value={element.color}
          onCommit={(color) => designerStore.updateElement(id, { color } as Partial<Element>)}
          trailing={pointIcon('color')}
        />
        <ColorField
          label="background"
          value={element.backgroundColor ?? '#FFFFFF'}
          onCommit={(backgroundColor) =>
            designerStore.updateElement(id, { backgroundColor } as Partial<Element>)
          }
          trailing={pointIcon('background')}
        />
        <SelectField
          label="align"
          value={element.align}
          options={['start', 'center', 'end', 'justify'] as const}
          onCommit={(align) => designerStore.updateElement(id, { align } as Partial<Element>)}
          trailing={pointIcon('align')}
        />
        <SelectField
          label="direction"
          value={element.direction}
          options={['auto', 'ltr', 'rtl'] as const}
          onCommit={(direction) =>
            designerStore.updateElement(id, { direction } as Partial<Element>)
          }
          trailing={pointIcon('direction')}
        />
      </CollapseSection>

      <DropShadowSection
        title="Drop Shadow"
        shadow={element.textShadow}
        onChange={(textShadow) =>
          designerStore.updateElement(id, { textShadow } as unknown as Partial<Element>)
        }
      />

      <TextPaddingSection
        padding={element.padding}
        onChange={(padding) =>
          designerStore.updateElement(id, { padding } as unknown as Partial<Element>)
        }
      />

      <BorderRadiusSection
        radius={element.cornerRadius ?? 0}
        onChange={(cornerRadius) =>
          designerStore.updateElement(id, { cornerRadius } as unknown as Partial<Element>)
        }
      />

      <FilterSection
        filter={element.filter}
        onChange={(filter) =>
          designerStore.updateElement(id, { filter } as unknown as Partial<Element>)
        }
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              SHAPE
// ────────────────────────────────────────────────────────────────────────

function ShapeSections({ element }: { element: ShapeElement }): JSX.Element {
  const id = element.id;
  const fillColor =
    element.fill !== undefined && element.fill.kind === 'solid' ? element.fill.color : '#000000';
  const strokeColor = element.stroke?.color ?? '#000000';
  const strokeWidth = element.stroke?.width ?? 0;
  const strokeDashFirst = element.stroke?.dash?.[0] ?? 0;
  const cornerRadius =
    typeof element.cornerRadius === 'number'
      ? element.cornerRadius
      : Array.isArray(element.cornerRadius)
        ? element.cornerRadius[0]
        : 0;
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
          onCommit={(width) =>
            designerStore.updateElement(id, {
              stroke: { ...(element.stroke ?? { color: strokeColor }), width },
            } as Partial<Element>)
          }
          trailing={pointIcon('stroke width')}
        />
        <NumberField
          label="dash array"
          value={strokeDashFirst}
          step={1}
          min={0}
          onCommit={(d) =>
            designerStore.updateElement(id, {
              stroke: {
                ...(element.stroke ?? { color: strokeColor, width: strokeWidth }),
                dash: d > 0 ? [d] : [],
              },
            } as unknown as Partial<Element>)
          }
          trailing={pointIcon('dash array')}
        />
      </CollapseSection>

      <BorderRadiusSection
        radius={cornerRadius}
        onChange={(r) =>
          designerStore.updateElement(id, {
            cornerRadius: r,
            shape: r > 0 && element.shape === 'rect' ? 'rounded-rect' : element.shape,
          } as unknown as Partial<Element>)
        }
      />

      <DropShadowSection
        title="Drop Shadow"
        shadow={element.shadow}
        onChange={(shadow) =>
          designerStore.updateElement(id, { shadow } as unknown as Partial<Element>)
        }
      />

      <FilterSection
        filter={element.filter}
        onChange={(filter) =>
          designerStore.updateElement(id, { filter } as unknown as Partial<Element>)
        }
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                              IMAGE
// ────────────────────────────────────────────────────────────────────────

function ImageSections({ element }: { element: ImageElement }): JSX.Element {
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
        filter={element.filter}
        onChange={(filter) =>
          designerStore.updateElement(id, { filter } as unknown as Partial<Element>)
        }
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                       REUSABLE SECTIONS
// ────────────────────────────────────────────────────────────────────────

function DropShadowSection({
  title,
  shadow,
  onChange,
}: {
  title: string;
  shadow: Shadow | undefined;
  onChange: (s: Shadow | undefined) => void;
}): JSX.Element {
  const s: Shadow = shadow ?? { offsetX: 0, offsetY: 0, blur: 0, color: '#000000' };
  return (
    <CollapseSection title={title}>
      <NumberField
        label="offset X"
        value={s.offsetX}
        step={1}
        onCommit={(offsetX) => onChange({ ...s, offsetX })}
        trailing={pointIcon('offset X')}
      />
      <NumberField
        label="offset Y"
        value={s.offsetY}
        step={1}
        onCommit={(offsetY) => onChange({ ...s, offsetY })}
        trailing={pointIcon('offset Y')}
      />
      <NumberField
        label="blur"
        value={s.blur}
        step={1}
        min={0}
        onCommit={(blur) => onChange({ ...s, blur })}
        trailing={pointIcon('blur')}
      />
      <ColorField
        label="color"
        value={s.color}
        onCommit={(color) => onChange({ ...s, color })}
        trailing={pointIcon('shadow color')}
      />
    </CollapseSection>
  );
}

function TextPaddingSection({
  padding,
  onChange,
}: {
  padding: Padding | undefined;
  onChange: (p: Padding) => void;
}): JSX.Element {
  const p: Padding = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return (
    <CollapseSection title="Text Padding">
      <NumberField
        label="top"
        value={p.top}
        step={1}
        min={0}
        onCommit={(top) => onChange({ ...p, top })}
        trailing={pointIcon('padding top')}
      />
      <NumberField
        label="right"
        value={p.right}
        step={1}
        min={0}
        onCommit={(right) => onChange({ ...p, right })}
        trailing={pointIcon('padding right')}
      />
      <NumberField
        label="bottom"
        value={p.bottom}
        step={1}
        min={0}
        onCommit={(bottom) => onChange({ ...p, bottom })}
        trailing={pointIcon('padding bottom')}
      />
      <NumberField
        label="left"
        value={p.left}
        step={1}
        min={0}
        onCommit={(left) => onChange({ ...p, left })}
        trailing={pointIcon('padding left')}
      />
    </CollapseSection>
  );
}

function BorderRadiusSection({
  radius,
  onChange,
}: {
  radius: number;
  onChange: (r: number) => void;
}): JSX.Element {
  return (
    <CollapseSection title="Border radius">
      <NumberField
        label="radius"
        value={radius}
        step={1}
        min={0}
        onCommit={onChange}
        trailing={pointIcon('radius')}
      />
    </CollapseSection>
  );
}

function FilterSection({
  filter,
  onChange,
}: {
  filter: Filter | undefined;
  onChange: (f: Filter | undefined) => void;
}): JSX.Element {
  const f: Filter = filter ?? {};
  function patch(key: keyof Filter, v: number): void {
    onChange({ ...f, [key]: v });
  }
  return (
    <CollapseSection title="Filter">
      <NumberField
        label="blur"
        value={f.blur ?? 0}
        step={0.5}
        min={0}
        onCommit={(v) => patch('blur', v)}
        trailing={pointIcon('blur')}
      />
      <NumberField
        label="brightness %"
        value={f.brightness ?? 100}
        step={1}
        min={0}
        onCommit={(v) => patch('brightness', v)}
        trailing={pointIcon('brightness')}
      />
      <NumberField
        label="contrast %"
        value={f.contrast ?? 100}
        step={1}
        min={0}
        onCommit={(v) => patch('contrast', v)}
        trailing={pointIcon('contrast')}
      />
      <NumberField
        label="grayscale %"
        value={f.grayscale ?? 0}
        step={1}
        min={0}
        max={100}
        onCommit={(v) => patch('grayscale', v)}
        trailing={pointIcon('grayscale')}
      />
      <NumberField
        label="hue rotate °"
        value={f.hueRotate ?? 0}
        step={1}
        onCommit={(v) => patch('hueRotate', v)}
        trailing={pointIcon('hue rotate')}
      />
      <NumberField
        label="invert %"
        value={f.invert ?? 0}
        step={1}
        min={0}
        max={100}
        onCommit={(v) => patch('invert', v)}
        trailing={pointIcon('invert')}
      />
      <NumberField
        label="opacity %"
        value={f.opacity ?? 100}
        step={1}
        min={0}
        max={100}
        onCommit={(v) => patch('opacity', v)}
        trailing={pointIcon('filter opacity')}
      />
      <NumberField
        label="saturate %"
        value={f.saturate ?? 100}
        step={1}
        min={0}
        onCommit={(v) => patch('saturate', v)}
        trailing={pointIcon('saturate')}
      />
      <NumberField
        label="sepia %"
        value={f.sepia ?? 0}
        step={1}
        min={0}
        max={100}
        onCommit={(v) => patch('sepia', v)}
        trailing={pointIcon('sepia')}
      />
    </CollapseSection>
  );
}
