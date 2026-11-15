import type { ClockElement, SequenceElement, TextElement, TickerElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { NumberField } from './controls.js';

export function TextVerticalOffsetField({
  element,
}: {
  element: TextElement | TickerElement | ClockElement | SequenceElement;
}): JSX.Element {
  const unavailable = element.type === 'text' && element.fitMode === 'autosize';
  return (
    <NumberField
      label="Text vertical offset"
      value={element.textOffsetY ?? 0}
      step={1}
      suffix="px"
      withheld={unavailable ? 'Choose Fixed sizing to move text within its box.' : undefined}
      onCommitBoundary={designerStore.markHistoryBoundary}
      onCommit={(value) => {
        if (!unavailable) {
          designerStore.updateElement(element.id, { textOffsetY: value === 0 ? undefined : value });
        }
      }}
    />
  );
}
