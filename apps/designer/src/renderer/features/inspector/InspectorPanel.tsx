import type { AnimatableProperty, Element, FieldBinding, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { BackgroundControl } from '../canvas/BackgroundControl.js';
import { describeBinding, elementNameResolver } from '../fields/bind-resolver.js';
import { FieldsPanel } from '../fields/FieldsPanel.js';
import { CollapseSection } from './CollapseSection.js';
import { RealtimeNumberInput } from './controls.js';
import { DynamicDataSection } from './DynamicDataSection.js';
import { KeyframeInspector } from './KeyframeInspector.js';
import { PlayoutSection } from './PlayoutSection.js';
import { StyleSection } from './StyleSection.js';
import { TransformSection } from './TransformSection.js';
import * as s from './InspectorPanel.css.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
  selection: ReadonlySet<string>;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  selectedKeyframes: readonly {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  }[];
  keyframeInspectorOpen: boolean;
}

/**
 * Right-pane Inspector. When an element is selected, shows Transform +
 * Style sections that mutate the store. When nothing's selected, shows
 * scene metadata.
 */
export function InspectorPanel({
  scene,
  projectPath,
  selection,
  selectedKeyframe,
  selectedKeyframes,
  keyframeInspectorOpen,
}: Props): JSX.Element {
  if (scene === null) {
    return (
      <aside className={s.panel} aria-label="Inspector">
        <h2 className={s.headingFirst}>INSPECTOR</h2>
        <p className={s.empty}>No project selected.</p>
      </aside>
    );
  }

  // Clicking a timeline point (or segment) opens the Keyframe Inspector for the
  // selection — one point shows all per-point fields; several show just the
  // shared easing editor.
  if (keyframeInspectorOpen && selectedKeyframes.length > 0) {
    return <KeyframeInspector scene={scene} selectedKeyframes={selectedKeyframes} />;
  }

  const selected = findSelected(scene, selection);
  if (selected === null) {
    return <SceneInspector scene={scene} projectPath={projectPath} />;
  }
  return <ElementInspector element={selected} scene={scene} selectedKeyframe={selectedKeyframe} />;
}

function SceneInspector({
  scene,
  projectPath,
}: {
  scene: Scene;
  projectPath: string | null;
}): JSX.Element {
  const bindModeFieldId = useDesignerSelector((s) => s.bindModeFieldId);
  return (
    <aside className={s.panel} aria-label="Inspector">
      <h2 className={s.headingFirst}>COMPOSITION</h2>
      <NameRow name={scene.name} />
      <SizeRow scene={scene} />
      <DurationRow scene={scene} />
      <FrameRateRow scene={scene} />
      <Row label="elements" value={String(countElements(scene))} />
      <Row label="path" value={projectPath ?? '(unsaved)'} />
      <BackgroundControl background={scene.background} variant="full" />
      <PlayoutSection scene={scene} />
      {scene.fields.length > 0 && (
        <>
          <h3 className={s.heading}>FIELDS</h3>
          <FieldsPanel scene={scene} bindModeFieldId={bindModeFieldId} />
        </>
      )}
    </aside>
  );
}

function ElementInspector({
  element,
  scene,
  selectedKeyframe,
}: {
  element: Element;
  scene: Scene;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}): JSX.Element {
  // Live transform/style values are sampled at the playhead, but only the
  // value-bearing sections (TransformSection / StyleSection) subscribe to the
  // frame tick themselves — so the inspector chrome (KeyRow, section wrappers,
  // bindings) doesn't re-render on every playback frame.
  const bindings = scene.bindings
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => bindingTargetsElement(b, element.id));
  return (
    <aside className={s.panel} aria-label="Inspector">
      <ElementNameRow elementId={element.id} name={element.name} />
      <CollapseSection title="Transform" pinned>
        <TransformSection element={element} selectedKeyframe={selectedKeyframe} />
      </CollapseSection>
      <StyleSection element={element} selectedKeyframe={selectedKeyframe} />
      {element.type === 'text' && <DynamicDataSection element={element} scene={scene} />}
      {bindings.length > 0 && (
        <CollapseSection title="Bindings" defaultExpanded>
          <ElementBindings bindings={bindings} nameOf={elementNameResolver(scene)} />
        </CollapseSection>
      )}
    </aside>
  );
}

/**
 * The element's display name — the same label shown in the timeline layer list
 * (`element.name`). Renamed from "Key" to "Name" so it isn't confused with the
 * Dynamic / Data section's "Data key" (which drives the text from field data).
 */
function ElementNameRow({ elementId, name }: { elementId: string; name: string }): JSX.Element {
  return (
    <div className={s.keyRow}>
      <span className={s.keyLabel}>Name</span>
      <input
        className={s.keyInput}
        type="text"
        defaultValue={name}
        aria-label="Element name"
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next.length > 0 && next !== name) {
            designerStore.updateElement(elementId, { name: next } as Partial<Element>);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        key={`key-${name}`}
      />
    </div>
  );
}

function bindingTargetsElement(b: FieldBinding, elementId: string): boolean {
  const t = b.target;
  if (t.kind === 'scene-background') return false;
  return t.elementId === elementId;
}

