import { useRef } from 'react';
import { EASING_PRESETS, type BezierEasing } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { RealtimeNumberInput } from './controls.js';

interface Props {
  bezier: BezierEasing;
  onChange: (bezier: BezierEasing) => void;
}

// Dropdown order (matches the reference). 'custom' is shown when the current
// curve doesn't match any preset.
const PRESET_ORDER: readonly { key: string; label: string }[] = [
  { key: 'linear', label: 'Linear' },
  { key: 'ease-in', label: 'Ease In' },
  { key: 'ease-out', label: 'Ease Out' },
  { key: 'ease-in-out', label: 'Ease In-Out' },
  { key: 'sine', label: 'Sine' },
  { key: 'custom', label: 'Custom' },
];

const SIZE = 196;
const PAD = 14;
const PLOT = SIZE - PAD * 2;

function approxEq(a: BezierEasing, b: BezierEasing): boolean {
  return a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 0.005);
}

function presetKeyFor(b: BezierEasing): string {
  for (const [key, preset] of Object.entries(EASING_PRESETS)) {
    if (approxEq(b, preset)) return key;
  }
  return 'custom';
}

const styles = {
  heading: {
    color: colors.accent,
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    margin: '0.4rem 0 0.3rem',
    paddingTop: '0.35rem',
    borderTop: `1px solid ${colors.border}`,
  },
  presetRow: {
    display: 'grid',
    gridTemplateColumns: '64px 1fr',
    alignItems: 'center',
    gap: '0.4rem',
    marginBottom: '0.45rem',
  },
  label: { color: colors.textMuted, fontSize: '0.7rem' },
  select: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    padding: '0.2rem 0.35rem',
    fontSize: '0.78rem',
    width: '100%',
  },
  graphWrap: {
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.3rem',
    padding: '0.3rem',
    display: 'flex',
    justifyContent: 'center',
  },
  ptRow: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr 1fr',
    alignItems: 'center',
    gap: '0.4rem',
    marginTop: '0.4rem',
  },
  axisInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.18rem',
    padding: '0.1rem 0.4rem',
  },
  axisLetter: { color: colors.textMuted, fontSize: '0.68rem' },
  numInput: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: 0,
    fontSize: '0.74rem',
    width: '100%',
    minWidth: 0,
    fontVariantNumeric: 'tabular-nums' as const,
  },
} as const;

/** Screen X for a curve x ∈ [0,1]. */
function sx(x: number): number {
  return PAD + x * PLOT;
}
/** Screen Y for a curve y ∈ [0,1] (progress points up). */
function sy(y: number): number {
  return PAD + (1 - y) * PLOT;
}

export function EasingEditor({ bezier, onChange }: Props): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [x1, y1, x2, y2] = bezier;
  const presetKey = presetKeyFor(bezier);

  function setComponent(index: 0 | 1 | 2 | 3, v: number): void {
    const next: BezierEasing = [...bezier] as BezierEasing;
    next[index] = v;
    onChange(next);
  }

  function dragHandle(point: 'p1' | 'p2', e: React.PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (svgRef.current === null) return;
    function move(ev: PointerEvent): void {
      const node = svgRef.current;
      if (node === null) return;
      const rect = node.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (ev.clientX - rect.left - PAD) / PLOT));
      const ny = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top - PAD) / PLOT));
      const next: BezierEasing = [...bezier] as BezierEasing;
      if (point === 'p1') {
        next[0] = nx;
        next[1] = ny;
      } else {
        next[2] = nx;
        next[3] = ny;
      }
      onChange(next);
    }
    function up(): void {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const gridLines = [0.25, 0.5, 0.75];

  return (
    <div>
      <h3 style={styles.heading}>KEYFRAME INTERPOLATION</h3>
      <div style={styles.presetRow}>
        <span style={styles.label}>Preset</span>
        <select
          style={styles.select}
          value={presetKey}
          onChange={(e) => {
            const preset = EASING_PRESETS[e.target.value];
            if (preset !== undefined) onChange([...preset] as BezierEasing);
          }}
          aria-label="Easing preset"
        >
          {PRESET_ORDER.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.graphWrap}>
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
          style={{ touchAction: 'none' }}
          aria-label="Easing curve"
        >
          {/* grid */}
          <rect
            x={PAD}
            y={PAD}
            width={PLOT}
            height={PLOT}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
          {gridLines.map((g) => (
            <line key={`v${String(g)}`} x1={sx(g)} y1={PAD} x2={sx(g)} y2={PAD + PLOT} stroke={colors.border} strokeWidth={0.5} opacity={0.6} />
          ))}
          {gridLines.map((g) => (
            <line key={`h${String(g)}`} x1={PAD} y1={sy(g)} x2={PAD + PLOT} y2={sy(g)} stroke={colors.border} strokeWidth={0.5} opacity={0.6} />
          ))}
          {/* handle connector lines */}
          <line x1={sx(0)} y1={sy(0)} x2={sx(x1)} y2={sy(y1)} stroke={colors.textMuted} strokeWidth={1} opacity={0.6} />
          <line x1={sx(1)} y1={sy(1)} x2={sx(x2)} y2={sy(y2)} stroke={colors.textMuted} strokeWidth={1} opacity={0.6} />
          {/* the curve */}
          <path
            d={`M ${String(sx(0))} ${String(sy(0))} C ${String(sx(x1))} ${String(sy(y1))} ${String(sx(x2))} ${String(sy(y2))} ${String(sx(1))} ${String(sy(1))}`}
            fill="none"
            stroke={colors.accent}
            strokeWidth={1.75}
          />
          {/* handles */}
          <rect
            x={sx(x1) - 5}
            y={sy(y1) - 5}
            width={10}
            height={10}
            rx={1}
            fill="#c7ccdb"
            stroke={colors.accent}
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => dragHandle('p1', e)}
          />
          <rect
            x={sx(x2) - 5}
            y={sy(y2) - 5}
            width={10}
            height={10}
            rx={1}
            fill="#c7ccdb"
            stroke={colors.accent}
            strokeWidth={1}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => dragHandle('p2', e)}
          />
        </svg>
      </div>

      <div style={styles.ptRow}>
        <span style={styles.label}>P1</span>
        <AxisInput letter="X" value={x1} onCommit={(v) => setComponent(0, clamp01(v))} />
        <AxisInput letter="Y" value={y1} onCommit={(v) => setComponent(1, v)} />
      </div>
      <div style={styles.ptRow}>
        <span style={styles.label}>P2</span>
        <AxisInput letter="X" value={x2} onCommit={(v) => setComponent(2, clamp01(v))} />
        <AxisInput letter="Y" value={y2} onCommit={(v) => setComponent(3, v)} />
      </div>
    </div>
  );
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function AxisInput({
  letter,
  value,
  onCommit,
}: {
  letter: string;
  value: number;
  onCommit: (v: number) => void;
}): JSX.Element {
  return (
    <div style={styles.axisInput}>
      <span style={styles.axisLetter} aria-hidden>
        {letter}
      </span>
      <RealtimeNumberInput
        style={styles.numInput}
        step={0.01}
        value={value}
        onCommit={onCommit}
        ariaLabel={letter}
      />
    </div>
  );
}
