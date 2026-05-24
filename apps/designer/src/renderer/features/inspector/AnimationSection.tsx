import type {
  Easing,
  Element,
  ElementAnimation,
  EntryPreset,
  ExitPreset,
  LoopPreset,
} from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { NumberField, SelectField } from './controls.js';
import { defaultEntry, defaultExit, defaultLoop } from './animation-defaults.js';

interface Props {
  element: Element;
}

const ENTRY_KINDS = ['none', 'fade', 'slide', 'scale', 'blur'] as const;
const EXIT_KINDS = ['none', 'fade-out', 'slide-out', 'scale-down', 'blur-out'] as const;
const LOOP_KINDS = ['none', 'ticker', 'pulse', 'breathing'] as const;
const SLIDE_DIRECTIONS = ['left', 'right', 'up', 'down'] as const;
const TICKER_DIRECTIONS = ['ltr', 'rtl'] as const;
const EASINGS: readonly Easing[] = [
  'linear',
  'power1.in',
  'power1.out',
  'power1.inOut',
  'power2.in',
  'power2.out',
  'power2.inOut',
  'power3.in',
  'power3.out',
  'power3.inOut',
  'back.in',
  'back.out',
  'back.inOut',
  'expo.in',
  'expo.out',
  'expo.inOut',
  'sine.in',
  'sine.out',
  'sine.inOut',
];

/**
 * Animation inspector subsection (Phase 6 §12). Edits the optional
 * `element.animation` sub-tree. Swapping a preset's `kind` discards the
 * old preset's params and seeds new defaults — Zod's discriminated
 * unions don't tolerate partial overlap, so we never carry stale fields.
 */
export function AnimationSection({ element }: Props): JSX.Element {
  const animation: ElementAnimation = element.animation ?? {};

  function commitAnimation(next: ElementAnimation): void {
    designerStore.updateElement(element.id, { animation: next } as Partial<Element>);
  }

  return (
    <>
      <EntryEditor
        preset={animation.entry ?? { kind: 'none' }}
        onCommit={(entry) => commitAnimation({ ...animation, entry })}
      />
      <LoopEditor
        preset={animation.loop ?? { kind: 'none' }}
        onCommit={(loop) => commitAnimation({ ...animation, loop })}
      />
      <ExitEditor
        preset={animation.exit ?? { kind: 'none' }}
        onCommit={(exit) => commitAnimation({ ...animation, exit })}
      />
    </>
  );
}

function EntryEditor({
  preset,
  onCommit,
}: {
  preset: EntryPreset;
  onCommit: (p: EntryPreset) => void;
}): JSX.Element {
  return (
    <>
      <SelectField
        label="entry"
        value={preset.kind}
        options={ENTRY_KINDS}
        onCommit={(kind) => onCommit(defaultEntry(kind))}
      />
      {preset.kind !== 'none' && (
        <>
          <NumberField
            label="duration"
            value={preset.duration}
            step={1}
            min={1}
            onCommit={(duration) => onCommit({ ...preset, duration } as EntryPreset)}
          />
          <NumberField
            label="delay"
            value={preset.delay}
            step={1}
            min={0}
            onCommit={(delay) => onCommit({ ...preset, delay } as EntryPreset)}
          />
          <SelectField
            label="easing"
            value={preset.easing}
            options={EASINGS}
            onCommit={(easing) => onCommit({ ...preset, easing } as EntryPreset)}
          />
        </>
      )}
      {preset.kind === 'slide' && (
        <>
          <SelectField
            label="direction"
            value={preset.direction}
            options={SLIDE_DIRECTIONS}
            onCommit={(direction) => onCommit({ ...preset, direction })}
          />
          <NumberField
            label="distance"
            value={preset.distance}
            step={10}
            onCommit={(distance) => onCommit({ ...preset, distance })}
          />
        </>
      )}
      {preset.kind === 'scale' && (
        <NumberField
          label="from"
          value={preset.from}
          step={0.1}
          min={0}
          onCommit={(from) => onCommit({ ...preset, from })}
        />
      )}
      {preset.kind === 'blur' && (
        <NumberField
          label="from-px"
          value={preset.from}
          step={1}
          min={0}
          onCommit={(from) => onCommit({ ...preset, from })}
        />
      )}
    </>
  );
}

