import type { SourceDefinition } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';

const PLACEHOLDER_DESCRIPTION = 'Picture placeholder. Input signal status is unknown.';

/** The future picture slot also opens the existing single-input check where supported. */
export function InputThumbnail({
  source,
  onCheck,
}: {
  source: SourceDefinition;
  onCheck?: ((source: SourceDefinition) => void) | undefined;
}): JSX.Element {
  if (onCheck === undefined) {
    return (
      <span
        className="cg-input-thumbnail"
        data-input-thumbnail="passive"
        role="img"
        aria-label={PLACEHOLDER_DESCRIPTION}
        title={PLACEHOLDER_DESCRIPTION}
      >
        No signal
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      className="cg-input-thumbnail"
      data-input-thumbnail="checkable"
      aria-label={`Check input · ${source.name}`}
      title={`${PLACEHOLDER_DESCRIPTION} Select to check this input.`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      onClick={() => onCheck(source)}
    >
      No signal
    </Button>
  );
}
