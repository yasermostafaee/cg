import type { OrphanLayer, OwnedOccupancyWarning } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { useLink } from '../../hooks/useLink.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
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
  // R-015 — the neutral strip: an occupied-but-not-ours VIDEO layer is a
  // normal fact of the console, not a problem. Surface tones only (never
  // amber, never the on-air red) — there is essentially always a video layer
  // in play, and a warning colour here would permanently imply something is
  // wrong when nothing is.
  neutralStrip: {
    border: `1px solid ${colors.border}`,
    background: colors.panel,
    borderRadius: '0.25rem',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    fontSize: '0.85rem',
    color: colors.textMuted,
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
 * names a layer that has a producer but is NOT on the operator's stack.
 *
 * R-015 — the set SPLITS by observed producer kind, because the two kinds
 * mean opposite things to a graphics operator:
 *
 *   - `html` — plausibly OUR OWN graphic riding through a dead bridge
 *     session (this system only ever places HTML producers). Keeps the
 *     warning strip and the explicit, confirm-gated Clear — R-009's case,
 *     unchanged.
 *   - anything else (`ffmpeg`, `decklink`, … — "not html" fails safe) —
 *     PROVABLY another system's output: a video, a program feed. Rendered as
 *     NEUTRAL information with NO Clear control at all — the affordance does
 *     not exist (and the bridge refuses `layers.clear` besides). A graphics
 *     operator must never be able to clear a video layer.
 *
 * Renders NOTHING when there are no orphans (idle-quiet), persists while the
 * orphan persists (never auto-dismissed), and every html Clear is an
 * explicit, confirm-gated operator act — the row disappears when the bridge
 * observes the layer empty on a later sweep (never optimistically).
 *
 * B-056 — the same banner also renders the owned-slot occupancy warnings as
 * a DISTINCT strip: a load's adopt-CLEAR missed the primary over observed
 * foreign content, so a previous session's graphic may be live on the
 * primary under the named item's own layer. No Clear button — the layer IS
 * owned (the bridge refuses `layers.clear` on it); the remedy is Out/Remove
 * of the item, and the row disappears only on the bridge's provable resolve.
 */
export function OrphanLayersBanner({ orphans, ownedOccupancy }: Props): JSX.Element | null {
  // Above the idle-quiet early return: a hook cannot be called conditionally.
  const { confirm, confirmDialog } = useConfirm();
  /**
   * THIS CLEAR EMITS AMCP, so it is gated on BOTH hops like every other one.
   *
   * It was not in the sweep that gated the row and header verbs — not a decision,
   * simply a surface nobody listed — and it is the one Clear an operator reaches
   * for when the console's own model has already failed them, which makes an
   * enabled-but-dead button costlier here than anywhere else: they press it,
   * believe the layer is coming off, and watch a graphic they cannot account for
   * stay on air.
   *
   * Gating it does NOT re-gate on LAYER STATE — the orphan row exists precisely
   * because the layer is carrying something we did not put there, and that fact is
   * never a reason to refuse the remedy. Only reachability is, because with either
   * hop down the command does not leave at all.
   */
  const linkDown = useLink() === 'disconnected';
  const casparReach = useCasparReach();
  const clearRefusal = casparRefusalReason(linkDown, casparReach);

  if (orphans.length === 0 && ownedOccupancy.length === 0) return null;

  // R-015 — the discriminator is the OBSERVED kind, never a layer number.
  const htmlOrphans = orphans.filter((o) => o.producer === 'html');
  const foreignLayers = orphans.filter((o) => o.producer !== 'html');

  return (
    <>
      {htmlOrphans.length > 0 && (
        <div style={styles.strip} role="alert" aria-label="Orphaned on-air layers">
          {htmlOrphans.map((o) => {
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
                  disabled={clearRefusal !== undefined}
                  title={
                    clearRefusal ??
                    `Send CLEAR ${name} — removes whatever is on that layer from the output`
                  }
                  onClick={() => {
                    // Explicit, confirm-gated operator act (the B-048 principle:
                    // the operator decides, never a heuristic). Errors surface
                    // via the command-error toast; success shows as the row
                    // disappearing when the sweep observes the layer empty.
                    void (async () => {
                      const ok = await confirm({
                        title: `Clear layer ${name}?`,
                        body: 'This removes whatever is on that layer from air.',
                        confirmLabel: 'Clear layer',
                        tone: 'clear',
                        variant: 'caution',
                      });
                      if (!ok) return;
                      runCommand(
                        `Clear layer ${name}`,
                        window.cg.layers
                          .clear({ channel: o.channel, layer: o.layer })
                          .then((r) => ({ accepted: r.ok })),
                      );
                    })();
                  }}
                >
                  CLEAR
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {foreignLayers.length > 0 && (
        <div style={styles.neutralStrip} role="status" aria-label="Layers in use by other systems">
          {foreignLayers.map((o) => {
            const name = `${String(o.channel)}-${String(o.layer)}`;
            return (
              <div key={name} style={styles.row}>
                <span>
                  Layer {name} is carrying video ({o.producer}) — placed by another system.{' '}
                  <span style={styles.detail}>Not clearable from here.</span>
                </span>
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
      {confirmDialog}
    </>
  );
}
