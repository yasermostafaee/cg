import { LayoutGrid, List } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';

export type InputView = 'grid' | 'list';

export function InputViewSwitch({
  view,
  onChange,
  ariaLabel = 'Input view',
}: {
  view: InputView;
  onChange: (view: InputView) => void;
  ariaLabel?: string;
}): JSX.Element {
  return (
    <div className="cg-picker-input-view" role="group" aria-label={ariaLabel}>
      <Button
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
        active={view === 'grid'}
        onClick={() => onChange('grid')}
      >
        <Icon icon={LayoutGrid} size={15} /> Grid
      </Button>
      <Button
        aria-label="List view"
        aria-pressed={view === 'list'}
        active={view === 'list'}
        onClick={() => onChange('list')}
      >
        <Icon icon={List} size={15} /> List
      </Button>
    </div>
  );
}
