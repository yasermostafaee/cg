import type { Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { NumberField, NumberPairField } from './controls.js';

interface Props {
  element: Element;
}

/**
 * Transform inspector — mutates `element.transform` via the store's
 * `updateTransform` shortcut. Position + size are pixel-precise; the
 * Gizmo (M6.4) provides drag handles for the same data.
 */
export function TransformSection({ element }: Props): JSX.Element {
  const t = element.transform;
  const id = element.id;
  return (
    <>
      <NumberPairField
        label="position"
        x={t.position.x}
        y={t.position.y}
        onCommit={(x, y) => designerStore.updateTransform(id, { position: { x, y } })}
      />
      <NumberPairField
        label="size"
        x={t.size.w}
        y={t.size.h}
        onCommit={(w, h) => designerStore.updateTransform(id, { size: { w, h } })}
      />
      <NumberField
        label="rotation"
        value={t.rotation}
        step={1}
        onCommit={(rotation) => designerStore.updateTransform(id, { rotation })}
      />
      <NumberPairField
        label="scale"
        x={t.scale.x}
        y={t.scale.y}
        step={0.1}
        onCommit={(x, y) => designerStore.updateTransform(id, { scale: { x, y } })}
      />
      <NumberField
        label="opacity"
        value={element.opacity}
        step={0.05}
        min={0}
        max={1}
        onCommit={(opacity) => designerStore.updateElement(id, { opacity } as Partial<Element>)}
      />
      <NumberField
        label="z-index"
        value={element.zIndex}
        step={1}
        onCommit={(zIndex) => designerStore.updateElement(id, { zIndex } as Partial<Element>)}
      />
    </>
  );
}
