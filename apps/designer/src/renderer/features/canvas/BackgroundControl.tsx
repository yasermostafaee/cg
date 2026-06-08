import type { Scene } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import * as s from './BackgroundControl.css.js';

interface Props {
  background: Scene['background'];
  /** Compact = canvas-header style; full = inspector-row style. */
  variant?: 'compact' | 'full';
}

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

  const controls = (
    <>
      <Button
        variant="bare"
        className={cx(s.toggle, isTransparent && s.toggleActive)}
        onClick={() => setTransparent()}
        title="Set the scene background to transparent"
        aria-pressed={isTransparent}
      >
        TR
      </Button>
      <span
        className={cx(s.swatchButton, isTransparent && s.transparentChip)}
        style={isTransparent ? undefined : { background: swatchColor }}
        title="Click to pick a colour"
      >
        <input
          type="color"
          value={isTransparent ? '#000000' : background}
          onChange={(e) => setColor(e.target.value)}
          className={s.colorInput}
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
          className={s.hexInput}
          aria-label="Background hex"
        />
      )}
    </>
  );

  if (variant === 'full') {
    return (
      <div className={s.fullRow}>
        <span className={s.label}>background</span>
        <div className={s.controlsRow}>{controls}</div>
      </div>
    );
  }

  return (
    <div className={s.compactWrap} aria-label="Scene background">
      <span>bg</span>
      {controls}
    </div>
  );
}

function normaliseHex(hex: string): string {
  if (!hex.startsWith('#')) return `#${hex.toUpperCase()}`;
  return hex.toUpperCase();
}
