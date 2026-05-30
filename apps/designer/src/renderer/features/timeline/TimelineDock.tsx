import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnimatableProperty,
  Element,
  Keyframe,
  Scene,
  Track,
} from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { colors } from '../../theme.js';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
  playhead: number;
  playing: boolean;
}

const ROW_HEIGHT = 18;
const RULER_HEIGHT = 22;
const LABEL_WIDTH = 110;
const DIAMOND_SIZE = 10;

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.4rem 0.5rem 0.55rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    color: colors.text,
    fontSize: '0.78rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  heading: {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  controls: { display: 'flex', gap: '0.3rem', alignItems: 'center' },
  btn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.text,
    borderRadius: '0.2rem',
    padding: '0.1rem 0.45rem',
    cursor: 'pointer' as const,
    fontSize: '0.74rem',
    lineHeight: 1.2,
  },
  btnActive: {
    background: colors.accentMuted,
    borderColor: colors.accent,
  },
  frameReadout: {
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums' as const,
    minWidth: '5.5rem',
    textAlign: 'right' as const,
  },
  grid: { position: 'relative' as const, overflow: 'hidden' },
  rowLabel: {
    width: LABEL_WIDTH,
    flexShrink: 0,
    color: colors.textMuted,
    paddingRight: '0.5rem',
    fontSize: '0.72rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  rowTrack: {
    position: 'relative' as const,
    flex: 1,
    height: ROW_HEIGHT,
    background: colors.panelMuted,
    borderRadius: '0.15rem',
    cursor: 'crosshair' as const,
  },
  ruler: {
    display: 'flex',
    alignItems: 'flex-end',
  },
  rulerBar: {
    flex: 1,
    height: RULER_HEIGHT,
    background: colors.panelMuted,
    borderRadius: '0.15rem',
    position: 'relative' as const,
    cursor: 'pointer' as const,
  },
  rulerTick: {
    position: 'absolute' as const,
    bottom: 0,
    width: 1,
    background: colors.border,
  },
  rulerLabel: {
    position: 'absolute' as const,
    top: 1,
    fontSize: '0.62rem',
    color: colors.textMuted,
    transform: 'translateX(-50%)',
    pointerEvents: 'none' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  playhead: {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    width: 2,
    background: colors.accent,
    pointerEvents: 'none' as const,
  },
  diamond: (selectedFlag: boolean): React.CSSProperties => ({
    position: 'absolute' as const,
    top: (ROW_HEIGHT - DIAMOND_SIZE) / 2,
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    transform: 'translateX(-50%) rotate(45deg)',
    background: selectedFlag ? colors.accent : colors.accentMuted,
    border: `1px solid ${colors.text}`,
    boxSizing: 'border-box' as const,
    cursor: 'grab' as const,
  }),
  row: { display: 'flex', alignItems: 'center', gap: '0.2rem' },
  empty: {
    color: colors.textMuted,
    fontSize: '0.74rem',
    fontStyle: 'italic' as const,
    padding: '0.3rem 0',
  },
} as const;

/**
 * Timeline dock — Loopic-style horizontal timeline showing each
 * keyframed property of the currently selected element as a row of
 * diamonds. The frame ruler at the top scrubs the playhead; the
 * controls play / pause / step ±1 frame.
 *
 * Dragging a diamond horizontally calls `designerStore.moveKeyframe`;
 * dragging the playhead caret on the ruler calls `setPlayhead`.
 *
 * The dock owns its own rAF loop when `playing` is true so the
 * playhead actually moves; in M12.1 the runtime uses its own
 * FrameDriver on `play()` — these two clocks deliberately drift
 * apart: the Designer dock is the operator's scrub clock, the
 * runtime is the on-air clock.
 */
