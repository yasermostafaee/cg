import { useUiText } from '../../i18n/locale.js';
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
  const localizeUi = useUiText();
  const grid = view === 'grid';
  const next = grid ? 'list' : 'grid';
  const action = localizeUi(grid ? 'Switch to list view' : 'Switch to grid view');
  return (
    <div className="cg-picker-input-view" role="group" aria-label={localizeUi(ariaLabel)}>
      <Button aria-label={action} title={action} onClick={() => onChange(next)}>
        <Icon icon={grid ? LayoutGrid : List} size={15} /> {localizeUi(grid ? 'Grid' : 'List')}
      </Button>
    </div>
  );
}
