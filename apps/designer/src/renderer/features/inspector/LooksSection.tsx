import { deriveLookSources, type Look, type Scene } from '@cg/shared-schema';
import { PencilLine, Star, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { activeLookGroup } from '../../state/slices/looks.js';
import { liveSourceIssues } from '../../state/live-source-preflight.js';
import { CollapseSection } from './CollapseSection.js';
import { InfoTip, StateLine } from './InfoTip.js';
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
 * ── SOURCES — DERIVED FROM THE PLATES, READ-ONLY HERE (`B-188`) ────────────
 *
 * 🔴 **This list used to be an EDITOR and is now a MIRROR, and that is the change.** A group
 * declared its sources here through a `+ Source` field, and every plate had to reference a
 * declared one or go red under `look-source-undeclared`. The list stored what the plates
 * already carried; the export had always reduced it to the used set before the bridge ever saw
 * it. So it is derived instead — the distinct `routeKey`s the plates carry, in document order
 * of first use — and a source now comes into existence by pointing a plate at a key in the
 * Inspector. Nothing here can be edited, because there is nothing here to edit.
 *
 * Two looks whose plates share a key still get the same DEFAULT input: they resolve to one
 * carrier entry, and the seat is decided at RUNTIME by the input each frame is bound to
 * (`live-look-bindings.ts`, which dedupes on the resolved wire argument and never saw the
 * declaration). The operator may still point either look's frame elsewhere.
 *
 * ⚠ The wording _"the same source in two looks is ONE seat held across the switch"_ was
 * corrected by session BM before `B-188` and stays corrected: a shared key promises the same
 * default, not the same seat.
 *
 * ── `DESIGNER-FIX-0905` — WHAT MOVED, AND WHERE ───────────────────────────
 *
 * The section opened with a three-sentence summary (what the group is, how sources come
 * into existence, what a shared key promises) and closed each half with a hint (the order of
 * the list; how a look is authored). All four are TEACHING — read once, ever — and they sat at
 * 0.63–0.66rem across a 320 px column. They live behind the section's `i` now, at reading
 * size; what stays inline is each half's STATE (empty or not) and, first, the refusal block,
 * which is the one thing here that names a blocking condition and is louder for the quiet
 * around it.
 */
export function LooksSection({ scene }: { scene: Scene }): JSX.Element | null {
  const group = activeLookGroup(scene);
  // The section renders only where the group LIVES — the toolbar's multi-frame button
  // creates it; a composition without one (a look's own sub-scene, say) gets no section
  // rather than a second place to create a second group.
  if (group === undefined) return null;
  return (
    <CollapseSection title="Looks" defaultExpanded trailing={<LooksTip />}>
      <IssuesPart scene={scene} />
      <SourcesPart />
      <LooksPart scene={scene} />
    </CollapseSection>
  );
}

/** The group's teaching, said once: what a look is, where sources come from, what a shared key means. */
function LooksTip(): JSX.Element {
  return (
    <InfoTip title="Looks and sources">
      <p>
        A template has <strong>one multi-frame group</strong>. Each <strong>look</strong> in it is a
        full sub-scene — a composition of its own, instanced full-frame in this composition — whose
        plates, titles and decor are authored freely inside it. Exactly one look is on air at a
        time, and the switch between looks is a cut.
      </p>
      <p>
        <strong>Sources are not declared here.</strong> The list is what the plates use: a source
        comes into existence the moment a plate is pointed at a key — typing a name such as “live-1”
        in a plate’s <em>source id</em> box is what creates it — and it disappears when the last
        plate using it stops. The list is in the order the plates first use them; the operator’s
        mappings are keyed by source id, not by position, so they survive the list changing shape.
      </p>
      <p>
        Two looks using the same source start on the same input, and the operator can point either
        one elsewhere.
      </p>
      <p>
        Open a look to author it — its plates and titles are ordinary elements, and the Transform
        panel reads their real geometry. Double-clicking a look on the canvas opens it too. Removing
        a look keeps its composition in the project; it can be made a look again from the list
        below, or deleted in the Compositions panel.
      </p>
    </InfoTip>
  );
}

/**
 * The derived source list — a MIRROR of the plates, in document order of first use.
 *
 * ⚠ **Derived from the PROJECT scene, not from the section's `scene` prop.** The prop is the
 * edit projection of the ACTIVE composition; a look's plates live inside that look's own
 * composition and are reachable only by walking from the project root, which is what
 * `deriveLookSources` does — the same walk, in the same order, the exported carrier is built
 * from, so this list and the operator's list can never disagree.
 */
function SourcesPart(): JSX.Element {
  const projectScene = useDesignerSelector((st) => st.scene);
  const sources = projectScene === null ? [] : deriveLookSources(projectScene);
  return (
    <>
      <p className={cls.groupLabel}>Sources — used by the plates</p>
      {sources.length === 0 && (
        <StateLine tone="text">
          No sources yet — point a plate at one in its “Live Source” panel.
        </StateLine>
      )}
      {sources.map((routeKey) => (
        <div key={routeKey} className={cls.row}>
          <div className={cls.rowHead}>
            <span className={cls.rowName}>{routeKey}</span>
          </div>
        </div>
      ))}
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
      {looks.length === 0 && <StateLine tone="text">No looks yet.</StateLine>}
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
      /*
        ⭐ `B-183` — LISTED HERE BECAUSE THE SPLIT WOULD OTHERWISE SHRINK THIS PANEL.

        A plate pointed at nothing used to arrive as `look-source-undeclared` (its absent
        routeKey read as `""`, which no group declared) and so appeared in this list.
        `B-183` gives that state its own truthful code, and without this line the very
        plate a fresh draw produces would have vanished from the panel the author works in
        — a surface regression hidden inside a message fix.

        ⭐ `B-188` — `look-source-undeclared` is DELETED and no longer listed; the near-miss
        WARNING joins in its place, under its own heading below.
      */
      i.code === 'live-source-unset' ||
      i.code === 'live-source-near-miss' ||
      i.code === 'look-source-duplicate' ||
      i.code === 'look-second-group' ||
      (i.code === 'live-source-overlap' && i.message.includes('look "')),
  );
  /*
    🔴 `B-188` — **ERRORS AND WARNINGS ARE COUNTED AND HEADED SEPARATELY.**

    One list under one "export will refuse" heading would state a falsehood about the near-miss
    nudge, which never blocks anything. A heading that overstates its own severity is how a
    warning gets treated as an error by everyone reading the screen — including whoever later
    "fixes" it by making it one.
  */
  const errors = [...new Set(issues.filter((i) => i.severity === 'error').map((i) => i.message))];
  const warnings = [...new Set(issues.filter((i) => i.severity !== 'error').map((i) => i.message))];
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div role="alert" aria-label="Look issues">
      {errors.length > 0 && (
        <>
          {/* `B-184` — `issueSummary`, not `groupLabel`: this heading states an export REFUSAL and
              is drawn in `danger`, matching the status bar's red count for the same facts. */}
          <p className={cls.issueSummary}>
            {errors.length} issue{errors.length === 1 ? '' : 's'} — export will refuse
          </p>
          {errors.slice(0, 6).map((m) => (
            <p key={m} className={cls.issue}>
              {m}
            </p>
          ))}
          {errors.length > 6 && (
            <p className={cls.hint}>…and {errors.length - 6} more, in the export preflight.</p>
          )}
        </>
      )}
      {warnings.length > 0 && (
        <>
          <p className={cls.groupLabel}>{warnings.length} to check — export is not blocked</p>
          {warnings.slice(0, 6).map((m) => (
            <p key={m} className={cls.hint}>
              {m}
            </p>
          ))}
          {warnings.length > 6 && (
            <p className={cls.hint}>…and {warnings.length - 6} more, in the export preflight.</p>
          )}
        </>
      )}
    </div>
  );
}
