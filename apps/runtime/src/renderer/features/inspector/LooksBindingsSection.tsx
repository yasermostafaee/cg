import { useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { activeLookOf } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from '../sources/sourceStore.js';
import {
  draftsVersion,
  effectiveLookBinding,
  isLookBindingDirty,
  stageLookBinding,
  subscribeDrafts,
} from './draftStore.js';
import { reportCommandError } from '../status/commandFeedback.js';

/**
 * ⭐ **SESSION BM-2 (`design.md` §12.9.1b) — WHAT THIS ROW SHOWS IN EACH LOOK.**
 *
 * The template's flat `{plate → source}` list above answers a different question — the
 * DEFAULT every row starts from — and it kept answering it while the operator needed a second
 * one: _"2-box shows studio-1 and studio-2; what will SOLO show?"_ A single flat list cannot
 * hold two answers for one hole, so this section holds the LOOKS and their inputs.
 *
 * ── 🔴 THE FOUR LEVELS, AND WHY THIS SURFACE HAS TO MAKE THEM LEGIBLE ───────
 *
 *   1. the installation's CATALOG · 2. the template's ASSIGNMENT (the section above — every
 *   row) · 3. **THIS ROW's per-look binding (here)** · 4. the row's EMERGENCY patch
 *   (`R-048`), in force in EVERY look and outranking 3.
 *
 * §3.4's requirement is that they read WITHOUT a paragraph — _"if the surface needs a
 * paragraph to be safe, the surface is wrong"_ — so each level is where the operator already
 * is: the default sits in the section that owns it and says so in one line; a look's own
 * choice sits under that look's name; and a patch announces itself ON the rows it masks
 * rather than in a legend.
 *
 * ── 🔴 §2 — THE HAZARD THIS SECTION EXISTS TO NOT SHIP ──────────────────────
 *
 * Level 4 MASKS level 3. So a list of per-look inputs can show `solo → studio-3` in perfect
 * good faith while an emergency patch puts studio-5 on air in every look — a surface that is
 * confidently wrong, which is the worst class of defect this product has.
 *
 * Three things answer it, and all three are asserted in tests rather than left to the layout:
 *
 *   - the patch is **named on every row it masks**, in amber, saying what is actually on air;
 *   - the masked value is **struck through and labelled "not in force"** — never merely
 *     greyed, because grey reads as "disabled" and invites the operator to conclude the
 *     control is broken rather than overridden;
 *   - **CLEAR PATCH sits on the row that shows the patch.** An emergency that cannot be
 *     ended from where it is seen becomes permanent by accident, which is exactly how a 20:59
 *     substitution turns into tomorrow's configuration.
 */

const styles = {
  scope: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: '0 0 var(--r-space-3)' },
  look: { margin: '0 0 var(--r-space-3)' },
  lookHead: {
    display: 'flex',
    gap: 'var(--r-space-2)',
    alignItems: 'baseline',
    marginBottom: 'var(--r-space-1)',
  },
  lookName: { fontWeight: 700, fontSize: 'var(--r-text-sm)' },
  /**
   * The LIVE look.
   *
   * 🔴 NOT GREEN. Green is the layer table's ON AIR mark and means "this row is playing";
   * this says "of this row's looks, THIS is the one composited". Borrowing green would put a
   * second meaning on the one colour an operator reads fastest. Amber is this palette's
   * ATTENTION role and is right here for the reason §3.2 gives: the operator is editing an
   * on-air look and an off-air look in the same panel, and confusing them puts the wrong feed
   * up — so the on-air one is the thing that needs attention.
   */
  live: { color: colors.pending, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em' },
  row: {
    display: 'flex',
    gap: 'var(--r-space-2)',
    alignItems: 'center',
    marginBottom: 'var(--r-space-1)',
    flexWrap: 'wrap' as const,
    paddingLeft: 'var(--r-space-3)',
  },
  plate: { fontFamily: 'monospace', fontSize: 'var(--r-text-sm)', minWidth: '5rem' },
  /** A per-look value an emergency patch has taken out of force — see the header's §2. */
  masked: { color: colors.pending, fontSize: '0.72rem', fontWeight: 700 },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-sm)', margin: 0 },
} as const;

/** The name this station shows for a catalog id, or the id when it names nothing. */
function sourceName(id: string | undefined): string {
  if (id === undefined || id === '') return 'the template default';
  return currentSourceCatalog().sources.find((s) => s.id === id)?.name ?? id;
}

