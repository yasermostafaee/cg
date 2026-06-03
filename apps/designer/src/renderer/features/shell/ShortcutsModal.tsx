import { Fragment, useEffect } from 'react';
import { colors } from '../../theme.js';

interface Props {
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

/** Only shortcuts the app actually implements today. */
const SHORTCUTS: readonly { group: string; items: readonly { keys: string; label: string }[] }[] = [
  {
    group: 'Edit',
    items: [
      { keys: `${MOD} Z`, label: 'Undo' },
      { keys: `${MOD} ⇧ Z  /  ${MOD} Y`, label: 'Redo' },
    ],
  },
  {
    group: 'Timeline',
    items: [
      { keys: 'Del  /  ⌫', label: 'Delete selected keyframe' },
      { keys: 'Double-click point', label: 'Open keyframe inspector' },
      { keys: 'Right-click layer', label: 'Layer menu (color, copy, delete…)' },
    ],
  },
  {
    group: 'Canvas',
    items: [
      { keys: `${MOD} Scroll`, label: 'Zoom canvas / timeline' },
      { keys: 'Drag from ruler', label: 'Add a guide line' },
      { keys: 'Esc', label: 'Cancel / close menu' },
    ],
  },
];

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  modal: {
    width: 'min(440px, 92vw)',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.4rem',
    padding: '1.1rem',
    color: colors.text,
    fontSize: '0.82rem',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.6rem',
  },
  title: { fontSize: '1rem', fontWeight: 700, margin: 0 },
  close: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    padding: '0.15rem 0.5rem',
    cursor: 'pointer',
    fontSize: '0.78rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  groupTh: {
    textAlign: 'left' as const,
    color: colors.textMuted,
    fontSize: '0.66rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '0.7rem 0 0.3rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  actionTd: {
    padding: '0.28rem 0.6rem 0.28rem 0',
    color: colors.text,
    verticalAlign: 'middle' as const,
  },
  keysTd: {
    padding: '0.28rem 0',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
    verticalAlign: 'middle' as const,
  },
  keys: {
    color: colors.text,
    fontVariantNumeric: 'tabular-nums' as const,
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    padding: '0.1rem 0.4rem',
    fontSize: '0.74rem',
    whiteSpace: 'nowrap' as const,
  },
} as const;

/** Help → Keyboard Shortcuts. Lists the shortcuts the app implements. */
export function ShortcutsModal({ onClose }: Props): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={styles.backdrop}
      onPointerDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div style={styles.modal} onPointerDown={(e) => e.stopPropagation()}>
        <div style={styles.titleRow}>
          <h2 style={styles.title}>Keyboard shortcuts</h2>
          <button type="button" style={styles.close} onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <table style={styles.table}>
          <tbody>
            {SHORTCUTS.map((section) => (
              <Fragment key={section.group}>
                <tr>
                  <th colSpan={2} style={styles.groupTh}>
                    {section.group.toUpperCase()}
                  </th>
                </tr>
                {section.items.map((it) => (
                  <tr key={it.label}>
                    <td style={styles.actionTd}>{it.label}</td>
                    <td style={styles.keysTd}>
                      <span style={styles.keys}>{it.keys}</span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
