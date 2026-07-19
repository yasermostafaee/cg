import type { StackItemState, StackItemStatus } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { ContextMenu } from '../../ui/ContextMenu.js';
import { useContextMenu } from '../../ui/useContextMenu.js';
import { toMenuItems, type RowAction } from '../../ui/rowAction.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { useLink } from '../../hooks/useLink.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { layerLabel } from './layerLabel.js';
import { isOnAir } from './onAir.js';

/** A stack action's bridge round-trip result (drives the button's async feedback). */
type ActionResult = Promise<{ accepted: boolean; errorCode?: string | undefined }>;

interface Props {
  item: StackItemState;
  selected: boolean;
  /** R-003 — the item has staged-but-unapplied Inspector edits. */
  dirty: boolean;
  /**
   * R-004 — the template's operator-facing label, joined from the registry by the panel.
   * Absent only while the index is still resolving, or for a template the registry has
   * forgotten.
   */
  templateLabel?: string | undefined;
  onSelect: (itemId: string) => void;
  onPlay: (itemId: string) => ActionResult;
  onUpdate: (itemId: string) => ActionResult;
  /**
   * C-012 — the graceful stop (outro runs, producer stays resident). Distinct from
   * `onOut`, whose CLEAR destroys the producer.
   */
  onStop: (itemId: string) => ActionResult;
  onOut: (itemId: string) => ActionResult;
  onRemove: (itemId: string) => ActionResult;
}

const styles = {
  row: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr auto',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    minWidth: 0,
  },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  subtitle: { fontSize: '0.8rem', color: colors.textMuted },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
} as const;

/**
 * One operator-facing stack item (Phase 6 §3, restyled R-007):
 *  - `StatusBadge` pill (color + icon + word — never hue alone), incl. the
 *    B-044 UNCONFIRMED state and the transient UPDATING/TAKING spinner.
 *  - Template label + `● draft` chip (R-003), over a content/slot subtitle.
 *  - Action buttons — PLAY (on-air primary, renamed from TAKE), UPDATE
 *    (secondary), CLEAR (caution — it sends `CLEAR`, so it says so; renamed from
 *    OUT), REMOVE (danger) — as `AsyncButton`s that show
 *    press → busy → success/error for their own bridge round-trip, decoupled
 *    from the badge's B-044 settlement.
 */
