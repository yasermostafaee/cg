import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { useLink } from '../../hooks/useLink.js';
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
 *    (secondary), OUT (caution), REMOVE (danger) — as `AsyncButton`s that show
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
  const link = useLink();
  const linkDown = link === 'disconnected';
  const simulated = link === 'offline-mock';
  const offlineReason = linkDown
    ? 'Not connected — this command cannot reach CasparCG. Reconnect and reissue it.'
    : undefined;

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
    >
      {/* R-006 — in test mode an air-claim is badged SIM, never the broadcast red. */}
      <StatusBadge status={item.status} pending={item.pending} simulated={simulated} />
      <div style={styles.body} title={item.templateId}>
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
        <AsyncButton
          variant="play"
          run={() => onPlay(item.itemId)}
          disabled={onAir || linkDown}
          {...(offlineReason !== undefined ? { title: offlineReason } : {})}
        >
          PLAY
        </AsyncButton>
        <AsyncButton
          variant="secondary"
          run={() => onUpdate(item.itemId)}
          disabled={!onAir || linkDown}
          {...(offlineReason !== undefined ? { title: offlineReason } : {})}
        >
          UPDATE
        </AsyncButton>
        <AsyncButton
          variant="caution"
          run={() => onOut(item.itemId)}
          // The same `isOnAir` predicate the header's Clear-All counts on, so the two can
          // never disagree about what "on air" means.
          disabled={!isOnAir(item) || linkDown}
          {...(offlineReason !== undefined ? { title: offlineReason } : {})}
        >
          OUT
        </AsyncButton>
        <AsyncButton variant="danger" run={() => onRemove(item.itemId)}>
          REMOVE
        </AsyncButton>
      </div>
    </div>
  );
}
