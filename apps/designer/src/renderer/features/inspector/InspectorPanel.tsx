import type { AnimatableProperty, Element, FieldBinding, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';
import { BackgroundControl } from '../canvas/BackgroundControl.js';
import { describeBinding } from '../fields/bind-resolver.js';
import { FieldsPanel } from '../fields/FieldsPanel.js';
import { CollapseSection } from './CollapseSection.js';
import { KeyframeInspector } from './KeyframeInspector.js';
import { StyleSection } from './StyleSection.js';
import { TransformSection } from './TransformSection.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
  selection: ReadonlySet<string>;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  keyframeInspectorOpen: boolean;
  currentFrame: number;
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
  removeButton: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.15rem 0.5rem',
    borderRadius: '0.18rem',
    cursor: 'pointer',
    fontSize: '0.7rem',
    alignSelf: 'flex-start' as const,
    marginTop: '0.25rem',
  },
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
  keyframeInspectorOpen,
  currentFrame,
}: Props): JSX.Element {
  if (scene === null) {
    return (
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.headingFirst}>INSPECTOR</h2>
        <p style={styles.empty}>No project selected.</p>
      </aside>
    );
  }

  // Single-click on a timeline diamond only lights up the yellow indicators
  // (selectedKeyframe is set). The dedicated Keyframe Inspector view is
  // reserved for an explicit double-click on a point.
  if (selectedKeyframe !== null && keyframeInspectorOpen) {
    return <KeyframeInspector scene={scene} selectedKeyframe={selectedKeyframe} />;
  }

  const selected = findSelected(scene, selection);
  if (selected === null) {
    return <SceneInspector scene={scene} projectPath={projectPath} />;
  }
  return (
    <ElementInspector
      element={selected}
      scene={scene}
      currentFrame={currentFrame}
      selectedKeyframe={selectedKeyframe}
    />
  );
}

function SceneInspector({
  scene,
  projectPath,
}: {
  scene: Scene;
  projectPath: string | null;
}): JSX.Element {
  const { bindModeFieldId } = useDesignerStore();
  return (
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.headingFirst}>SCENE</h2>
      <Row label="name" value={scene.name} />
      <Row label="type" value={scene.templateType} />
      <Row
        label="resolution"
        value={`${String(scene.resolution.width)}×${String(scene.resolution.height)}`}
      />
      <Row label="frame rate" value={String(scene.frameRate)} />
      <Row label="layers" value={String(scene.layers.length)} />
      <Row label="path" value={projectPath ?? '(unsaved)'} />
      <BackgroundControl background={scene.background} variant="full" />
      <h3 style={styles.heading}>FIELDS</h3>
      <FieldsPanel scene={scene} bindModeFieldId={bindModeFieldId} />
    </aside>
  );
}

function ElementInspector({
  element,
  scene,
  currentFrame,
  selectedKeyframe,
}: {
  element: Element;
  scene: Scene;
  currentFrame: number;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
}): JSX.Element {
  const bindings = scene.bindings
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => bindingTargetsElement(b, element.id));
  return (
    <aside style={styles.panel} aria-label="Inspector">
      <KeyRow elementId={element.id} name={element.name} />
      <CollapseSection title="Transform" defaultExpanded>
        <TransformSection
          element={element}
          currentFrame={currentFrame}
          selectedKeyframe={selectedKeyframe}
        />
      </CollapseSection>
      <StyleSection element={element} />
      {bindings.length > 0 && (
        <CollapseSection title="Bindings" defaultExpanded>
          <ElementBindings bindings={bindings} />
        </CollapseSection>
      )}
      <button style={styles.removeButton} onClick={() => designerStore.removeElement(element.id)}>
        Remove
      </button>
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