export function TimelineDock({ scene, selection, playhead, playing }: Props): JSX.Element {
  const selectedId = firstOf(selection);
  const selectedEl = selectedId === null ? null : findElement(scene, selectedId);
  const tracks = selectedEl?.animation?.tracks ?? {};
  const trackEntries = Object.entries(tracks) as [AnimatableProperty, Track][];
  const range = scene.frameRange;
  const span = Math.max(1, range.out - range.in);

  const rulerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (rulerRef.current === null) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    obs.observe(rulerRef.current);
    return () => obs.disconnect();
  }, []);

  // rAF playhead loop while `playing`.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let frameAccum = playhead;
    const fps = scene.frameRate;
    function tick(now: number): void {
      const dt = now - last;
      last = now;
      frameAccum += (dt / 1000) * fps;
      let next = Math.floor(frameAccum);
      if (next >= range.out) {
        next = range.in + ((next - range.in) % Math.max(1, range.out - range.in));
        frameAccum = next;
      }
      designerStore.setPlayhead(next);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // playhead intentionally omitted: rAF loop owns the value while playing

  }, [playing, scene.frameRate, range.in, range.out]);

  const frameToX = useMemo(
    () => (frame: number): number => ((frame - range.in) / span) * width,
    [range.in, span, width],
  );
  const xToFrame = (x: number): number => Math.round(range.in + (x / Math.max(1, width)) * span);

  const playheadX = frameToX(playhead);

  function onRulerPointer(evt: React.PointerEvent<HTMLDivElement>): void {
    evt.currentTarget.setPointerCapture(evt.pointerId);
    const rect = evt.currentTarget.getBoundingClientRect();
    designerStore.setPlayhead(xToFrame(evt.clientX - rect.left));
  }
  function onRulerMove(evt: React.PointerEvent<HTMLDivElement>): void {
    if ((evt.buttons & 1) === 0) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    designerStore.setPlayhead(xToFrame(evt.clientX - rect.left));
  }

  return (
    <section style={styles.panel} aria-label="Timeline">
      <div style={styles.header}>
        <h3 style={styles.heading}>TIMELINE</h3>
        <div style={styles.controls}>
          <button
            type="button"
            style={styles.btn}
            onClick={() => designerStore.setPlayhead(playhead - 1)}
            aria-label="Step back"
          >
            ◀
          </button>
          <button
            type="button"
            style={playing ? { ...styles.btn, ...styles.btnActive } : styles.btn}
            onClick={() => designerStore.setPlaying(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() => designerStore.setPlayhead(playhead + 1)}
            aria-label="Step forward"
          >
            ▶
          </button>
          <span style={styles.frameReadout}>
            f {String(playhead).padStart(4, ' ')} / {String(range.out)}
          </span>
        </div>
      </div>

      <div style={styles.row}>
        <div style={styles.rowLabel}>frame</div>
        <div
          ref={rulerRef}
          style={styles.rulerBar}
          onPointerDown={onRulerPointer}
          onPointerMove={onRulerMove}
          role="slider"
          aria-label="Playhead"
          aria-valuemin={range.in}
          aria-valuemax={range.out}
          aria-valuenow={playhead}
        >
          <Ruler width={width} range={range} />
          <div style={{ ...styles.playhead, left: playheadX }} />
        </div>
      </div>

      {selectedEl === null ? (
        <p style={styles.empty}>Select an element to see its tracks.</p>
      ) : trackEntries.length === 0 ? (
        <p style={styles.empty}>No keyframes yet — record one from the Inspector.</p>
      ) : (
        trackEntries.map(([property, track]) => (
          <TrackRow
            key={property}
            elementId={selectedEl.id}
            property={property}
            track={track}
            width={width}
            range={range}
            playhead={playhead}
            frameToX={frameToX}
            xToFrame={xToFrame}
          />
        ))
      )}
    </section>
  );
}

interface TrackRowProps {
  elementId: string;
  property: AnimatableProperty;
  track: Track;
  width: number;
  range: { in: number; out: number };
  playhead: number;
  frameToX: (frame: number) => number;
  xToFrame: (x: number) => number;
}

