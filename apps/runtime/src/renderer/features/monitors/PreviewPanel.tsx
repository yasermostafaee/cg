import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SquareDashed } from 'lucide-react';
import { REFERENCE_RASTER } from '@cg/shared-ipc';
import { Panel } from '../../ui/Panel.js';
import { Icon } from '../../ui/Icon.js';
import { colors } from '../../theme.js';
import { useRehearse } from '../../hooks/useRehearse.js';
import { useStack } from '../../hooks/useStack.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useFixedBank, useFixedSlots } from '../../hooks/useFixedLayers.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { buildApplyPayload, draftsVersion, subscribeDrafts } from '../inspector/draftStore.js';
import { appliedPlateSources } from '../inspector/livePlates.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from '../sources/sourceStore.js';
import { RehearsalStage } from './RehearsalStage.js';
import { rowNameFor, subjectsFor, type RehearsalSubject } from './rehearsalFrames.js';

/**
 * PREVIEW — the PVW box.
 *
 * Empty until a row is put into REHEARSE (R-022), and then it renders EVERY
 * rehearsing row's graphic locally, composited in the channel's own stacking
 * order. It will never "connect" to anything: R-022 specifies PVW as a LOCAL
 * browser render, so a connection state is meaningless here and telling an
 * operator that PREVIEW is "not connected" would send them hunting for a link
 * that is not part of the design. What it waits for is a graphic to rehearse.
 *
 * IT SHOWS ALL OF THEM, and that replaced a rule rather than extending one.
 * This panel used to pick ONE rehearsal to show — the selected row if it was
 * rehearsing, else the first — which meant an operator with two rows in rehearse
 * saw a clean frame and no indication that a second graphic was rehearsing and
 * would collide with it. Rehearse is per-row and several rows at once is normal
 * operator behaviour, so the panel has to be able to say what is actually being
 * rehearsed. The SELECTION still matters for editing (position and field edits
 * apply to the selected row alone) — it no longer decides what is visible.
 */