export function StackRow({
  item,
  selected,
  dirty,
  templateLabel,
  onSelect,
  onPlay,
  onUpdate,
  onStop,
  onOut,
  onRemove,
}: Props): JSX.Element {
  // R-004 — the row is labelled by its TEMPLATE, never by a UUID. It used to read
  // `fields['title'] ?? item.itemId`: a field most templates do not have, falling back to
  // `item-<uuid>`, with the raw `templateId` printed underneath. Two identifiers, no name.
  //
  // The item's own `title` field, when the template has one, is the CONTENT — the only
  // thing that tells two rows of the same template apart — so it rides the secondary line.
  // The `templateId` is a correlation key: reachable as a tooltip, never rendered as text.
  const rawTitle = item.fields['title'];
  const contentTitle = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const label = templateLabel ?? 'Unnamed template';
  const layer = layerLabel(item.slot);
  const onAir = item.status === 'on-air' || item.status === 'playing';

  // R-006 — the UI mirrors the bridge's connection refusal instead of inviting a command it
  // knows will be refused. The bridge stays authoritative (it refuses regardless); this only
  // stops the operator from believing a click did something. Test mode is deliberately NOT
  // gated — simulating the on-air verbs is the whole point of it, and the TEST MODE banner
  // makes it impossible to mistake for air.
  const { menu, open, close } = useContextMenu<string>();
  const link = useLink();
  const linkDown = link === 'disconnected';
  const simulated = link === 'offline-mock';
  const offlineReason = linkDown
    ? 'Not connected — this command cannot reach CasparCG. Reconnect and reissue it.'
    : undefined;

  // B-087 — while the SPA↔bridge link is down, mask a frozen on-air claim to the muted
  // `unverified` "WAS ON AIR" B-086 already defines. The demotion B-086 does in the bridge
  // reconciler cannot fire here (it's delivered over `StackStateChanged`, and a dead bridge sends
  // nothing), and `useBridgeSnapshot` freezes the last snapshot on `disconnected` — so without this
  // the row would keep rendering the sacred red ● ON AIR the wire can no longer back. Purely a
  // display mask over frozen data (the `onAir` predicate mirrors B-086's reconciler override);
  // reconnect re-pulls the authoritative status and the mask lifts on its own. Mirrors the
  // `useLink()` override the health pills / LinkIndicator / ConnectionBanner already apply.
  const badgeStatus: StackItemStatus = linkDown && onAir ? 'unverified' : item.status;

  // B-093 — WHY is this row unverified? The two causes need opposite words. The bridge
  // publishes the cause on the item itself (`errorCode`, a field that already rides
  // `StackItemState`), so the row reads it directly — no extra subscription per row, and
  // no new IPC.
  const oscBlind = badgeStatus === 'unverified' && item.errorCode === 'osc-unverifiable';

  // The row's four actions, declared ONCE. The buttons below render from this list and the
  // right-click menu is projected from the SAME list, so a menu item is enabled exactly when
  // its button is and runs exactly what its button runs — by construction, not by two code
  // paths agreeing. Every gate here is the one that was already on the button; the menu adds
  // no capability and no new door onto air (R-006).
  const actions: RowAction[] = [
    {
      key: 'play',
      label: 'PLAY',
      variant: 'play',
      disabled: onAir || linkDown,
      title: offlineReason,
      run: () => onPlay(item.itemId),
      onError: reportCommandError,
    },
    {
      key: 'update',
      label: 'UPDATE',
      // The ON-AIR family. UPDATE changes what is on air RIGHT NOW, so it must not
      // wear the cool accent the neutral staging controls use (Load, Apply position,
      // Add item) — those touch nothing live. `air` is the on-air hue as an OUTLINE:
      // it says "this reaches air" while leaving the SOLID red to PLAY, the one
      // control that puts a graphic on air.
      variant: 'air',
      disabled: !onAir || linkDown,
      title: offlineReason,
      run: () => onUpdate(item.itemId),
      // `applyDraft` (the shared apply used by this action AND the Inspector's Update) already
      // routes any failure to the command toast with its own B-070 wording; this no-op only
      // SUPPRESSES a duplicate report — it does not swallow the feedback.
      onError: () => undefined,
    },
    {
      key: 'stop',
      label: 'STOP',
      variant: 'caution',
      // C-012 — the GRACEFUL exit: the template runs its own outro and the producer
      // stays resident, so PLAY resumes it with no re-load. Gated on the same
      // `isOnAir` predicate CLEAR uses — you can only stop something that may be
      // showing — so the two never disagree about what "on air" means, and it is
      // link-gated like every other on-air-affecting verb (R-006).
      disabled: !isOnAir(item) || linkDown,
      title: offlineReason,
      run: () => onStop(item.itemId),
      onError: reportCommandError,
    },
    {
      key: 'clear',
      label: 'CLEAR',
      // The destructive half of the EXIT family. STOP and CLEAR both take a graphic
      // off air and must not look alike — STOP leaves the producer resident
      // (recoverable), CLEAR destroys it. Same amber hue so they read as one family;
      // FILLED against STOP's outline so the heavier consequence carries the heavier
      // weight.
      variant: 'caution-strong',
      // The same `isOnAir` predicate the header's Clear-All counts on, so the two can never
      // disagree about what "on air" means. Deliberately NOT the `onAir` above: they differ.
      disabled: !isOnAir(item) || linkDown,
      title: offlineReason,
      run: () => onOut(item.itemId),
      onError: reportCommandError,
    },
    {
      key: 'remove',
      label: 'REMOVE',
      variant: 'danger',
      // B-085 — gated on `linkDown` like PLAY/UPDATE/CLEAR. The STACK is bridge-owned playout
      // state (only the LIBRARY moved browser-local), so removing a stack item genuinely
      // needs the bridge.
      disabled: linkDown,
      title: offlineReason,
      run: () => onRemove(item.itemId),
      onError: reportCommandError,
    },
  ];

  return (
    <div
      className={`cg-row${selected ? ' is-selected' : ''}`}
      style={styles.row}
      // R-004 — the row's stable anchor is the ID, never the visible label: the row no longer
      // PRINTS its templateId (a UUID is not an operator-facing label), and labels are not
      // unique anyway — two templates may legitimately share one. Anything that must address
      // a specific row keys on these.
      data-template-id={item.templateId}
      data-item-id={item.itemId}
      onClick={() => onSelect(item.itemId)}
      // Right-click opens the same four actions as a menu. It deliberately does NOT select
      // the row: right-click must not retarget the Inspector under the operator's edits.
      onContextMenu={(e) => open(e, item.itemId)}
    >
      {/* R-006 — in test mode an air-claim is badged SIM, never the broadcast red.
          B-087 — on a dead SPA↔bridge link the on-air claim is masked to muted "WAS ON AIR"
          (`badgeStatus`), and `bridgeDown` tells the badge to name the bridge (not CasparCG) link. */}
      <StatusBadge
        status={badgeStatus}
        pending={item.pending}
        simulated={simulated}
        bridgeDown={linkDown}
        oscBlind={oscBlind}
      />
      {/* The row's label area — and the one part of the row that is guaranteed NOT to be a
          control. Tests select a row by clicking THIS, never the row root: the root spans the
          action buttons too, and a click on the root's geometric centre lands wherever the
          grid happens to put it. */}
      <div style={styles.body} title={item.templateId} data-row-body="">
        <div style={styles.title}>
          <span style={styles.name}>{label}</span>
          {dirty && <DraftChip label={`${label} has unapplied edits`} />}
        </div>
        <div style={styles.subtitle}>
          {contentTitle !== '' ? `${contentTitle} • ${layer}` : layer}
        </div>
      </div>
      {/* Stop button clicks from also selecting the row (prior behavior). */}
      <div style={styles.actions} onClick={(e) => e.stopPropagation()}>
        {/* A refusal surfaces as the command TOAST, never pinned inline in the row (which
            wrapped and bloated it). Same treatment as the Library's Load button. */}
        {actions.map((action) => (
          <AsyncButton
            key={action.key}
            variant={action.variant}
            run={action.run}
            disabled={action.disabled}
            onError={action.onError}
            {...(action.title !== undefined ? { title: action.title } : {})}
          >
            {action.label}
          </AsyncButton>
        ))}
      </div>
      {menu !== null && (
        <ContextMenu
          items={toMenuItems(actions)}
          x={menu.x}
          y={menu.y}
          ariaLabel={`${label} actions`}
          onClose={close}
        />
      )}
    </div>
  );
}
