import { Button } from '../../ui/Button.js';
import * as s from './PreviewTransport.css.js';

/**
 * D-020 — the preview's transport bar. The four real **playout commands** are
 * SEPARATE, momentary buttons — each is a command the operator can issue, mirroring
 * the on-air CasparCG transport:
 *
 * - **Play** → `play()`, or `resume()` when the composition is paused. It is NOT a
 *   toggle and never stays visually "pressed" after a click.
 * - **Pause** → `pause()` (freezes intro / hold countdown / outro).
 * - **Stop** → `stop()` (runs the outro, then settles off).
 * - **Next** → `next()` (advance a paginated template). Disabled when the
 *   composition has a single step, since there is nothing to advance to.
 *
 * **Reset** is a PREVIEW-ONLY utility (re-seeds the form to defaults), kept visually
 * distinct from the playout commands.
 */
export function PreviewTransport({
  paused,
  canStep,
  onPlay,
  onPause,
  onStop,
  onNext,
  onReset,
}: {
  paused: boolean;
  canStep: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onNext: () => void;
  onReset: () => void;
}): JSX.Element {
  return (
    <div className={s.bar}>
      <span className={s.groupLabel}>Playout commands</span>
      <div className={s.commands} role="group" aria-label="Playout commands">
        <Button variant="primary" className={s.command} onClick={onPlay}>
          {paused ? '▶ Resume' : '▶ Play'}
        </Button>
        <Button className={s.command} onClick={onPause} aria-disabled={paused} disabled={paused}>
          ⏸ Pause
        </Button>
        <Button className={s.command} onClick={onStop}>
          ■ Stop
        </Button>
        <Button
          className={s.command}
          onClick={onNext}
          disabled={!canStep}
          title={canStep ? undefined : 'Single-step template — nothing to advance to'}
        >
          ⏭ Next
        </Button>
      </div>
      <div className={s.utilities}>
        <Button variant="ghost" size="sm" onClick={onReset} title="Re-seed the form to defaults">
          ↺ Reset
        </Button>
      </div>
    </div>
  );
}
