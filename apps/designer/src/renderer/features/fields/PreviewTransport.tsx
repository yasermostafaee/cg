import { LogOut, Pause, Play, RotateCcw, SkipForward, Square } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './PreviewTransport.css.js';

/**
 * D-020 — the preview's transport bar. The four real **playout commands** are
 * SEPARATE, momentary buttons — each is a command the operator can issue, mirroring
 * the on-air CasparCG transport:
 *
 * - **Play** → `play()`, or `resume()` when the composition is paused. It is NOT a
 *   toggle and never stays visually "pressed" after a click.
 * - **Pause** → `pause()` (freezes intro / hold countdown / outro).
 * - **Out** → `out()` (D-105 — the coordinated animated exit: the content exits
 *   first, then the background closes, never closing over fully-visible content).
 * - **Stop** → `stop()` (D-105 — the quick clear: remove the content immediately,
 *   then close the background; settles cleared).
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
  onOut,
  onStop,
  onNext,
  onReset,
}: {
  paused: boolean;
  canStep: boolean;
  onPlay: () => void;
  onPause: () => void;
  onOut: () => void;
  onStop: () => void;
  onNext: () => void;
  onReset: () => void;
}): JSX.Element {
  return (
    <div className={s.bar}>
      <span className={s.groupLabel}>Playout commands</span>
      <div className={s.commands} role="group" aria-label="Playout commands">
        <Button variant="primary" className={s.command} onClick={onPlay}>
          <Icon icon={Play} size={16} />
          {paused ? 'Resume' : 'Play'}
        </Button>
        <Button className={s.command} onClick={onPause} aria-disabled={paused} disabled={paused}>
          <Icon icon={Pause} size={16} />
          Pause
        </Button>
        <Button
          className={s.command}
          onClick={onOut}
          title="Animate out — the content exits first, then the background closes"
        >
          <Icon icon={LogOut} size={16} />
          Out
        </Button>
        <Button
          className={s.command}
          onClick={onStop}
          title="Clear now — remove the content immediately, then close the background"
        >
          <Icon icon={Square} size={16} />
          Stop
        </Button>
        <Button
          className={s.command}
          onClick={onNext}
          disabled={!canStep}
          title={canStep ? undefined : 'Single-step template — nothing to advance to'}
        >
          <Icon icon={SkipForward} size={16} />
          Next
        </Button>
      </div>
      <div className={s.utilities}>
        <Button variant="ghost" size="sm" onClick={onReset} title="Re-seed the form to defaults">
          <Icon icon={RotateCcw} size={14} />
          Reset
        </Button>
      </div>
    </div>
  );
}
