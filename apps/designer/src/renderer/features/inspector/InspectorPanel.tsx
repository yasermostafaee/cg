import type { AnimatableProperty, Element, FieldBinding, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { BackgroundControl } from '../canvas/BackgroundControl.js';
import { describeBinding } from '../fields/bind-resolver.js';
import { FieldsPanel } from '../fields/FieldsPanel.js';
import { CollapseSection } from './CollapseSection.js';
import { RealtimeNumberInput } from './controls.js';
import { KeyframeInspector } from './KeyframeInspector.js';
import { StyleSection } from './StyleSection.js';
import { TransformSection } from './TransformSection.js';

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

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.3rem',
    minHeight: 0,
    overflowY: 'auto' as const,
    fontSize: '0.74rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  heading: {
    fontSize: '0.66rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    margin: '0.35rem 0 0.15rem',
    paddingTop: '0.35rem',
    borderTop: `1px solid ${colors.border}`,
  },
  headingFirst: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.06em',
    margin: 0,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    gap: '0.4rem',
    fontSize: '0.72rem',
    padding: '0.1rem 0',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem' },
  value: {
    color: colors.text,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  empty: { color: colors.textMuted, fontSize: '0.74rem' },
  bindList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.2rem',
  },
  bindRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.4rem',
  },
  bindRemove: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.08rem 0.3rem',
    borderRadius: '0.18rem',
    cursor: 'pointer',
    fontSize: '0.68rem',
  },
  keyRow: {
    display: 'grid',
    gridTemplateColumns: '36px 1fr',
    gap: '0.4rem',
    alignItems: 'center',
    padding: '0.15rem 0 0.35rem',
  },
  keyLabel: {
    color: colors.textMuted,
    fontSize: '0.66rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  keyInput: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.15rem 0.35rem',
    borderRadius: '0.18rem',
    fontSize: '0.72rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
} as const;

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
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.headingFirst}>INSPECTOR</h2>
        <p style={styles.empty}>No project selected.</p>
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
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.headingFirst}>COMPOSITION</h2>
      <NameRow name={scene.name} />
      <SizeRow scene={scene} />
      <DurationRow scene={scene} />
      <FrameRateRow scene={scene} />
      <Row label="elements" value={String(countElements(scene))} />
      <Row label="path" value={projectPath ?? '(unsaved)'} />
      <BackgroundControl background={scene.background} variant="full" />
      {scene.fields.length > 0 && (
        <>
          <h3 style={styles.heading}>FIELDS</h3>
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
    <aside style={styles.panel} aria-label="Inspector">
      <KeyRow elementId={element.id} name={element.name} />
      <CollapseSection title="Transform" pinned>
        <TransformSection element={element} selectedKeyframe={selectedKeyframe} />
      </CollapseSection>
      <StyleSection element={element} selectedKeyframe={selectedKeyframe} />
      {bindings.length > 0 && (
        <CollapseSection title="Bindings" defaultExpanded>
          <ElementBindings bindings={bindings} />
        </CollapseSection>
      )}
    </aside>
  );
}

function KeyRow({ elementId, name }: { elementId: string; name: string }): JSX.Element {
  return (
    <div style={styles.keyRow}>
      <span style={styles.keyLabel}>Key</span>
      <input
        style={styles.keyInput}
        type="text"
        defaultValue={name}
        aria-label="Element key / name"
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
}: {
  bindings: readonly { b: FieldBinding; idx: number }[];
}): JSX.Element {
  if (bindings.length === 0) {
    return <p style={styles.empty}>no bindings target this element</p>;
  }
  return (
    <div style={styles.bindList}>
      {bindings.map(({ b, idx }) => (
        <div key={idx} style={styles.bindRow}>
          <span style={{ color: colors.text, fontSize: '0.8rem' }}>
            <strong>{b.fieldId}</strong> → {describeBinding(b)}
          </span>
          <button style={styles.bindRemove} onClick={() => designerStore.removeBindingAt(idx)}>
            ×
          </button>
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
    <div style={styles.row}>
      <span style={styles.label}>name</span>
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
    <div style={styles.row}>
      <span style={styles.label}>duration</span>
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

const DOC_NUM_STYLE = {
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.1rem 0.35rem',
  fontSize: '0.72rem',
  width: 64,
  fontVariantNumeric: 'tabular-nums' as const,
  boxSizing: 'border-box' as const,
};

/** Editable composition size (width × height). Routes to the active document. */
function SizeRow({ scene }: { scene: Scene }): JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.label}>size</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ color: colors.textMuted, fontSize: '0.66rem' }}>W</span>
        <RealtimeNumberInput
          style={DOC_NUM_STYLE}
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
          style={DOC_NUM_STYLE}
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
    <div style={styles.row}>
      <span style={styles.label}>frame rate</span>
      <select
        style={{ ...DOC_NUM_STYLE, width: 'auto' }}
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
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={styles.value}>{value}</span>
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
