import {
  EASING_PRESETS,
  type BezierEasing,
  type Element as SceneElement,
  type Keyframe,
  type Scene,
} from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, type KeyframeRef } from '../../state/store.js';
import { TIMELINE_ROWS } from '../timeline/keyframe-helpers.js';
import { NumberField } from './controls.js';
import { EasingEditor } from './EasingEditor.js';
import * as s from './KeyframeInspector.css.js';

interface Props {
  scene: Scene;
  selectedKeyframes: readonly KeyframeRef[];
}

/**
 * The bézier to show in the easing editor: the keyframe's custom curve when set,
 * otherwise the preset matching its named easing (step falls back to linear).
 */
function effectiveBezier(keyframe: Keyframe): BezierEasing {
  if (keyframe.bezier !== undefined) return keyframe.bezier;
  return EASING_PRESETS[keyframe.easing] ?? EASING_PRESETS.linear ?? [0, 0, 1, 1];
}

function bezierApproxEqual(a: BezierEasing, b: BezierEasing): boolean {
  return a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 0.005);
}

function BackButton(): JSX.Element {
  return (
    <button
      type="button"
      className={s.closeButton}
      onClick={() => designerStore.closeKeyframeInspector()}
      aria-label="Back to element inspector"
    >
      ← back
    </button>
  );
}

/**
 * Right-side inspector for the selected keyframe(s). One selected point shows
 * its element / property / frame / value plus the easing editor; several
 * selected points show only the shared easing editor (batch-applied) and a
 * "Remove keyframes" button.
 */
export function KeyframeInspector({ scene, selectedKeyframes }: Props): JSX.Element {
  if (selectedKeyframes.length > 1) {
    return <MultiKeyframeView scene={scene} refs={selectedKeyframes} />;
  }
  const selectedKeyframe = selectedKeyframes[0];
  if (selectedKeyframe === undefined) {
    return (
      <aside className={s.panel} aria-label="Inspector" data-keyframe-inspector>
        <div className={s.topRow}>
          <h2 className={s.headingFirst}>KEYFRAME</h2>
          <BackButton />
        </div>
      </aside>
    );
  }
  const { elementId, property, frame } = selectedKeyframe;
  const element = findElement(scene, elementId);
  const keyframe = element?.animation?.tracks[property]?.keyframes.find((k) => k.frame === frame);
  const rowLabel =
    TIMELINE_ROWS.find((r) => r.property === property)?.label ?? (property as string);

  if (element === null || keyframe === undefined) {
    return (
      <aside className={s.panel} aria-label="Inspector" data-keyframe-inspector>
        <div className={s.topRow}>
          <h2 className={s.headingFirst}>KEYFRAME</h2>
          <BackButton />
        </div>
        <p style={{ color: colors.textMuted, fontSize: '0.74rem' }}>
          The selected keyframe is no longer available.
        </p>
      </aside>
    );
  }

  return (
    <aside className={s.panel} aria-label="Inspector" data-keyframe-inspector>
      <div className={s.topRow}>
        <h2 className={s.headingFirst}>KEYFRAME — {rowLabel.toUpperCase()}</h2>
        <BackButton />
      </div>
      <StaticRow label="element" value={element.name} />
      <StaticRow label="property" value={property} />
      <h3 className={s.heading}>POINT</h3>
      <NumberField
        label="frame"
        value={keyframe.frame}
        step={1}
        min={scene.frameRange.in}
        max={scene.frameRange.out}
        onCommit={(nextFrame) => {
          const clamped = Math.max(
            scene.frameRange.in,
            Math.min(scene.frameRange.out, Math.round(nextFrame)),
          );
          if (clamped === frame) return;
          designerStore.moveKeyframe(elementId, property, frame, clamped);
        }}
      />
      <KeyframeValueField
        keyframe={keyframe}
        onCommit={(value) => designerStore.setKeyframeValue(elementId, property, frame, value)}
      />
      <EasingEditor
        bezier={effectiveBezier(keyframe)}
        onChange={(b) => designerStore.setKeyframeBezier(elementId, property, frame, b)}
      />
      <button
        type="button"
        className={s.removeButton}
        onClick={() => designerStore.removeKeyframe(elementId, property, frame)}
      >
        Remove keyframe
      </button>
    </aside>
  );
}

function KeyframeValueField({
  keyframe,
  onCommit,
}: {
  keyframe: Keyframe;
  onCommit: (value: number) => void;
}): JSX.Element {
  if (typeof keyframe.value === 'number') {
    return <NumberField label="value" value={keyframe.value} step={1} onCommit={onCommit} />;
  }
  // Color keyframes — not exposed in the v1 dock but render read-only.
  return (
    <div className={s.row}>
      <span className={s.label}>value</span>
      <span className={s.value}>{keyframe.value}</span>
    </div>
  );
}

function StaticRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className={s.row}>
      <span className={s.label}>{label}</span>
      <span className={s.value}>{value}</span>
    </div>
  );
}

/** Multi-select view: only the shared easing editor + "Remove keyframes". */
function MultiKeyframeView({
  scene,
  refs,
}: {
  scene: Scene;
  refs: readonly KeyframeRef[];
}): JSX.Element {
  const beziers = refs
    .map((r) => findKeyframe(scene, r))
    .filter((k): k is Keyframe => k !== undefined)
    .map(effectiveBezier);
  const firstBezier = beziers[0] ?? EASING_PRESETS.linear ?? [0, 0, 1, 1];
  const mixed = beziers.some((b) => !bezierApproxEqual(b, firstBezier));
  // When the selected points disagree, show a neutral straight line so the
  // editor doesn't imply one of them is "the" curve.
  const NEUTRAL: BezierEasing = [0.25, 0.25, 0.75, 0.75];
  const bezier = mixed ? NEUTRAL : firstBezier;

  return (
    <aside className={s.panel} aria-label="Inspector" data-keyframe-inspector>
      <div className={s.topRow}>
        <h2 className={s.headingFirst}>KEYFRAMES — {refs.length} SELECTED</h2>
        <BackButton />
      </div>
      {mixed && (
        <div className={s.mixedWarn} role="status">
          <span aria-hidden>⚠</span>
          <span>There are multiple different easings selected</span>
        </div>
      )}
      <p style={{ color: colors.textMuted, fontSize: '0.72rem', margin: '0.1rem 0 0' }}>
        Easing applies to all selected points.
      </p>
      <EasingEditor
        bezier={bezier}
        onChange={(b) => {
          for (const r of refs)
            designerStore.setKeyframeBezier(r.elementId, r.property, r.frame, b);
        }}
      />
      <button
        type="button"
        className={s.removeButton}
        onClick={() => {
          for (const r of [...refs]) designerStore.removeKeyframe(r.elementId, r.property, r.frame);
        }}
      >
        Remove keyframes
      </button>
    </aside>
  );
}

function findKeyframe(scene: Scene, ref: KeyframeRef): Keyframe | undefined {
  const el = findElement(scene, ref.elementId);
  return el?.animation?.tracks[ref.property]?.keyframes.find((k) => k.frame === ref.frame);
}

function findElement(scene: Scene, elementId: string): SceneElement | null {
  for (const layer of scene.layers) {
    for (const el of layer.children) {
      if (el.id === elementId) return el;
    }
  }
  return null;
}
