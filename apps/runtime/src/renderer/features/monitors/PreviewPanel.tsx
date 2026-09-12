import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Frame, SquareDashed } from 'lucide-react';
import { REFERENCE_RASTER } from '@cg/shared-ipc';
import { Panel } from '../../ui/Panel.js';
import { Button } from '../../ui/Button.js';
import { rehearsalCaption } from './rehearsalFrames.js';
import { MonitorHead, MonitorHeadFact } from '../../ui/MonitorHead.js';
import { Icon } from '../../ui/Icon.js';
import { colors, cssVars } from '../../theme.js';
import { useRehearse } from '../../hooks/useRehearse.js';
import { useStack } from '../../hooks/useStack.js';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { useFixedBank, useFixedSlots } from '../../hooks/useFixedLayers.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { useLiveLayers } from '../../hooks/useLiveLayers.js';
import { plateAudioState } from '../layers/plateAudio.js';
import { buildApplyPayload, draftsVersion, subscribeDrafts } from '../inspector/draftStore.js';
import {
  currentSourceAssignments,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
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
    background: cssVars['--r-video-ground'],
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

/**
 * 🔴 The reference's own `title` on each transport button, and each one says what the press
 * REACHES — which is the whole safety point of this row: every one of them is local to this
 * browser (`R-022`), and STOP in particular must not read as a stop on air. The reference's
 * wording already draws that line ("Stop every preview graphic; keep all layers on PVW"), so
 * it is taken verbatim rather than paraphrased.
 */
const PVW_TRANSPORT_TITLE = {
  play: 'Play all preview layers locally — nothing is sent to CasparCG',
  next: 'Send Next to all preview layers with a next step',
  stop: 'Stop every preview graphic; keep all layers on PVW',
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
  /*
    `add-multibox-audio` — the bridge's live-layer ledger, for the HELD half of each box's
    audio glyph. The intent half rides the stack item this panel already holds; the two are
    separate snapshots and this is where they are joined, because the geometry module below
    must stay free of both.
  */
  const { value: liveLayers } = useLiveLayers();

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
           * 🔴 **SESSION BQ — THE RESOLUTION INPUTS, all four levels, not a pre-joined
           * name map.**
           *
           * This built `plateSourceNames` from `appliedPlateSources` alone — LEVEL 2 ONLY,
           * keyed by plate, with no look in it. So a per-look binding (level 3) and an
           * `R-048` patch (level 4) were both invisible to the preview: the overlay named
           * the template's default while air showed the bound source. The owner met it on a
           * rehearsing row after pressing UPDATE.
           *
           * The panel now hands over the INPUTS and `platePlacements` resolves them with
           * the look it already holds, through `resolvePlateSourcesForLook` — the same
           * function the bridge delegates to. **The rule it makes true: the overlay names
           * exactly what a TAKE of this row, in this look, would put on air.**
           *
           * ⚠ The id→name join stays here (`nameOf`), because only this panel can see the
           * sources store; the stage below stays presentational.
           *
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
           * ⚠ That rule is unchanged and is why the store is read here rather than the
           * draft: `currentSourceAssignments()` is the APPLIED level 2, and levels 3 and 4
           * come off the item as the BRIDGE published them. Nothing staged reaches this.
           *
           * A binding whose catalog entry has gone reads as UNASSIGNED (`nameOf` answers
           * `null`), matching `pruneAssignmentsForCatalog`'s own reading of a dangling
           * reference — and it is the safe direction anyway, since that plate will refuse.
           */
          plateSources: {
            templateId: item.templateId,
            assignments: currentSourceAssignments(),
            ...(item.frozenAssignment !== undefined && {
              frozenAssignment: item.frozenAssignment,
            }),
            ...(item.lookSourceOverride !== undefined && {
              lookBindings: item.lookSourceOverride,
            }),
            ...(item.sourceOverride !== undefined && { overrides: item.sourceOverride }),
            nameOf: (catalogId) => catalog.sources.find((s) => s.id === catalogId)?.name ?? null,
            /*
              `add-multibox-audio` — what each box's audio is doing, joined HERE for `nameOf`'s
              reason: it needs the stack (the recorded intent) AND the bridge's ledger (the
              hold), and the geometry module owns neither.

              🔴 `plateAudioState` is IMPORTED, never re-derived. The LIVE PLATES strip, the
              row summary and this glyph must not be able to disagree about whether a guest can
              be heard — audio is the one property of a graphic nobody can check by looking, so
              a divergence between two surfaces would survive until air.

              ⚠ The HELD flag comes from the ledger record for THIS item and plate. Absent
              (the ledger has not arrived, or the row is not seated) reads as NOT held, which
              is what an un-seated rehearsing plate actually is: it will be muted-on-create when
              it is seated, and its intent is what this same map already says.
            */
            audioOf: (plateId) =>
              plateAudioState(
                item.plateVolumes?.[plateId],
                liveLayers.some(
                  (l) => l.itemId === item.itemId && l.sourceId === plateId && l.held,
                ),
              ),
          },
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
    // `liveLayers` is a real dependency for the same class of reason: the HELD half of each
    // box's audio glyph reads it, and a look switch changes it without touching anything else
    // in this list — so without it the glyph would keep saying NOT IN THIS LOOK after the look
    // that hides the box has been left.
    [rehearsals, items, slots, bank, draftVersion, templates, sourceVersion, catalog, liveLayers],
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

  /*
    🔴 THE CONTROLS ROW'S STATE, held here because the row outlives the stage.

    `transport` is `null` whenever no stage is mounted — nothing rehearsing, or no local page
    for what is — and the three buttons read that as "disabled" rather than as an error. The
    guides and the caveats are per-session and deliberately NOT persisted: both are things the
    operator is doing right now, and a remembered "on" would put a ruler over the picture for
    whoever sits down next.
  */
  const [transport, setTransport] = useState<{
    drive: (v: 'play' | 'next' | 'stop') => void;
    ready: boolean;
    count: number;
  } | null>(null);
  const [showGuides, setShowGuides] = useState(false);

  /*
    How many rehearsing rows this browser can actually DRAW. The same arithmetic the stage
    does, from the same two inputs this component already owns — never a second number handed
    up from the stage, which would be a fact about the caption that only exists while the
    caption's own component is mounted.
  */
  const renderableCount = subjects.filter(
    (s) => (htmlByItem.get(s.itemId) ?? null) !== null,
  ).length;

  return (
    <Panel
      id="pvw"
      title="PREVIEW (PVW)"
      compactHead
      heading={<MonitorHead word="PREVIEW" channel={bank?.channel ?? null} tone="pvw" />}
      /*
        🔴 `CONSOLE-MATCH-03` §1 — HOW MANY LAYERS ARE ON PVW, in the head.

        The reference puts the count here and the ROW NAMES in its `title`, which is golden
        rule 11's relocation exactly: the sentence read under pressure is the number, and the
        names are the second question. It counts `subjects` — the rows the operator has put
        into REHEARSE — and NOT `renderable`, deliberately: a row whose page this browser
        does not hold is still ON PVW, and the shortfall is the stage's own caption to state
        (`rehearsalCaption`'s "showing N of M"). Two surfaces, two questions, neither
        borrowing the other's number.
      */
      actions={
        <MonitorHeadFact
          tone="pvw"
          testId="data-pvw-count"
          {...(subjects.length > 0 ? { title: subjects.map((s) => s.rowName).join(' · ') } : {})}
        >
          {subjects.length} {subjects.length === 1 ? 'layer' : 'layers'} on PVW
        </MonitorHeadFact>
      }
      /* `REPAIR-03` A1, audit row 38 — the monitor box's own ground; see `--r-monitor-bg`. */
      style={{
        flex: 1,
        minWidth: 0,
        background: cssVars['--r-monitor-bg'],
        borderRadius: cssVars['--r-monitor-card-radius'],
      }}
    >
      {/*
        🔴 `CONSOLE-LOOK-06` §2 — THE CONTROLS ROW, and it is here rather than inside the stage.

        The reference draws `.monitor-controls` as a 31 px strip between the head and the
        picture, holding the transport, the scope it acts on, and the guides toggle — each
        control PRESENT in every state and disabled by its own condition.
        `CONSOLE-MATCH-03` argued this one away because our transport lived inside
        `RehearsalStage`, which only exists once there is something to render; that argument
        conceded at the time that our own rule points the other way, and it does:
        `LayersPanel` — _"controls that come and go move the target under the operator's hand
        mid-reach"_. So the bar moved up and the stage publishes its transport to it.

        ⚠ IT REPLACED THE LIFECYCLE BAR rather than joining it. The caption and the caveats
        toggle came up with the transport, so PVW has the same number of strips it had before
        and 21 px more picture from the head (§2).
      */}
      <div className="cg-monitor-strip" data-pvw-controls="">
        <span className="cg-pvw-transport">
          {(['play', 'next', 'stop'] as const).map((verb) => (
            <Button
              key={verb}
              variant="secondary"
              disabled={transport === null || !transport.ready}
              aria-label={
                transport === null || transport.count === 1
                  ? verb.toUpperCase()
                  : `${verb.toUpperCase()} ${verb === 'next' ? 'on all' : 'all'} ${String(transport.count)} rehearsing`
              }
              title={PVW_TRANSPORT_TITLE[verb]}
              onClick={() => {
                transport?.drive(verb);
              }}
            >
              {verb.toUpperCase()}
            </Button>
          ))}
        </span>
        {/*
          THE SCOPE, in the reference's own words. It is not decoration: the three buttons
          above drive EVERY rehearsing frame, never the selected one, and an operator who
          assumes otherwise presses PLAY expecting one graphic to move.
        */}
        <span className="cg-pvw-scope">ALL LAYERS</span>
        <span className="cg-monitor-fact" data-rehearsal-caption="">
          {rehearsalCaption(renderableCount, subjects.length)}
        </span>
        <span className="cg-monitor-strip__spacer" />
        {/*
          🔴 A TOGGLE, AND IT LOOKS LIKE ONE (owner, 2026-09-12).

          It was a `ghost` button carrying `aria-pressed` — correct for a screen reader and
          invisible to everyone else, so the only way to learn whether the guides were on was
          to look at the picture. `data-toggle-on` drives a pressed appearance in
          `controls.css`; the state is still `aria-pressed`, so the two cannot disagree.
        */}
        <Button
          variant="ghost"
          aria-pressed={showGuides}
          data-toggle-on={showGuides ? '' : undefined}
          aria-label="Toggle safe-area guides"
          title="Toggle safe-area guides — title-safe and action-safe, drawn on the canvas"
          onClick={() => {
            setShowGuides((on) => !on);
          }}
        >
          <Icon icon={Frame} size={13} />
        </Button>
      </div>
      {subjects.length === 0 ? (
        <div
          style={styles.screen}
          role="img"
          aria-label="PREVIEW — No layers on preview. Use ON PVW on one or more loaded rows to render them here."
        >
          <Icon icon={SquareDashed} size={22} />
          {/*
            🔴 `CONSOLE-MATCH-03` §1 — the reference's heading and its instruction, over our
            own honesty sentence rather than instead of it. `No layers on preview` names the
            MECHANISM (layers, PVW) where "Nothing to preview" named only the absence, and
            "Use ON PVW on one or more loaded rows" says which control produces one. What is
            kept is the last sentence: `R-022` is explicit that nothing here is sent to
            CasparCG, and that is the fact an operator must not have to infer from a blank box.
          */}
          <span style={styles.label}>No layers on preview</span>
          <span style={styles.detail}>
            Use ON PVW on one or more loaded rows and their graphics render here, in this browser,
            with the field values you have typed. Nothing is sent to CasparCG.
          </span>
        </div>
      ) : (
        <RehearsalStage
          subjects={subjects}
          htmlByItem={htmlByItem}
          raster={raster}
          showGuides={showGuides}
          onTransport={setTransport}
        />
      )}
    </Panel>
  );
}
