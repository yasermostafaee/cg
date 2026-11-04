import {
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
 * D-020 / D-173 — the preview's transport bar. The real **playout commands** are
 * SEPARATE, momentary buttons — each is a command the operator can issue, mirroring
 * the on-air CasparCG transport:
 *
 * - **Play** → `play()`, or `resume()` when the composition is paused. It is NOT a
 *   toggle and never stays visually "pressed" after a click.
 * - **Pause** → `pause()` (freezes intro / hold countdown / outro).
 * - **Stop** → `stop()` (D-105 — the quick clear: remove the content immediately,
 *   then close the background; settles cleared).
 * - **Previous** / **Next** → `previous()` / `next()` (step a paginated template or a
 *   book — `D-163`). Disabled when the composition has a single step. They share the
 *   row below the three primary commands, half each, so all five stay inside the panel.
 *
 * **Reset** is a PREVIEW-ONLY utility (re-seeds the form to defaults), kept visually
 * distinct from the playout commands.
 *
 * `D-165` — **Sound** is the other preview-only utility: shown only when the template makes sound,
 * ON by default, and it mutes the page's own runtime (the switch CG Control's PVW keeps OFF).
 */
export function PreviewTransport({
  ready,
  lookChoices = [],
  activeLookId = '',
  onLookChange,
  paused,
  canStep,
  onPlay,
  onPause,
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
  /** Only the currently mounted preview document can unlock its playout commands. */
  ready: boolean;
  /** D-196 — session-only Preset choices for a multi-frame Preview. */
  lookChoices?: readonly { value: string; label: string }[];
  activeLookId?: string;
  onLookChange?: (lookId: string) => void;
  paused: boolean;
  canStep: boolean;
  onPlay: () => void;
  onPause: () => void;
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
      <div className={s.commands} role="group" aria-label="Playout commands">
        <Button
          className={s.command}
          onClick={onPlay}
          disabled={!ready}
          title={ready ? undefined : 'Preview loading'}
        >
          <Icon icon={Play} size={16} />
          {paused ? 'Resume' : 'Play'}
        </Button>
        <Button
          className={s.command}
          onClick={onPause}
          aria-disabled={!ready || paused}
          disabled={!ready || paused}
          title={ready ? undefined : 'Preview loading'}
        >
          <Icon icon={Pause} size={16} />
          Pause
        </Button>
        <Button
          className={s.command}
          onClick={onStop}
          disabled={!ready}
          title={ready ? 'Stop and clear' : 'Preview loading'}
        >
          <Icon icon={Square} size={16} />
          Stop
        </Button>
        <Button
          className={`${s.command} ${s.step}`}
          onClick={onPrevious}
          disabled={!ready || !canStep}
          title={!ready ? 'Preview loading' : canStep ? undefined : 'No previous item'}
        >
          <Icon icon={SkipBack} size={16} />
          Previous
        </Button>
        <Button
          className={`${s.command} ${s.step}`}
          onClick={onNext}
          disabled={!ready || !canStep}
          title={!ready ? 'Preview loading' : canStep ? undefined : 'No next item'}
        >
          <Icon icon={SkipForward} size={16} />
          Next
        </Button>
      </div>
      <div className={s.utilities}>
        <Button variant="ghost" size="sm" onClick={onReset} title="Reset preview values">
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
              title="Each Play starts the accelerated rehearsal from the current real time. Past deadlines stay past."
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
      {lookChoices.length > 0 && (
        <div className={s.lookControl} role="group" aria-label="Preview preset">
          <span className={s.lookLabel}>Preset</span>
          <div className={s.lookStrip}>
            {lookChoices.map((look) => {
              const selected = look.value === activeLookId;
              return (
                <Button
                  key={look.value}
                  className={s.lookButton}
                  selected={selected}
                  aria-pressed={selected}
                  title={look.label}
                  onClick={() => onLookChange?.(look.value)}
                >
                  {look.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** D-173/D-182 — large, stable status strip directly above the Preview picture. */
export function PreviewStatus({
  compositionName,
  elapsedMs,
  currentFrame,
  totalFrames,
}: {
  compositionName: string;
  elapsedMs: number;
  currentFrame: number;
  totalFrames: number;
}): JSX.Element {
  return (
    <div className={s.statusRow}>
      <div className={s.compositionIdentity}>
        <span className={s.groupLabel}>Composition</span>
        <strong aria-label="Active composition" title={compositionName}>
          {compositionName || 'Untitled composition'}
        </strong>
      </div>
      <div className={s.statusMetrics}>
        <output className={s.frameStatus} aria-label="Preview frame">
          <span>Frame</span>
          <strong>{formatFrameCounter(currentFrame, totalFrames)}</strong>
        </output>
        <output
          className={s.elapsed}
          aria-label="Elapsed preview time"
          title="Elapsed time (minutes:seconds:hundredths)"
        >
          <span>Elapsed</span>
          <strong>{formatElapsed(elapsedMs)}</strong>
        </output>
      </div>
    </div>
  );
}

/** D-173 — compact, stable rehearsal time; hours appear only when they are needed. */
export function formatElapsed(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const hundredths = Math.floor((safe % 1000) / 10);
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const body = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(hundredths).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${body}` : body;
}

/** Keep both frame columns fixed-width, including the 9 → 10 transition. */
export function formatFrameCounter(currentFrame: number, totalFrames: number): string {
  const current = Math.max(0, Math.round(currentFrame));
  const total = Math.max(0, Math.round(totalFrames));
  const width = Math.max(2, String(total).length);
  return `${String(current).padStart(width, '0')} / ${String(total).padStart(width, '0')}`;
}
