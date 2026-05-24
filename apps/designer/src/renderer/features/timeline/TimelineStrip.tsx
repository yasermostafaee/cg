import type { Element, Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { presetDuration } from '../inspector/animation-defaults.js';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
}

const ROW_HEIGHT = 22;
const NAME_COL = 140;

/**
 * Bottom dock — one row per element showing entry / loop / exit duration
 * blocks against a frames timeline (Phase 6 §10). Clicking a row selects
 * the element. The timeline is a visual aid, not an editor — preset
 * durations are still edited via the Inspector's AnimationSection.
 *
 * Loop blocks have no fixed duration; they render as a hatched fill
 * across the post-entry / pre-exit span.
 */
export function TimelineStrip({ scene, selection }: Props): JSX.Element {
  const elements: Element[] = [];
  for (const layer of scene.layers) {
    for (const el of layer.children) elements.push(el);
  }

  // Compute the global frames axis — max(entry + loop-region + exit) across
  // all elements. Loop has no duration, so reserve a flat region after
  // every element's entry.
  const globalDuration = elements.reduce((max, el) => {
    const entry = presetDuration(el.animation?.entry);
    const exit = presetDuration(el.animation?.exit);
    const total = entry + 60 + exit; // 60-frame loop placeholder
    return Math.max(max, total);
  }, 60);

  const styles = {
    dock: {
      background: colors.panel,
      border: `1px solid ${colors.border}`,
      borderRadius: '0.25rem',
      padding: '0.5rem',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '0.25rem',
      maxHeight: 160,
      overflowY: 'auto' as const,
    },
    heading: {
      fontSize: '0.78rem',
      fontWeight: 700,
      color: colors.textMuted,
      letterSpacing: '0.05em',
      margin: 0,
    },
    empty: { color: colors.textMuted, fontSize: '0.82rem' },
    row: {
      display: 'grid',
      gridTemplateColumns: `${String(NAME_COL)}px 1fr`,
      gap: '0.4rem',
      alignItems: 'center',
      cursor: 'pointer',
      padding: '0.1rem 0.25rem',
      borderRadius: '0.2rem',
    },
    rowSelected: { background: colors.panelMuted },
    name: {
      fontSize: '0.78rem',
      color: colors.text,
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
    },
    track: {
      position: 'relative' as const,
      height: ROW_HEIGHT,
      background: colors.panelMuted,
      borderRadius: '0.15rem',
    },
    block: {
      position: 'absolute' as const,
      top: 0,
      bottom: 0,
      borderRadius: '0.15rem',
    },
    entry: { background: 'rgba(56,189,248,0.7)' },
    loop: {
      background:
        'repeating-linear-gradient(45deg, rgba(56,189,248,0.25), rgba(56,189,248,0.25) 4px, transparent 4px, transparent 8px)',
    },
    exit: { background: 'rgba(245,158,11,0.7)' },
  } as const;

  return (
    <section style={styles.dock} aria-label="Timeline">
      <h2 style={styles.heading}>TIMELINE</h2>
      {elements.length === 0 ? (
        <p style={styles.empty}>No elements to time. Add text or shape on the canvas.</p>
      ) : (
        elements.map((el) => {
          const entry = presetDuration(el.animation?.entry);
          const exit = presetDuration(el.animation?.exit);
          const loopStart = entry;
          const loopEnd = Math.max(globalDuration - exit, loopStart);
          const selected = selection.has(el.id);
          return (
            <div
              key={el.id}
              style={selected ? { ...styles.row, ...styles.rowSelected } : styles.row}
              onClick={() => designerStore.setSelection([el.id])}
            >
              <span style={styles.name}>{el.name}</span>
              <div style={styles.track}>
                {entry > 0 && (
                  <div
                    style={{
                      ...styles.block,
                      ...styles.entry,
                      left: 0,
                      width: `${String((entry / globalDuration) * 100)}%`,
                    }}
                  />
                )}
                {el.animation?.loop !== undefined && el.animation.loop.kind !== 'none' && (
                  <div
                    style={{
                      ...styles.block,
                      ...styles.loop,
                      left: `${String((loopStart / globalDuration) * 100)}%`,
                      width: `${String(((loopEnd - loopStart) / globalDuration) * 100)}%`,
                    }}
                  />
                )}
                {exit > 0 && (
                  <div
                    style={{
                      ...styles.block,
                      ...styles.exit,
                      left: `${String((loopEnd / globalDuration) * 100)}%`,
                      width: `${String((exit / globalDuration) * 100)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