function TrackRow({
  elementId,
  property,
  track,
  width,
  range,
  playhead,
  frameToX,
  xToFrame,
}: TrackRowProps): JSX.Element {
  const playheadX = frameToX(playhead);
  return (
    <div style={styles.row}>
      <div style={styles.rowLabel} title={property}>
        {property}
      </div>
      <div style={styles.rowTrack} data-property={property}>
        <RulerTicks width={width} range={range} faint />
        <div style={{ ...styles.playhead, left: playheadX }} />
        {track.keyframes.map((kf, idx) => (
          <KeyframeDiamond
            key={`${property}-${String(idx)}`}
            kf={kf}
            kfIndex={idx}
            elementId={elementId}
            property={property}
            xToFrame={xToFrame}
            frameToX={frameToX}
            selected={kf.frame === playhead}
          />
        ))}
      </div>
    </div>
  );
}

interface KeyframeDiamondProps {
  kf: Keyframe;
  kfIndex: number;
  elementId: string;
  property: AnimatableProperty;
  xToFrame: (x: number) => number;
  frameToX: (frame: number) => number;
  selected: boolean;
}

function KeyframeDiamond({
  kf,
  kfIndex,
  elementId,
  property,
  xToFrame,
  frameToX,
  selected,
}: KeyframeDiamondProps): JSX.Element {
  function onPointerDown(evt: React.PointerEvent<HTMLDivElement>): void {
    evt.preventDefault();
    evt.stopPropagation();
    const trackEl = evt.currentTarget.parentElement;
    if (trackEl === null) return;
    evt.currentTarget.setPointerCapture(evt.pointerId);
    const rect = trackEl.getBoundingClientRect();

    function onMove(e: PointerEvent): void {
      const x = e.clientX - rect.left;
      designerStore.moveKeyframe(elementId, property, kfIndex, xToFrame(x));
    }
    function onUp(): void {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      style={{ ...styles.diamond(selected), left: frameToX(kf.frame) }}
      onPointerDown={onPointerDown}
      data-kf-frame={kf.frame}
      title={`frame ${String(kf.frame)} · ${String(kf.value)} · ${kf.easing}`}
    />
  );
}

function Ruler({ width, range }: { width: number; range: { in: number; out: number } }): JSX.Element {
  return <RulerTicks width={width} range={range} faint={false} />;
}

function RulerTicks({
  width,
  range,
  faint,
}: {
  width: number;
  range: { in: number; out: number };
  faint: boolean;
}): JSX.Element {
  const span = Math.max(1, range.out - range.in);
  const stride = pickStride(span, width);
  const out: JSX.Element[] = [];
  for (let f = range.in; f <= range.out; f += stride) {
    const x = ((f - range.in) / span) * width;
    out.push(
      <div
        key={f}
        style={{
          ...styles.rulerTick,
          left: x,
          height: faint ? 4 : 8,
          opacity: faint ? 0.35 : 0.8,
        }}
      />,
    );
    if (!faint) {
      out.push(
        <div key={`l-${String(f)}`} style={{ ...styles.rulerLabel, left: x }}>
          {f}
        </div>,
      );
    }
  }
  return <>{out}</>;
}

function pickStride(span: number, width: number): number {
  if (width <= 0) return Math.max(1, Math.floor(span / 8));
  const targetLabels = Math.max(4, Math.floor(width / 60));
  const raw = span / targetLabels;
  const candidates = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
  for (const c of candidates) if (c >= raw) return c;
  return candidates[candidates.length - 1] ?? 1;
}

function firstOf(set: ReadonlySet<string>): string | null {
  for (const v of set) return v;
  return null;
}

function findElement(scene: Scene, id: string): Element | null {
  for (const layer of scene.layers) {
    for (const el of layer.children) {
      if (el.id === id) return el;
    }
  }
  return null;
}