function ElementBindings({
  bindings,
  nameOf,
}: {
  bindings: readonly { b: FieldBinding; idx: number }[];
  nameOf: (id: string) => string;
}): JSX.Element {
  if (bindings.length === 0) {
    return <p className={s.empty}>no bindings target this element</p>;
  }
  return (
    <div className={s.bindList}>
      {bindings.map(({ b, idx }) => (
        <div key={idx} className={s.bindRow}>
          <span style={{ color: colors.text, fontSize: '0.8rem' }}>
            <strong>{b.fieldId}</strong> → {describeBinding(b, nameOf)}
          </span>
          <Button
            variant="bare"
            className={s.bindRemove}
            title="Unbind (keeps the field)"
            aria-label="Unbind"
            onClick={() => designerStore.removeBindingAt(idx)}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * Total element count across every layer, recursing into containers.
 * The Scene inspector displays this as "elements" because the operator
 * thinks in terms of shapes/text on the canvas, not in terms of the
 * logical layer grouping the schema uses underneath.
 */
function countElements(scene: Scene): number {
  let n = 0;
  function walk(
    children: readonly { type: string; children?: readonly { type: string }[] }[],
  ): void {
    for (const child of children) {
      n += 1;
      if (child.type === 'container' && Array.isArray(child.children)) {
        walk(child.children as readonly { type: string; children?: readonly { type: string }[] }[]);
      }
    }
  }
  for (const layer of scene.layers) {
    walk(layer.children as readonly { type: string; children?: readonly { type: string }[] }[]);
  }
  return n;
}

function NameRow({ name }: { name: string }): JSX.Element {
  return (
    <div className={s.row}>
      <span className={s.label}>name</span>
      <input
        style={{
          background: colors.panelMuted,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          borderRadius: '0.18rem',
          padding: '0.1rem 0.35rem',
          fontSize: '0.72rem',
          width: '100%',
          boxSizing: 'border-box',
        }}
        type="text"
        defaultValue={name}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next.length > 0 && next !== name) {
            designerStore.updateScene({ name: next });
          } else if (next.length === 0) {
            // Snap back to the previous value rather than commit an
            // empty name — the schema requires at least one char.
            e.target.value = name;
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            (e.target as HTMLInputElement).value = name;
            (e.target as HTMLInputElement).blur();
          }
        }}
        key={`scene-name-${name}`}
        aria-label="Scene name"
      />
    </div>
  );
}

function DurationRow({ scene }: { scene: Scene }): JSX.Element {
  const duration = scene.frameRange.out - scene.frameRange.in;
  const seconds = duration / scene.frameRate;
  return (
    <div className={s.row}>
      <span className={s.label}>duration</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <RealtimeNumberInput
          style={{
            background: colors.panelMuted,
            color: colors.text,
            border: `1px solid ${colors.border}`,
            borderRadius: '0.18rem',
            padding: '0.1rem 0.35rem',
            fontSize: '0.72rem',
            width: 70,
            fontVariantNumeric: 'tabular-nums',
            boxSizing: 'border-box',
          }}
          min={1}
          step={1}
          value={duration}
          onCommit={(n) => {
            if (n >= 1) designerStore.setSceneDurationFrames(Math.round(n));
          }}
          ariaLabel="Scene duration in frames"
        />
        <span style={{ color: colors.textMuted, fontSize: '0.66rem' }}>
          frames · {seconds.toFixed(2)}s
        </span>
      </div>
    </div>
  );
}

/** Editable composition size (width × height). Routes to the active document. */
function SizeRow({ scene }: { scene: Scene }): JSX.Element {
  return (
    <div className={s.row}>
      <span className={s.label}>size</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ color: colors.textMuted, fontSize: '0.66rem' }}>W</span>
        <RealtimeNumberInput
          className={s.docNum}
          min={1}
          step={1}
          value={scene.resolution.width}
          onCommit={(n) => {
            if (n >= 1)
              designerStore.updateScene({
                resolution: { width: Math.round(n), height: scene.resolution.height },
              });
          }}
          ariaLabel="Composition width"
        />
        <span style={{ color: colors.textMuted, fontSize: '0.66rem' }}>H</span>
        <RealtimeNumberInput
          className={s.docNum}
          min={1}
          step={1}
          value={scene.resolution.height}
          onCommit={(n) => {
            if (n >= 1)
              designerStore.updateScene({
                resolution: { width: scene.resolution.width, height: Math.round(n) },
              });
          }}
          ariaLabel="Composition height"
        />
      </div>
    </div>
  );
}

const FRAME_RATES = [25, 29.97, 50, 59.94, 60] as const;

/** Editable frame rate (snapped to the supported set). Routes to the active document. */
function FrameRateRow({ scene }: { scene: Scene }): JSX.Element {
  return (
    <div className={s.row}>
      <span className={s.label}>frame rate</span>
      <select
        className={s.docNum}
        style={{ width: 'auto' }}
        value={String(scene.frameRate)}
        onChange={(e) =>
          designerStore.updateScene({ frameRate: Number(e.target.value) as Scene['frameRate'] })
        }
        aria-label="Composition frame rate"
      >
        {FRAME_RATES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className={s.row}>
      <span className={s.label}>{label}</span>
      <span className={s.value}>{value}</span>
    </div>
  );
}

function findSelected(scene: Scene, selection: ReadonlySet<string>): Element | null {
  if (selection.size !== 1) return null;
  for (const layer of scene.layers) {
    for (const el of layer.children) {
      if (selection.has(el.id)) return el;
    }
  }
  return null;
}
