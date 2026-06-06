import { Modal } from './Modal.js';
import * as s from './ShortcutsModal.css.js';

interface Props {
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

/**
 * Only shortcuts the app actually implements today. Keep this in sync whenever a
 * shortcut is added/changed (see the keydown handlers in TopToolbar / App /
 * TimelineDock).
 */
const SHORTCUTS: readonly { keys: string; label: string }[] = [
  { keys: `${MOD} + Z`, label: 'Undo' },
  { keys: `${MOD} + Shift + Z`, label: 'Redo' },
  { keys: `${MOD} + Y`, label: 'Redo (alternate)' },
  { keys: 'L', label: 'Play animation forward' },
  { keys: 'J', label: 'Play animation backward' },
  { keys: 'K', label: 'Stop animation' },
  { keys: 'K + L', label: 'Go to next frame' },
  { keys: 'K + J', label: 'Go to previous frame' },
  { keys: 'Delete / Backspace', label: 'Delete selected keyframe' },
  { keys: 'Double-click point', label: 'Open keyframe inspector' },
  { keys: 'Right-click layer', label: 'Layer menu (color, copy, delete…)' },
  { keys: `${MOD} + Scroll`, label: 'Zoom canvas / timeline' },
  { keys: 'R', label: 'Toggle canvas rulers' },
  { keys: 'Drag from ruler', label: 'Add a guide line' },
  { keys: 'Esc', label: 'Deselect · cancel · close menu' },
];

/** Help → Keyboard Shortcuts. Lists the shortcuts the app implements. */
export function ShortcutsModal({ onClose }: Props): JSX.Element {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} width="min(460px, 92vw)">
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.headTh}>KEY COMBINATION</th>
            <th className={s.headTh}>FUNCTION</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((sc, i) => (
            <tr key={sc.label} className={i % 2 === 1 ? s.rowAlt : undefined}>
              <td className={s.keysTd}>{sc.keys}</td>
              <td className={s.fnTd}>{sc.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
