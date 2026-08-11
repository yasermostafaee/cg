import type { Scene } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import * as s from './BackgroundControl.css.js';

interface Props {
  editorBackdrop: Scene['editorBackdrop'];
  /** Compact = canvas-header style; full = inspector-row style. */
  variant?: 'compact' | 'full';
}

/**
 * Always-on EDITOR BACKDROP picker. Renders as a small chip with a "transparent"
 * toggle and a colour swatch; selecting a colour replaces `scene.editorBackdrop`
 * and the iframe picks it up through the existing scene-replace pipeline (no flash).
 *
 * 🔴 **B-129 — this is an EDITOR affordance and does NOT reach air.** It used to be
 * called "background" and it painted on air, so a lower-third could go out as a
 * full-frame card over live video. The control now says so, because the editor
 * looked identical either way and nothing told the author. To paint a background on
 * air, place a full-frame rectangle — a real element, which renders unchanged.
 */
export function BackgroundControl({ editorBackdrop, variant = 'compact' }: Props): JSX.Element {
  const isTransparent = editorBackdrop === 'transparent';
  const swatchColor = isTransparent ? '#FFFFFF' : editorBackdrop;

  function setColor(hex: string): void {
    designerStore.updateScene({ editorBackdrop: normaliseHex(hex) });
  }

  function setTransparent(): void {
    designerStore.updateScene({ editorBackdrop: 'transparent' });
  }

  const controls = (
    <>
      <Button
        variant="bare"
        className={cx(s.toggle, isTransparent && s.toggleActive)}
        onClick={() => setTransparent()}
        title="Set the editor backdrop to transparent (the backdrop never reaches air)"
        aria-pressed={isTransparent}
      >
        TR
      </Button>
      <span
        className={cx(s.swatchButton, isTransparent && s.transparentChip)}
        style={isTransparent ? undefined : { background: swatchColor }}
        title="Editor backdrop colour — a viewing aid only; it is never rendered to air"
      >
        <input
          type="color"
          value={isTransparent ? '#000000' : editorBackdrop}
          onChange={(e) => setColor(e.target.value)}
          className={s.colorInput}
          aria-label="Editor backdrop colour (editor only — does not reach air)"
        />
      </span>
      {!isTransparent && variant === 'full' && (
        <input
          type="text"
          value={editorBackdrop}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) setColor(v);
          }}
          className={s.hexInput}
          aria-label="Editor backdrop hex (editor only — does not reach air)"
        />
      )}
    </>
  );

  if (variant === 'full') {
    return (
      <div className={s.fullRow}>
        <span className={s.label} title="Editor only — never rendered to air">
          editor backdrop
        </span>
        <div className={s.controlsRow}>{controls}</div>
      </div>
    );
  }

  return (
    <div
      className={s.compactWrap}
      aria-label="Editor backdrop (editor only — does not reach air)"
      title="Editor backdrop — a viewing aid. It is never rendered to air; to paint a background on air, place a full-frame rectangle."
    >
      <span>bg</span>
      {controls}
    </div>
  );
}

function normaliseHex(hex: string): string {
  if (!hex.startsWith('#')) return `#${hex.toUpperCase()}`;
  return hex.toUpperCase();
}
