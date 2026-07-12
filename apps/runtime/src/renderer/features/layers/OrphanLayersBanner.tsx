import type { OrphanLayer, OwnedOccupancyWarning } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { runCommand } from '../status/commandFeedback.js';

interface Props {
  orphans: OrphanLayer[];
  /** B-056 — owned-slot occupancy warnings (distinct variant, no Clear). */
  ownedOccupancy: OwnedOccupancyWarning[];
}

const styles = {
  strip: {
    border: '1px solid #B45309',
    background: 'rgba(180, 83, 9, 0.12)',
    borderRadius: '0.25rem',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    fontSize: '0.85rem',
    color: '#FCD34D',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  detail: { color: colors.textMuted, fontSize: '0.78rem' },
} as const;

/**
 * R-009 — orphaned/unknown on-air layers. Fed by the bridge's periodic
 * occupancy sweep (a passive OSC tap compared against owned slots): each row
 * names a layer that has a producer but is NOT on the operator's stack —
 * e.g. a graphic ridden through a dead bridge session (B-048 deliberately
 * never blind-clears at startup; the decision belongs to the operator).
 *
 * Renders NOTHING when there are no orphans (idle-quiet), persists while the
 * orphan persists (never auto-dismissed), and every Clear is an explicit,
 * confirm-gated operator act — the row disappears when the bridge observes
 * the layer empty on a later sweep (never optimistically).
 *
 * B-056 — the same banner also renders the owned-slot occupancy warnings as
 * a DISTINCT strip: a load's adopt-CLEAR missed the primary over observed
 * foreign content, so a previous session's graphic may be live on the
 * primary under the named item's own layer. No Clear button — the layer IS
 * owned (the bridge refuses `layers.clear` on it); the remedy is Out/Remove
 * of the item, and the row disappears only on the bridge's provable resolve.
 */
export function OrphanLayersBanner({ orphans, ownedOccupancy }: Props): JSX.Element | null {
  if (orphans.length === 0 && ownedOccupancy.length === 0) return null;

  return (
    <>
      {orphans.length > 0 && (
        <div style={styles.strip} role="alert" aria-label="Orphaned on-air layers">
          {orphans.map((o) => {
            const name = `${String(o.channel)}-${String(o.layer)}`;
            return (
              <div key={name} style={styles.row}>
                <span>
                  ⚠ Layer {name} is on air but not on your stack{' '}
                  <span style={styles.detail}>
                    ({o.producer} producer — likely left by a previous session)
                  </span>
                </span>
                <Button
                  variant="caution"
                  aria-label={`Clear layer ${name}`}
                  title={`Send CLEAR ${name} — removes whatever is on that layer from the output`}
                  onClick={() => {
                    // Explicit, confirm-gated operator act (the B-048 principle:
                    // the operator decides, never a heuristic). Errors surface
                    // via the command-error toast; success shows as the row
                    // disappearing when the sweep observes the layer empty.
                    if (
                      window.confirm(
                        `Clear layer ${name}? This removes whatever is on it from air.`,
                      )
                    ) {
                      runCommand(
                        `Clear layer ${name}`,
                        window.cg.layers
                          .clear({ channel: o.channel, layer: o.layer })
                          .then((r) => ({ accepted: r.ok })),
                      );
                    }
                  }}
                >
                  CLEAR
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {ownedOccupancy.length > 0 && (
        <div style={styles.strip} role="alert" aria-label="Owned-layer occupancy warnings">
          {ownedOccupancy.map((w) => {
            const name = `${String(w.channel)}-${String(w.layer)}`;
            return (
              <div key={name} style={styles.row}>
                <span>
                  ⚠ Layer {name} may still show a previous session’s graphic on the primary under
                  item “{w.itemId}”{' '}
                  <span style={styles.detail}>
                    ({w.producer} producer observed when the item loaded and the primary could not
                    be cleared — Out or Remove the item to clear it)
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
