import type { OrphanLayer } from '@cg/shared-ipc';

/** One sweep's view of an occupied layer (from the OSC occupancy tap). */
export interface SweptLayer {
  channel: number;
  layer: number;
  producer: string;
}

/**
 * R-009 — pure orphan-debounce state machine, one instance per bridge
 * runtime, fed once per sweep tick with (occupied, owned):
 *
 *   - SURFACE after 2 CONSECUTIVE sweeps sighting the same unowned layer
 *     (a single-sweep blip never flaps the warning).
 *   - RESOLVE after 1 sweep in which the layer is empty, aged out (real
 *     CasparCG goes silent on CLEAR — B-053), or became owned — the safe
 *     direction is prompt.
 *   - Report `changed` ONLY when the surfaced set differs from the last
 *     report, so callers publish on change and idle sweeps are silent.
 *
 * No timers, no I/O — the CasparRuntime sweep owns cadence and gating.
 */
export class OrphanTracker {
  /** key 'ch:layer' → consecutive-sighting record. */
  private readonly sightings = new Map<
    string,
    { channel: number; layer: number; producer: string; count: number; since: string }
  >();
  private surfaced = new Map<string, OrphanLayer>();

  /** Currently surfaced orphans, stable-sorted by channel then layer. */
  orphans(): OrphanLayer[] {
    return [...this.surfaced.values()].sort((a, b) => a.channel - b.channel || a.layer - b.layer);
  }

  /**
   * Apply one sweep. `occupied` is the fresh non-empty layer set from the
   * tap; `ownedKeys` are `'ch:layer'` strings the bridge commands (#slots).
   */
  update(occupied: readonly SweptLayer[], ownedKeys: ReadonlySet<string>): { changed: boolean } {
    const seen = new Set<string>();
    for (const occ of occupied) {
      const key = `${String(occ.channel)}:${String(occ.layer)}`;
      if (ownedKeys.has(key)) continue;
      seen.add(key);
      const rec = this.sightings.get(key);
      if (rec === undefined) {
        this.sightings.set(key, {
          channel: occ.channel,
          layer: occ.layer,
          producer: occ.producer,
          count: 1,
          since: new Date().toISOString(),
        });
      } else {
        rec.count += 1;
        rec.producer = occ.producer;
      }
    }
    // Resolve after ONE sweep without a sighting (empty / aged-out / owned).
    for (const key of [...this.sightings.keys()]) {
      if (!seen.has(key)) this.sightings.delete(key);
    }

    const next = new Map<string, OrphanLayer>();
    for (const [key, rec] of this.sightings) {
      if (rec.count < 2) continue; // debounce-in: needs a 2nd consecutive sighting
      const prior = this.surfaced.get(key);
      next.set(key, {
        channel: rec.channel,
        layer: rec.layer,
        producer: rec.producer,
        // `since` is when the orphan SURFACED — stable across sweeps.
        since: prior?.since ?? rec.since,
      });
    }

    const changed = !sameSet(next, this.surfaced);
    this.surfaced = next;
    return { changed };
  }

  /** Forget everything (e.g. after a server switch — old-server knowledge). */
  reset(): { changed: boolean } {
    this.sightings.clear();
    const changed = this.surfaced.size > 0;
    this.surfaced = new Map();
    return { changed };
  }
}

function sameSet(
  a: ReadonlyMap<string, OrphanLayer>,
  b: ReadonlyMap<string, OrphanLayer>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, orphan] of a) {
    const other = b.get(key);
    if (other === undefined || other.producer !== orphan.producer) return false;
  }
  return true;
}
