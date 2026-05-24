import type { Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { AnimationSection } from './AnimationSection.js';
import { StyleSection } from './StyleSection.js';
import { TransformSection } from './TransformSection.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
  selection: ReadonlySet<string>;
}

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  heading: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: '0.4rem 0 0.2rem',
    paddingTop: '0.4rem',
    borderTop: `1px solid ${colors.border}`,
  },
  headingFirst: {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    gap: '0.5rem',
    fontSize: '0.82rem',
    padding: '0.15rem 0',
  },
  label: { color: colors.textMuted },
  value: { color: colors.text, fontWeight: 500 },
  empty: { color: colors.textMuted, fontSize: '0.85rem' },
  removeButton: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.2rem 0.5rem',
    borderRadius: '0.2rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    alignSelf: 'flex-start' as const,
    marginTop: '0.3rem',
  },
} as const;

/**
 * Right-pane Inspector. When an element is selected, shows Transform +
 * Style sections that mutate the store. When nothing's selected, shows
 * scene metadata.
 */
export function InspectorPanel({ scene, projectPath, selection }: Props): JSX.Element {
  if (scene === null) {
    return (
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.headingFirst}>INSPECTOR</h2>
        <p style={styles.empty}>No project selected.</p>
      </aside>
    );
  }

  const selected = findSelected(scene, selection);
  if (selected === null) {
    return <SceneInspector scene={scene} projectPath={projectPath} />;
  }
  return <ElementInspector element={selected} />;
}

function SceneInspector({
  scene,
  projectPath,
}: {
  scene: Scene;
  projectPath: string | null;
}): JSX.Element {
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
    </aside>
  );
}

function ElementInspector({ element }: { element: Element }): JSX.Element {
  return (
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.headingFirst}>ELEMENT — {element.type.toUpperCase()}</h2>
      <Row label="id" value={element.id} />
      <Row label="name" value={element.name} />
      <h3 style={styles.heading}>TRANSFORM</h3>
      <TransformSection element={element} />
      <h3 style={styles.heading}>STYLE</h3>
      <StyleSection element={element} />
      <h3 style={styles.heading}>ANIMATION</h3>
      <AnimationSection element={element} />
      <button style={styles.removeButton} onClick={() => designerStore.removeElement(element.id)}>
        Remove
      </button>
    </aside>
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
