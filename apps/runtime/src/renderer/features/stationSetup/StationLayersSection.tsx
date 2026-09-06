import { useLiveLayers } from '../../hooks/useLiveLayers.js';
import { useStationLayers } from '../../hooks/useStationLayers.js';
import { colors } from '../../theme.js';

/**
 * `STATION-SETUP-02` §2 — **the reserved and live layers, READ-ONLY, with their source named.**
 *
 * Two declarations had a CLI flag and a file and no UI at all:
 *
 *   - the RESERVED layers (`--reserved-layers` / `bridge-reserved-layers.json`) — the ranges
 *     the station's own playout system owns, fenced from every allocation this bridge makes;
 *   - the LIVE-LAYER ledger (`--live-layers-path` / `bridge-live-layers.json`, or
 *     `--no-live-layers`) — where the bridge persists which layers it seated behind a
 *     template's holes, so a restart does not orphan a guest on air (`B-145`).
 *
 * Both are read at bridge start and neither can change from a browser, so this section is
 * read-only by construction: it shows what is declared and says where to change it.
 *
 * ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
 *
 * The console cannot see the bridge's command line, so it cannot say whether the ledger is
 * being PERSISTED or was started with `--no-live-layers`. It says that, rather than
 * guessing. And it names no row: which stack row owns a seated layer is the LIVE SOURCES
 * tab's job, through the one join in `liveLayerRows.ts` — a second join here would be the
 * drift golden rule 11 exists to end.
 */

const styles = {
  block: { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem' },
  label: { fontSize: '0.78rem', fontWeight: 700, color: colors.text },
  value: { fontSize: '0.85rem', color: colors.text, fontVariantNumeric: 'tabular-nums' as const },
  note: { fontSize: '0.72rem', color: colors.textMuted, margin: 0 },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
} as const;

/** `60–69, 105` for a sorted layer list — the spelling the CLI flag itself takes. */
export function describeLayerRanges(layers: readonly number[]): string {
  const sorted = [...new Set(layers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const layer of sorted) {
    if (start === null || prev === null) {
      start = layer;
      prev = layer;
      continue;
    }
    if (layer === prev + 1) {
      prev = layer;
      continue;
    }
    parts.push(start === prev ? String(start) : `${String(start)}–${String(prev)}`);
    start = layer;
    prev = layer;
  }
  if (start !== null && prev !== null) {
    parts.push(start === prev ? String(start) : `${String(start)}–${String(prev)}`);
  }
  return parts.join(', ');
}

export function StationLayersSection(): JSX.Element {
  const station = useStationLayers();
  const live = useLiveLayers();

  const byChannel = new Map<number, number[]>();
  for (const layer of station) {
    byChannel.set(layer.channel, [...(byChannel.get(layer.channel) ?? []), layer.layer]);
  }
  const reserved = [...byChannel.entries()].sort(([a], [b]) => a - b);

  return (
    <>
      <div style={styles.block} data-reserved-layers="">
        <span style={styles.label}>Reserved for the station’s playout system</span>
        {reserved.length === 0 ? (
          <span style={styles.value}>None declared.</span>
        ) : (
          reserved.map(([channel, layers]) => (
            <span key={channel} style={styles.value} dir="ltr">
              Channel {String(channel)}: {describeLayerRanges(layers)}
            </span>
          ))
        )}
        <p style={styles.note}>
          Declared at bridge start by <span style={styles.code}>--reserved-layers</span> or{' '}
          <span style={styles.code}>bridge-reserved-layers.json</span> in{' '}
          <span style={styles.code}>~/.cg-runtime</span>. Not editable here — change the flag or the
          file and restart the bridge. What is on them is on the STATION LAYERS tab.
        </p>
      </div>
      <div style={styles.block} data-live-layer-ledger="">
        <span style={styles.label}>Live-layer ledger</span>
        <span style={styles.value} dir="ltr">
          {!live.ready
            ? 'Not read from the bridge yet.'
            : live.value.length === 0
              ? 'Nothing seated.'
              : `${String(live.value.length)} layer${live.value.length === 1 ? '' : 's'} seated: ${live.value
                  .map((l) => `${String(l.channel)}-${String(l.layer)}`)
                  .join(', ')}`}
        </span>
        <p style={styles.note}>
          The layers this bridge seated behind a template’s live plates. Persisted at{' '}
          <span style={styles.code}>bridge-live-layers.json</span> in{' '}
          <span style={styles.code}>~/.cg-runtime</span> (or where{' '}
          <span style={styles.code}>--live-layers-path</span> points) unless the bridge was started
          with <span style={styles.code}>--no-live-layers</span> — the console cannot see which.
          Which row owns each layer is on the LIVE SOURCES tab.
        </p>
      </div>
    </>
  );
}
