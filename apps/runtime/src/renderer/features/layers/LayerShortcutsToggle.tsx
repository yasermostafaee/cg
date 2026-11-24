import { useUiText } from '../../i18n/locale.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { useLayerShortcutSession } from './layerShortcutSession.js';

export function LayerShortcutsToggle(): JSX.Element | null {
  const localizeUi = useUiText();
  const session = useLayerShortcutSession();
  if (session === null) return null;
  const title = localizeUi(session.enabled ? 'Disable layer shortcuts' : 'Enable layer shortcuts');
  return (
    <label className="cg-layer-shortcuts-toggle" title={title}>
      <span className="cg-switch">
        <Checkbox
          role="switch"
          checked={session.enabled}
          onChange={session.setEnabled}
          aria-label={localizeUi('Layer shortcuts')}
        />
        <span className="cg-switch__track" aria-hidden="true" />
      </span>
      <span>{localizeUi('Layer shortcuts')}</span>
    </label>
  );
}