const styles = {
  screen: {
    flex: 1,
    minHeight: 0,
    background: '#000',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    boxShadow: `inset 0 0 0 1px ${colors.border}`,
    color: colors.offline,
    textAlign: 'center' as const,
    padding: '0.5rem',
    overflow: 'hidden',
  },
  label: {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  detail: { fontSize: '0.68rem', color: colors.textMuted, maxWidth: '18rem', lineHeight: 1.35 },
} as const;

export function PreviewPanel(): JSX.Element {
  const rehearsals = useRehearse();
  const items = useStack();
  const channelSettings = useChannelSettings();
  const bank = useFixedBank();
  const slots = useFixedSlots();
  const [htmlByItem, setHtmlByItem] = useState<ReadonlyMap<string, string | null>>(
    () => new Map<string, string | null>(),
  );

  // Re-read on every staged edit, so a value the operator has typed but not
  // applied is what the rehearsal shows. Rehearsing the APPLIED values would
  // defeat the point — the operator is here to see the edit before it reaches
  // air.
  const draftVersion = useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);

  /**
   * R-049 — the template registry and the sources store, joined for the live-plate
   * placeholders.
   *
   * `useTemplateIndex` is what carries each template's `liveSources` block (the
   * plate rects, in scene pixels, plus the resolution and resolved default
   * position the geometry chain needs); `sourceVersion` is the subscription that
   * makes ANOTHER console's rebinding repaint this one's PVW, since the bridge
   * owns the assignments and pushes them.
   */
  const templates = useTemplateIndex(items.map((i) => i.templateId));
  const sourceVersion = useSyncExternalStore(subscribeSources, sourcesVersion, sourcesVersion);
  const catalog = currentSourceCatalog();

  const subjects = useMemo(
    () =>
      subjectsFor(rehearsals, (r): RehearsalSubject | null => {
        const item = items.find((i) => i.itemId === r.itemId);
        if (item === undefined) return null;
        const alias = slots.find((s) => s.layer === r.layer && s.channel === r.channel)?.alias;
        const info = templates.get(item.templateId) ?? null;
        const live = info?.liveSources;
        return {
          itemId: r.itemId,
          layer: r.layer,
          channel: r.channel,
          rowName: rowNameFor(bank, r.layer, alias),
          position: item.position,
          // The operator's EFFECTIVE values: applied fields with any staged
          // edits layered on, through the same `buildApplyPayload` the
          // Inspector's Apply uses — so what is rehearsed is exactly what Apply
          // would send.
          fields: buildApplyPayload(item.itemId, item.fields),
          liveSources: live,
          // `B-151` — the bridge's published look drives BOTH halves of the preview.
          activeLookId: item.activeLookId,
          /**
           * 🔴 THE APPLIED BINDING, NOT THE DRAFT — and this is the ONE place
           * this panel deliberately diverges from the "show what the operator
           * has typed" rule the field values above follow.
           *
           * Fields are shown as drafted because rehearse exists to preview an
           * edit before it reaches air. A plate binding is different in kind:
           * an unassigned plate REFUSES the take (C-015's empty-mapping
           * acceptance), and a binding that has been staged but not applied is
           * still unassigned as far as the take is concerned. Painting a staged
           * pick as bound would tell the operator the take will work at the
           * exact moment it will not — which is the failure PVW is their last
           * chance to catch.
           *
           * `appliedPlateSources` is the canonical join (the Inspector's LIVE
           * PLATES section and `isItemDirty` both read it); the catalog lookup
           * turns its source ID into the NAME the operator actually recognises,
           * because an id like `src-8f2a1c` names nothing to anyone.
           *
           * A binding whose catalog entry has gone reads as UNASSIGNED, matching
           * `pruneAssignmentsForCatalog`'s own reading of a dangling reference —
           * and it is the safe direction anyway, since that plate will refuse.
           */
          plateSourceNames: new Map(
            [...appliedPlateSources(item.templateId, live?.sources ?? []).entries()].map(
              ([plateId, sourceId]) => [
                plateId,
                sourceId === null
                  ? null
                  : (catalog.sources.find((s) => s.id === sourceId)?.name ?? null),
              ],
            ),
          ),
        };
      }),
    // `draftVersion` is a real dependency even though nothing in the body names
    // it: `buildApplyPayload` reads the draft store, which is external mutable
    // state React cannot see. Without it a staged edit would not reach the
    // rehearsal until something else happened to invalidate this memo.
    //
    // `sourceVersion` is the same shape of dependency for `appliedPlateSources`
    // and `catalog`, which read the sources store. Without it a plate bound on
    // another console — or on this one, through the Inspector's Update — would
    // keep reading "no source assigned" here until something unrelated
    // invalidated this memo.
    [rehearsals, items, slots, bank, draftVersion, templates, sourceVersion, catalog],
  );

  // Which page each rehearsing row needs. Kept as a SERIALISED key rather than
  // as the array itself so the fetch effect below re-runs when the rehearsing
  // set or a row's template genuinely changes and NOT on every keystroke: the
  // `subjects` array is rebuilt on each staged edit (it carries the draft
  // values), and a fresh array identity would otherwise mean a full page fetch
  // and re-boot per character typed.
  const pageKeys = useMemo(
    () =>
      subjects.map((s) => ({
        itemId: s.itemId,
        templateId: items.find((i) => i.itemId === s.itemId)?.templateId ?? null,
      })),
    [subjects, items],
  );
  const pageKeysJson = JSON.stringify(pageKeys);

  useEffect(() => {
    let cancelled = false;
    const wanted = JSON.parse(pageKeysJson) as { itemId: string; templateId: string | null }[];
    void Promise.all(
      wanted.map(async ({ itemId, templateId }) => {
        const html = templateId === null ? null : await window.cg.templates.html(templateId);
        return [itemId, html] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setHtmlByItem(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [pageKeysJson]);

  // R-030 — the CHANNEL's real raster, so the rehearsals place themselves in the
  // frame that will actually air. Falls back to the reference raster before the
  // settings snapshot arrives, which is the same fallback the on-air page uses.
  // Read from the FIRST rehearsing row's channel: the bank is one channel, and
  // one raster is what makes a single shared fit box and one checker correct.
  const channel = subjects[0]?.channel ?? bank?.channel ?? 1;
  const raster =
    channelSettings.settings.find((s) => s.channel === channel)?.raster ?? REFERENCE_RASTER;

  return (
    <Panel id="pvw" title="PREVIEW (PVW)" style={{ flex: 1, minWidth: 0 }}>
      {subjects.length === 0 ? (
        <div
          style={styles.screen}
          role="img"
          aria-label="PREVIEW — Nothing to preview. Put a loaded row into REHEARSE to render it here."
        >
          <Icon icon={SquareDashed} size={22} />
          <span style={styles.label}>Nothing to preview</span>
          <span style={styles.detail}>
            Put a loaded row into REHEARSE and its graphic renders here, in this browser, with the
            field values you have typed. Nothing is sent to CasparCG.
          </span>
        </div>
      ) : (
        <RehearsalStage subjects={subjects} htmlByItem={htmlByItem} raster={raster} />
      )}
    </Panel>
  );
}
