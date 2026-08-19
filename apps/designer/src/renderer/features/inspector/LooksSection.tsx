import { useState } from 'react';
import { LiveSourceIdSchema, type Scene } from '@cg/shared-schema';
import { Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { designerStore } from '../../state/store.js';
import { activeLookGroup } from '../../state/slices/looks.js';
import { CollapseSection } from './CollapseSection.js';
import * as cls from './LooksSection.css.js';

/**
 * ⭐ **LOOKS phase 2 (`design.md` §14, `D-152`) — the multi-frame group's section.**
 *
 * Sits in the RIGHT PANEL beside Playout, because the group is a property of the
 * COMPOSITION. The ACTIVE-look selector deliberately does NOT live here — the panel
 * switches to element properties the moment the author selects something, so the
 * selector sits in the canvas header (the `ArrangementPicker` precedent).
 *
 * ── SOURCES — DECLARED ONCE, the load-bearing half ──────────────────────────
 *
 * This list is the identity mechanism: a plate in any look REFERENCES one of these
 * declared sources through a picker, so the same source in two looks is ONE seat held
 * across the switch. The routeKey is FIXED at declaration (no in-place rename): a
 * rename would have to rewrite every referencing plate in every look, and a missed one
 * is a dangling reference that surfaces only at export. Removal is always allowed —
 * plates left referencing a removed source are named ONE BY ONE by the export
 * preflight (`look-source-undeclared`), which is the surface built for that news.
 */
export function LooksSection({ scene }: { scene: Scene }): JSX.Element | null {
  const group = activeLookGroup(scene);
  // The section renders only where the group LIVES — the toolbar's multi-frame button
  // creates it; a composition without one (a look's own sub-scene, say) gets no section
  // rather than a second place to create a second group.
  if (group === undefined) return null;
  return (
    <CollapseSection title="Looks" defaultExpanded>
      <p className={cls.summary}>
        One multi-frame group: sources are declared ONCE here, and every look references them — the
        same source in two looks is one seat, held across the switch.
      </p>
      <SourcesPart sources={group.sources} />
      <LooksPart scene={scene} />
    </CollapseSection>
  );
}

function SourcesPart({
  sources,
}: {
  sources: readonly { routeKey: string; dynamic: boolean }[];
}): JSX.Element {
  const [draft, setDraft] = useState('');
  const commit = (): void => {
    const value = draft.trim();
    if (value === '') return;
    if (!LiveSourceIdSchema.safeParse(value).success) {
      designerStore.showNotice(
        `“${value}” is not a Live Source id. Use letters, digits, “_” and “-”, starting ` +
          'with a letter or digit — a template names sources SYMBOLICALLY (e.g. “live-1”).',
      );
      return;
    }
    if (sources.some((s) => s.routeKey === value)) {
      designerStore.showNotice(
        `“${value}” is already declared. A group declares each source ONCE — reference it ` +
          'from as many looks as you like; that is the point.',
      );
      return;
    }
    designerStore.addLookSource(value);
    setDraft('');
  };
  return (
    <>
      <p className={cls.groupLabel}>Sources — declared once</p>
      {sources.length === 0 && (
        <p className={cls.empty}>
          No sources yet. Declare each live input ONCE (e.g. “live-1”); plates in every look then
          reference a declared source.
        </p>
      )}
      {sources.map((s) => (
        <div key={s.routeKey} className={cls.row}>
          <div className={cls.rowHead}>
            <span className={cls.rowName}>{s.routeKey}</span>
            <Button
              variant="bare"
              onClick={() => designerStore.removeLookSource(s.routeKey)}
              title={`Remove “${s.routeKey}” — plates still referencing it are named by the export preflight`}
              aria-label={`Remove source ${s.routeKey}`}
            >
              <Icon icon={Trash2} size={13} />
            </Button>
          </div>
        </div>
      ))}
      <div className={cls.addRow}>
        <div className={`cg-field ${cls.addField}`}>
          <input
            type="text"
            value={draft}
            placeholder="live-1"
            aria-label="New source id"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
        </div>
        <Button variant="secondary" onClick={commit} title="Declare this source on the group">
          + Source
        </Button>
      </div>
    </>
  );
}

/** The looks half — grown in step 3 (list, default, edit-contents). */
function LooksPart({ scene }: { scene: Scene }): JSX.Element {
  const group = activeLookGroup(scene);
  const count = group?.looks.length ?? 0;
  return (
    <>
      <p className={cls.groupLabel}>Looks</p>
      {count === 0 && (
        <p className={cls.empty}>
          No looks yet. A look is a full sub-scene — its plates, titles and decor are authored
          freely, and exactly one look is on air at a time (the switch is a cut).
        </p>
      )}
    </>
  );
}
