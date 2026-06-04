import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  background: Scene['background'];
  /** Compact = canvas-header style; full = inspector-row style. */
  variant?: 'compact' | 'full';
}

const styles = {
  compactWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    fontSize: '0.7rem',
    color: colors.textMuted,
  },
  fullRow: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    gap: '0.4rem',
    alignItems: 'center',
    padding: '0.15rem 0',
    fontSize: '0.72rem',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem' },
  swatchButton: {
    width: 22,
    height: 22,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: 0,
    cursor: 'pointer',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  transparentChip: {
    backgroundImage:
      'linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%, #888),' +
      'linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%, #888)',
    backgroundSize: '8px 8px',
    backgroundPosition: '0 0, 4px 4px',
    backgroundColor: '#fff',
  },
  colorInput: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    background: 'transparent',
  },
  toggle: {
    background: colors.panelMuted,
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.12rem 0.4rem',
    fontSize: '0.66rem',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  toggleActive: {
    background: colors.accent,
    color: '#000',
    border: `1px solid ${colors.accentMuted}`,
    fontWeight: 700,
  },
  hexInput: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.15rem 0.35rem',
    fontSize: '0.7rem',
    width: 76,
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
} as const;

/**
 * Always-on scene background picker. Renders as a small chip with a
 * "transparent" toggle and a colour swatch. When the operator clicks
 * the swatch a native colour picker opens; selecting a colour replaces
 * `scene.background` and the iframe picks it up through the existing
 * scene-replace pipeline (no flash).
 */
export function BackgroundControl({ background, variant = 'compact' }: Props): JSX.Element {
  const isTransparent = background === 'transparent';
  const swatchColor = isTransparent ? '#FFFFFF' : background;

  function setColor(hex: string): void {
    designerStore.updateScene({ background: normaliseHex(hex) });
  }

  function setTransparent(): void {
    designerStore.updateScene({ background: 'transparent' });
  }

  const swatchStyle = {
    ...styles.swatchButton,
    ...(isTransparent ? styles.transparentChip : { background: swatchColor }),
  };

  const controls = (
    <>
      <button
        type="button"
        style={isTransparent ? { ...styles.toggle, ...styles.toggleActive } : styles.toggle}
        onClick={() => setTransparent()}
        title="Set the scene background to transparent"
        aria-pressed={isTransparent}
      >
        TR
      </button>
      <span style={swatchStyle} title="Click to pick a colour">
        <input
          type="color"
          value={isTransparent ? '#000000' : background}
          onChange={(e) => setColor(e.target.value)}
          style={styles.colorInput}
          aria-label="Scene background colour"
        />
      </span>
      {!isTransparent && variant === 'full' && (
        <input
          type="text"
          value={background}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) setColor(v);
          }}
          style={styles.hexInput}
          aria-label="Background hex"
        />
      )}
    </>
  );

  if (variant === 'full') {
    return (
      <div style={styles.fullRow}>
        <span style={styles.label}>background</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{controls}</div>
      </div>
    );
  }

  return (
    <div style={styles.compactWrap} aria-label="Scene background">
      <span>bg</span>
      {controls}
    </div>
  );
}

function normaliseHex(hex: string): string {
  if (!hex.startsWith('#')) return `#${hex.toUpperCase()}`;
  return hex.toUpperCase();
}
