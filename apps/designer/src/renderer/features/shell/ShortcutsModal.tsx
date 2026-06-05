import { colors } from '../../theme.js';
import { Modal } from './Modal.js';

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

const styles = {
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  headTh: {
    textAlign: 'left' as const,
    color: colors.accent,
    fontSize: '0.64rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    padding: '0.35rem 0.6rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  keysTd: {
    padding: '0.42rem 0.6rem',
    color: colors.text,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
    width: '45%',
  },
  fnTd: {
    padding: '0.42rem 0.6rem',
    color: colors.textMuted,
  },
  rowAlt: {
    background: 'rgba(255,255,255,0.035)',
  },
} as const;

/** Help → Keyboard Shortcuts. Lists the shortcuts the app implements. */
export function ShortcutsModal({ onClose }: Props): JSX.Element {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} width="min(460px, 92vw)">
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.headTh}>KEY COMBINATION</th>
            <th style={styles.headTh}>FUNCTION</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s, i) => (
            <tr key={s.label} style={i % 2 === 1 ? styles.rowAlt : undefined}>
              <td style={styles.keysTd}>{s.keys}</td>
              <td style={styles.fnTd}>{s.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
