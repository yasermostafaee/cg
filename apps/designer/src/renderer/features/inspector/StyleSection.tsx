import type { Element, ShapeElement, TextElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { ColorField, NumberField, SelectField, TextField } from './controls.js';

interface Props {
  element: Element;
}

/**
 * Type-specific style inspector. Each element type gets its own
 * subsection — only the active type's fields render. Animation +
 * binding sections arrive with M7.
 */
export function StyleSection({ element }: Props): JSX.Element {
  if (element.type === 'text') return <TextStyle element={element} />;
  if (element.type === 'shape') return <ShapeStyle element={element} />;
  if (element.type === 'image') {
    return (
      <>
        <SelectField
          label="fit"
          value={element.fit}
          options={['contain', 'cover', 'fill', 'none'] as const}
          onCommit={(fit) => designerStore.updateElement(element.id, { fit } as Partial<Element>)}
        />
      </>
    );
  }
  return <></>;
}

function TextStyle({ element }: { element: TextElement }): JSX.Element {
  const id = element.id;
  return (
    <>
      <TextField
        label="text"
        value={element.text}
        onCommit={(text) => designerStore.updateElement(id, { text } as Partial<Element>)}
      />
      <TextField
        label="font"
        value={element.font.family}
        onCommit={(family) =>
          designerStore.updateElement(id, {
            font: { ...element.font, family },
          } as Partial<Element>)
        }
      />
      <NumberField
        label="size"
        value={element.font.size}
        step={1}
        min={1}
        onCommit={(size) =>
          designerStore.updateElement(id, {
            font: { ...element.font, size },
          } as Partial<Element>)
        }
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
      />
      <NumberField
        label="letter spacing"
        value={element.font.letterSpacing}
        step={0.1}
        onCommit={(letterSpacing) =>
          designerStore.updateElement(id, {
            font: { ...element.font, letterSpacing },
          } as Partial<Element>)
        }
      />
      <ColorField
        label="color"
        value={element.color}
        onCommit={(color) => designerStore.updateElement(id, { color } as Partial<Element>)}
      />
      <SelectField
        label="align"
        value={element.align}
        options={['start', 'center', 'end', 'justify'] as const}
        onCommit={(align) => designerStore.updateElement(id, { align } as Partial<Element>)}
      />
      <SelectField
        label="direction"
        value={element.direction}
        options={['auto', 'ltr', 'rtl'] as const}
        onCommit={(direction) => designerStore.updateElement(id, { direction } as Partial<Element>)}
      />
    </>
  );
}

function ShapeStyle({ element }: { element: ShapeElement }): JSX.Element {
  const id = element.id;
  const fillColor =
    element.fill !== undefined && element.fill.kind === 'solid' ? element.fill.color : '#000000';
  const strokeColor = element.stroke?.color ?? '#000000';
  const strokeWidth = element.stroke?.width ?? 0;
  const cornerRadius =
    typeof element.cornerRadius === 'number'
      ? element.cornerRadius
      : Array.isArray(element.cornerRadius)
        ? element.cornerRadius[0]
        : 0;
  return (
    <>
      <SelectField
        label="shape"
        value={element.shape}
        options={['rect', 'rounded-rect', 'ellipse'] as const}
        onCommit={(shape) =>
          designerStore.updateElement(id, { shape } as unknown as Partial<Element>)
        }
      />
      <ColorField
        label="fill"
        value={fillColor}
        onCommit={(color) =>
          designerStore.updateElement(id, {
            fill: { kind: 'solid', color },
          } as Partial<Element>)
        }
      />
      <ColorField
        label="stroke"
        value={strokeColor}
        onCommit={(color) =>
          designerStore.updateElement(id, {
            stroke: { ...(element.stroke ?? { width: 0 }), color },
          } as Partial<Element>)
        }
      />
      <NumberField
        label="stroke width"
        value={strokeWidth}
        step={1}
        min={0}
        onCommit={(width) =>
          designerStore.updateElement(id, {
            stroke: {
              ...(element.stroke ?? { color: strokeColor }),
              width,
            },
          } as Partial<Element>)
        }
      />
      <NumberField
        label="border radius"
        value={cornerRadius}
        step={1}
        min={0}
        onCommit={(radius) =>
          designerStore.updateElement(id, {
            cornerRadius: radius,
            // When the radius becomes non-zero, also widen the shape
            // to 'rounded-rect' so the runtime renders the curve.
            shape: radius > 0 && element.shape === 'rect' ? 'rounded-rect' : element.shape,
          } as unknown as Partial<Element>)
        }
      />
    </>
  );
}