function ExitEditor({
  preset,
  onCommit,
}: {
  preset: ExitPreset;
  onCommit: (p: ExitPreset) => void;
}): JSX.Element {
  return (
    <>
      <SelectField
        label="exit"
        value={preset.kind}
        options={EXIT_KINDS}
        onCommit={(kind) => onCommit(defaultExit(kind))}
      />
      {preset.kind !== 'none' && (
        <>
          <NumberField
            label="duration"
            value={preset.duration}
            step={1}
            min={1}
            onCommit={(duration) => onCommit({ ...preset, duration } as ExitPreset)}
          />
          <NumberField
            label="delay"
            value={preset.delay}
            step={1}
            min={0}
            onCommit={(delay) => onCommit({ ...preset, delay } as ExitPreset)}
          />
          <SelectField
            label="easing"
            value={preset.easing}
            options={EASINGS}
            onCommit={(easing) => onCommit({ ...preset, easing } as ExitPreset)}
          />
        </>
      )}
      {preset.kind === 'slide-out' && (
        <>
          <SelectField
            label="direction"
            value={preset.direction}
            options={SLIDE_DIRECTIONS}
            onCommit={(direction) => onCommit({ ...preset, direction })}
          />
          <NumberField
            label="distance"
            value={preset.distance}
            step={10}
            onCommit={(distance) => onCommit({ ...preset, distance })}
          />
        </>
      )}
      {preset.kind === 'scale-down' && (
        <NumberField
          label="to"
          value={preset.to}
          step={0.1}
          min={0}
          onCommit={(to) => onCommit({ ...preset, to })}
        />
      )}
      {preset.kind === 'blur-out' && (
        <NumberField
          label="to-px"
          value={preset.to}
          step={1}
          min={0}
          onCommit={(to) => onCommit({ ...preset, to })}
        />
      )}
    </>
  );
}

function LoopEditor({
  preset,
  onCommit,
}: {
  preset: LoopPreset;
  onCommit: (p: LoopPreset) => void;
}): JSX.Element {
  return (
    <>
      <SelectField
        label="loop"
        value={preset.kind}
        options={LOOP_KINDS}
        onCommit={(kind) => onCommit(defaultLoop(kind))}
      />
      {preset.kind === 'ticker' && (
        <>
          <NumberField
            label="speed px/s"
            value={preset.speed}
            step={10}
            min={1}
            onCommit={(speed) => onCommit({ ...preset, speed })}
          />
          <SelectField
            label="direction"
            value={preset.direction}
            options={TICKER_DIRECTIONS}
            onCommit={(direction) => onCommit({ ...preset, direction })}
          />
        </>
      )}
      {preset.kind === 'pulse' && (
        <>
          <NumberField
            label="duration"
            value={preset.duration}
            step={1}
            min={1}
            onCommit={(duration) => onCommit({ ...preset, duration })}
          />
          <NumberField
            label="min-opacity"
            value={preset.minOpacity}
            step={0.05}
            min={0}
            max={1}
            onCommit={(minOpacity) => onCommit({ ...preset, minOpacity })}
          />
          <NumberField
            label="max-opacity"
            value={preset.maxOpacity}
            step={0.05}
            min={0}
            max={1}
            onCommit={(maxOpacity) => onCommit({ ...preset, maxOpacity })}
          />
        </>
      )}
      {preset.kind === 'breathing' && (
        <>
          <NumberField
            label="duration"
            value={preset.duration}
            step={1}
            min={1}
            onCommit={(duration) => onCommit({ ...preset, duration })}
          />
          <NumberField
            label="scale-min"
            value={preset.scaleMin}
            step={0.05}
            min={0}
            onCommit={(scaleMin) => onCommit({ ...preset, scaleMin })}
          />
          <NumberField
            label="scale-max"
            value={preset.scaleMax}
            step={0.05}
            min={0}
            onCommit={(scaleMax) => onCommit({ ...preset, scaleMax })}
          />
        </>
      )}
    </>
  );
}