export function LooksBindingsSection({
  item,
  info,
}: {
  item: StackItemState;
  info: TemplateInfo | null;
}): JSX.Element | null {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  useSyncExternalStore(subscribeDrafts, draftsVersion);
  const carrier = info?.liveSources;
  const looks = carrier?.looks ?? [];
  // A template with no LOOKS gets no section — its plates have one answer, and the flat list
  // above already is it. An empty heading is a question the operator did not ask.
  if (carrier === undefined || looks.length === 0) return null;

  const liveLookId = activeLookOf(carrier, item.activeLookId)?.id;
  const patches = item.sourceOverride ?? {};
  const bound = item.lookSourceOverride ?? {};

  return (
    <div className="cg-inspector-section" aria-label="Look inputs">
      <h2>LOOK INPUTS</h2>
      <p style={styles.scope}>
        Set for THIS row — each look can show a different input. Blank takes the template default
        above.
      </p>
      {looks.map((look) => {
        const rects = look.rects;
        const plates = (carrier.sources ?? []).filter((p) => rects[p.sourceId] !== undefined);
        const isLive = look.id === liveLookId;
        return (
          <div key={look.id} style={styles.look} data-look-row={look.id}>
            <div style={styles.lookHead}>
              <span style={styles.lookName}>{look.name}</span>
              {isLive && (
                <span style={styles.live} data-look-live={look.id}>
                  ON AIR NOW
                </span>
              )}
            </div>
            {plates.length === 0 && <p style={styles.empty}>No frames in this look.</p>}
            {plates.map((plate) => {
              const applied = bound[look.id]?.[plate.sourceId];
              const value = effectiveLookBinding(item.itemId, look.id, plate.sourceId, applied);
              const dirty = isLookBindingDirty(item.itemId, look.id, plate.sourceId, applied);
              // §2 — level 4 masks level 3, for THIS plate, in EVERY look.
              const patch = patches[plate.sourceId];
              const masked = patch !== undefined && patch !== '';
              return (
                <div key={`${look.id}:${plate.sourceId}`} style={styles.row}>
                  <span style={styles.plate}>{plate.sourceId}</span>
                  <select
                    className={dirty ? 'cg-field is-dirty' : 'cg-field'}
                    style={{
                      width: 'auto',
                      // §2.1 — STRUCK THROUGH, not greyed. The control stays enabled because
                      // §2.3 accepts the edit; what is communicated is "this value is not in
                      // force", which is a statement about the VALUE and not about the control.
                      ...(masked && { textDecoration: 'line-through' }),
                    }}
                    aria-label={`Input for ${plate.sourceId} in look ${look.name}`}
                    data-look-binding={`${look.id}:${plate.sourceId}`}
                    {...(masked && { 'data-look-binding-masked': '' })}
                    value={value}
                    onChange={(e) =>
                      stageLookBinding(item.itemId, look.id, plate.sourceId, e.target.value)
                    }
                  >
                    <option value="">— template default —</option>
                    {currentSourceCatalog().sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                  {masked && (
                    <>
                      <span style={styles.masked} data-look-binding-patched={plate.sourceId}>
                        not in force — patched to {sourceName(patch)}
                      </span>
                      {/*
                        §2.2 — ENDING THE PATCH IS REACHABLE FROM WHERE IT IS SEEN. It applies
                        IMMEDIATELY rather than staging, and that is deliberate: the patch it
                        undoes was applied immediately too (`R-048` is an on-air emergency, not
                        a draft), so making its removal wait for UPDATE would leave the two
                        halves of one operator decision on different clocks.
                      */}
                      <Button
                        variant="ghost"
                        data-clear-patch={plate.sourceId}
                        title={`Stop patching "${plate.sourceId}" and put this row's per-look inputs back in force`}
                        onClick={() => {
                          void window.cg.stack
                            .swapLiveSource({
                              itemId: item.itemId,
                              plateId: plate.sourceId,
                              sourceId: null,
                            })
                            .then((res) => {
                              if (!res.ok)
                                reportCommandError(res.message ?? 'Could not clear the patch.');
                            });
                        }}
                      >
                        Clear patch
                      </Button>
                    </>
                  )}
                  {dirty && <DraftChip label="unapplied" />}
                  {/*
                    🔴 §2.3 — VISIBLE, not an `aria-label`. `DraftChip` renders the fixed text
                    "● draft" and carries its `label` as an accessible name only, so putting
                    the explanation there would have made it reachable by screen reader and
                    invisible to the operator reading the panel — which is the half §2.3 is
                    actually about. An edit staged under a patch has to SAY what it is waiting
                    for, or it reads as an edit that silently did nothing.
                  */}
                  {dirty && masked && (
                    <span style={styles.masked} data-look-binding-waiting={plate.sourceId}>
                      takes effect when the patch is cleared
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
