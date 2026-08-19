import { useState } from 'react';
import { LiveSourceIdSchema, type Look, type Scene } from '@cg/shared-schema';
import { PencilLine, Star, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { activeLookGroup } from '../../state/slices/looks.js';
import { liveSourceIssues } from '../../state/live-source-preflight.js';
import { CollapseSection } from './CollapseSection.js';
import { TextField } from './controls.js';
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
      <IssuesPart scene={scene} />
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

/**
 * The LOOKS half: the list, the default, and the door into each sub-scene.
 *
 * `entered` is shown as a fixed word, not a control: v1 is CUT-ONLY (D2's other modes
 * are parked with the animated phase, `design.md` §14.4) — offering a picker over one
 * value would be a control that cannot do anything.
 */
function LooksPart({ scene }: { scene: Scene }): JSX.Element {
  const activeId = useDesignerSelector((st) => st.activeLookId);
  const group = activeLookGroup(scene);
  const looks = group?.looks ?? [];
  return (
    <>
      <p className={cls.groupLabel}>Looks — entered with a cut</p>
      {looks.length === 0 && (
        <p className={cls.empty}>
          No looks yet. A look is a full sub-scene — its plates, titles and decor are authored
          freely inside it, and exactly one look is on air at a time (the switch is a cut).
        </p>
      )}
      {looks.map((look) => (
        <LookRow
          key={look.id}
          look={look}
          active={look.id === (activeId ?? group?.defaultLookId)}
          isDefault={look.id === group?.defaultLookId}
        />
      ))}
      <div className={cls.addRow}>
        <Button
          variant="secondary"
          onClick={() => designerStore.addLook()}
          title="Add a look — a new sub-scene composition, instanced full-frame"
        >
          + Look
        </Button>
      </div>
      {looks.length > 0 && (
        <p className={cls.hint}>
          Open a look to author it — its plates and titles are ordinary elements, and the Transform
          panel reads their real geometry. Double-clicking a look on the canvas opens it too.
        </p>
      )}
    </>
  );
}

function LookRow({
  look,
  active,
  isDefault,
}: {
  look: Look;
  active: boolean;
  isDefault: boolean;
}): JSX.Element {
  return (
    <div className={active ? cls.rowActive : cls.row}>
      <div className={cls.rowHead}>
        <Button
          variant="bare"
          className={cls.rowName}
          aria-pressed={active}
          onClick={() => designerStore.setActiveLook(look.id)}
          title="Show this look on the canvas"
        >
          {look.name}
        </Button>
        <Button
          variant="bare"
          aria-pressed={isDefault}
          disabled={isDefault}
          onClick={() => designerStore.setDefaultLook(look.id)}
          title={
            isDefault ? 'The look a fresh take enters' : 'Make this the look a fresh take enters'
          }
          aria-label={
            isDefault ? `${look.name} is the default look` : `Make ${look.name} the default look`
          }
        >
          <Icon icon={Star} size={13} />
        </Button>
        <Button
          variant="bare"
          onClick={() => designerStore.editLookContents(look.id)}
          title="Open this look and author its contents"
          aria-label={`Edit contents of ${look.name}`}
        >
          <Icon icon={PencilLine} size={13} />
        </Button>
        <Button
          variant="bare"
          onClick={() => designerStore.removeLook(look.id)}
          title="Remove this look — its sub-scene composition stays in the project"
          aria-label={`Remove look ${look.name}`}
        >
          <Icon icon={Trash2} size={13} />
        </Button>
      </div>
      {active && (
        <div className={cls.rowBody}>
          <TextField
            label="name"
            ariaLabel={`Look name`}
            value={look.name}
            resetKey={look.id}
            onCommit={(v) => designerStore.renameLook(look.id, v)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The LOOKS refusal family, surfaced WHERE THE AUTHOR WORKS — the same preflight the
 * export runs (`liveSourceIssues`), filtered to this family, so a refusal is met while
 * authoring rather than at the export dialog (the wrong end of the process). FIRST in
 * the section: guidance that scrolls off under the fields is present and unreadable
 * (the AX lesson).
 */
function IssuesPart({ scene }: { scene: Scene }): JSX.Element | null {
  const issues = liveSourceIssues(scene).filter(
    (i) =>
      i.code === 'look-source-undeclared' ||
      i.code === 'look-source-duplicate' ||
      i.code === 'look-second-group' ||
      (i.code === 'live-source-overlap' && i.message.includes('look "')),
  );
  const unique = [...new Set(issues.map((i) => i.message))];
  if (unique.length === 0) return null;
  return (
    <div role="alert" aria-label="Look issues">
      <p className={cls.groupLabel}>
        {unique.length} issue{unique.length === 1 ? '' : 's'} — export will refuse
      </p>
      {unique.slice(0, 6).map((m) => (
        <p key={m} className={cls.issue}>
          {m}
        </p>
      ))}
      {unique.length > 6 && (
        <p className={cls.hint}>…and {unique.length - 6} more, in the export preflight.</p>
      )}
    </div>
  );
}
