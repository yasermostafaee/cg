import type { Element } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { NumberField, NumberPairField } from './controls.js';

interface Props {
  element: Element;
}

/**
 * Transform inspector. The eight M12 animatable properties (position x/y,
 * scale x/y, rotation, size w/h, opacity) flow through `commitAnimatable`
 * so that an edit lands on the keyframe at the current authoring frame when
 * one exists, instead of clobbering the element's static value. Non-
 * animatable controls (z-index) keep their plain mutators.
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
        onCommit={(x, y) => {
          designerStore.commitAnimatable(id, 'position.x', x);
          designerStore.commitAnimatable(id, 'position.y', y);
        }}
      />
      <NumberPairField
        label="size"
        x={t.size.w}
        y={t.size.h}
        onCommit={(w, h) => {
          designerStore.commitAnimatable(id, 'size.w', w);
          designerStore.commitAnimatable(id, 'size.h', h);
        }}
      />
      <NumberField
        label="rotation"
        value={t.rotation}
        step={1}
        onCommit={(rotation) => designerStore.commitAnimatable(id, 'rotation', rotation)}
      />
      <NumberPairField
        label="scale"
        x={t.scale.x}
        y={t.scale.y}
        step={0.1}
        onCommit={(x, y) => {
          designerStore.commitAnimatable(id, 'scale.x', x);
          designerStore.commitAnimatable(id, 'scale.y', y);
        }}
      />
      <NumberField
        label="opacity"
        value={element.opacity}
        step={0.05}
        min={0}
        max={1}
        onCommit={(opacity) => designerStore.commitAnimatable(id, 'opacity', opacity)}
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
