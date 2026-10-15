import {
  LogOut,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Select } from '../../ui/Select.js';
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
 * - **Previous** / **Next** → `previous()` / `next()` (step a paginated template or a
 *   book — `D-163`). Disabled when the composition has a single step. They share the
 *   row below the other four, half each, so all six stay inside the panel.
 *
 * **Reset** is a PREVIEW-ONLY utility (re-seeds the form to defaults), kept visually
 * distinct from the playout commands.
 *
 * `D-165` — **Sound** is the other preview-only utility: shown only when the template makes sound,
 * ON by default, and it mutes the page's own runtime (the switch CG Control's PVW keeps OFF).
 */
export function PreviewTransport({
  paused,
  canStep,
  onPlay,
  onPause,
  onOut,
  onStop,
  onPrevious,
  onNext,
  onReset,
  hasSound = false,
  soundMuted = false,
  onToggleSound,
  stepChoices = [],
  clockRate = 1,
  onClockRate,
  forcedStep = '',
  onForceStep,
}: {
  paused: boolean;
  canStep: boolean;
  onPlay: () => void;
  onPause: () => void;
  onOut: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
  /** `D-165` — the template makes sound: the Sound switch is shown. */
  hasSound?: boolean;
  soundMuted?: boolean;
  onToggleSound?: () => void;
  /**
   * DELTA-RUN-NEXT-VERSION-01-A — every step of every countdown with steps, as `{value, label}`
   * (`value` = `<clockId>|<token>`); empty hides the two rehearsal knobs.
   */
  stepChoices?: readonly { value: string; label: string }[];
  /** `D-141` — the rehearsal rate (1 = real time). */
  clockRate?: number;
  onClockRate?: (rate: number) => void;
  /** The step shown whatever the time; `''` = the countdowns decide (live). */
  forcedStep?: string;
  onForceStep?: (value: string) => void;
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
          className={`${s.command} ${s.step}`}
          onClick={onPrevious}
          disabled={!canStep}
          title={canStep ? undefined : 'Single-step template — nothing to go back to'}
        >
          <Icon icon={SkipBack} size={16} />
          Previous
        </Button>
        <Button
          className={`${s.command} ${s.step}`}
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
        {hasSound && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={!soundMuted}
            onClick={onToggleSound}
            data-testid="preview-sound"
          >
            <Icon icon={soundMuted ? VolumeX : Volume2} size={14} />
            {soundMuted ? 'Sound off' : 'Sound on'}
          </Button>
        )}
        {/*
          `D-141` / DELTA-RUN-NEXT-VERSION-01-A — rehearse the steps without waiting an hour: the
          page's clock runs N× faster through the real countdown, or one step is shown — Before, each
          step, At zero — with everything it changes, an instance's own entrance included.
        */}
        {stepChoices.length > 0 && (
          <>
            <Select
              aria-label="Rehearse steps"
              data-testid="preview-step-rate"
              value={String(clockRate)}
              onChange={(e) => onClockRate?.(Number(e.target.value))}
            >
              <option value="1">Real time</option>
              <option value="10">Rehearse ×10</option>
              <option value="60">Rehearse ×60</option>
              <option value="600">Rehearse ×600</option>
            </Select>
            <Select
              aria-label="Show step"
              data-testid="preview-step-force"
              value={forcedStep}
              onChange={(e) => onForceStep?.(e.target.value)}
            >
              <option value="">Step: live</option>
              {stepChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </>
        )}
      </div>
    </div>
  );
}
