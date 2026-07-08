import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { DraftChip } from '../../ui/DraftChip.js';

/** A stack action's bridge round-trip result (drives the button's async feedback). */
type ActionResult = Promise<{ accepted: boolean; errorCode?: string | undefined }>;

interface Props {
  item: StackItemState;
  selected: boolean;
  /** R-003 — the item has staged-but-unapplied Inspector edits. */
  dirty: boolean;
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
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  subtitle: { fontSize: '0.8rem', color: colors.textMuted },
  actions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
} as const;

/**
 * One operator-facing stack item (Phase 6 §3, restyled R-007):
 *  - `StatusBadge` pill (color + icon + word — never hue alone), incl. the
 *    B-044 UNCONFIRMED state and the transient UPDATING/TAKING spinner.
 *  - Title + `● draft` chip (R-003) + slot subtitle.
 *  - Action buttons — PLAY (on-air primary, renamed from TAKE), UPDATE
 *    (secondary), OUT (caution), REMOVE (danger) — as `AsyncButton`s that show
 *    press → busy → success/error for their own bridge round-trip, decoupled
 *    from the badge's B-044 settlement.
 */
export function StackRow({
  item,
  selected,
  dirty,
  onSelect,
  onPlay,
  onUpdate,
  onOut,
  onRemove,
}: Props): JSX.Element {
  const title = String(item.fields['title'] ?? item.itemId);
  const slot = item.slot ? `slot ${item.slot.channel}-${item.slot.layer}` : 'no slot';
  const onAir = item.status === 'on-air' || item.status === 'playing';

  return (
    <div
      className={`cg-row${selected ? ' is-selected' : ''}`}
      style={styles.row}
      onClick={() => onSelect(item.itemId)}
    >
      <StatusBadge status={item.status} pending={item.pending} />
      <div style={styles.body}>
        <div style={styles.title}>
          {title}
          {dirty && <DraftChip label={`${title} has unapplied edits`} />}
        </div>
        <div style={styles.subtitle}>
          {item.templateId} • {slot}
        </div>
      </div>
      {/* Stop button clicks from also selecting the row (prior behavior). */}
      <div style={styles.actions} onClick={(e) => e.stopPropagation()}>
        <AsyncButton variant="play" run={() => onPlay(item.itemId)} disabled={onAir}>
          PLAY
        </AsyncButton>
        <AsyncButton variant="secondary" run={() => onUpdate(item.itemId)} disabled={!onAir}>
          UPDATE
        </AsyncButton>
        <AsyncButton
          variant="caution"
          run={() => onOut(item.itemId)}
          disabled={item.status === 'idle' || item.status === 'loaded'}
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
