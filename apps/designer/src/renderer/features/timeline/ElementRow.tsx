import type { Element, FrameRange } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  element: Element;
  expanded: boolean;
  onToggleExpand: () => void;
  isSelected: boolean;
  frameRange: FrameRange;
  /** Deterministic per-element bar color so each element has its own color. */
  lifespanColor: string;
  /** Which half of the row to render. */
  part: 'label' | 'lane';
}

export const ELEMENT_ROW_HEIGHT = 22;
const ROW_HEIGHT = ELEMENT_ROW_HEIGHT;

const styles = {
  rowSelected: {
    background: 'rgba(56, 189, 248, 0.06)',
  },
  labelCell: {
    display: 'grid',
    gridTemplateColumns: '14px 1fr auto auto',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0 0.4rem',
    background: colors.panel,
    borderRight: `1px solid ${colors.border}`,
    color: colors.textMuted,
    height: ROW_HEIGHT,
    fontSize: '0.72rem',
    cursor: 'pointer',
    boxSizing: 'border-box' as const,
  },
  chevron: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    padding: 0,
    fontSize: '0.65rem',
    width: 12,
    textAlign: 'center' as const,
  },
  name: {
    color: colors.text,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    fontSize: '0.72rem',
  },
  miniIcon: {
    color: colors.textMuted,
    fontSize: '0.62rem',
    width: 12,
    textAlign: 'center' as const,
  },
  laneCell: {
    position: 'relative' as const,
    height: ROW_HEIGHT,
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
  },
  lifespan: {
    position: 'absolute' as const,
    top: '50%',
    left: 0,
    right: 0,
    height: 10,
    transform: 'translateY(-50%)',
    borderRadius: 3,
    opacity: 0.85,
  },
} as const;

/**
 * Per-element header row in the timeline tree:
 *
 *   [ ▾ ] [name (clickable, selects element)] [ 👁 ] [ 🔒 ] │ [────── lifespan bar ──────]
 *
 * Clicking the chevron expands / collapses the 8 property TrackRows
 * underneath; clicking the name selects the element in the canvas store
 * so the right Inspector follows.
 */
export function ElementRow(props: Props): JSX.Element {
  if (props.part === 'label') return <ElementRowLabel {...props} />;
  return <ElementRowLane {...props} />;
}

function ElementRowLabel(props: Props): JSX.Element {
  const { element, expanded, onToggleExpand, isSelected } = props;
  return (
    <div
      style={{ ...styles.labelCell, ...(isSelected ? styles.rowSelected : {}) }}
      data-element-id={element.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).dataset.role === 'chevron') return;
        designerStore.setSelection([element.id]);
      }}
    >
      <button
        type="button"
        style={styles.chevron}
        data-role="chevron"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        aria-expanded={expanded}
        aria-label={`Toggle ${element.name} tracks`}
      >
        {expanded ? '▾' : '▸'}
      </button>
      <span style={styles.name}>{element.name}</span>
      <span style={styles.miniIcon} aria-hidden title={element.visible ? 'Visible' : 'Hidden'}>
        {element.visible ? '◉' : '○'}
      </span>
      <span style={styles.miniIcon} aria-hidden title={element.locked ? 'Locked' : 'Unlocked'}>
        {element.locked ? '🔒' : ' '}
      </span>
    </div>
  );
}

function ElementRowLane(props: Props): JSX.Element {
  const { element, isSelected, lifespanColor } = props;
  // For v1 every element is "active" across the whole scene range.
  return (
    <div
      style={{ ...styles.laneCell, ...(isSelected ? styles.rowSelected : {}) }}
      onClick={() => designerStore.setSelection([element.id])}
    >
      <div
        style={{
          ...styles.lifespan,
          left: `0%`,
          width: `100%`,
          background: lifespanColor,
        }}
      />
    </div>
  );
}

/**
 * Stable per-id color in the Loopic vibe (green / red / blue / amber /
 * etc.) so each element gets its own lifespan stripe.
 */
const PALETTE = [
  '#84CC16', // lime
  '#EF4444', // red
  '#38BDF8', // sky
  '#F59E0B', // amber
  '#A78BFA', // violet
  '#34D399', // emerald
  '#F472B6', // pink
] as const;

export function lifespanColorFor(elementId: string): string {
  let h = 0;
  for (let i = 0; i < elementId.length; i++) h = (h * 31 + elementId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? PALETTE[0];
}
