import type { CSSProperties } from 'react';
import { colors, cssVars } from '../theme.js';

/**
 * THE ONE SPELLING OF A MESSAGE TREATMENT IN THE RUNTIME.
 *
 * Before this there were five, all local, and two of them were illegible.
 *
 * ⚠ RE-MEASURED IN `RUNTIME-REDESIGN-01` PHASE 2, when the modal surface moved to the
 * reference's ground. Each row now NAMES what it is measured against — the old table
 * said "the modal surface" for all five while two of its numbers were in fact against
 * other grounds, which is the failure a table of ratios is least able to show.
 *
 * | where                                   | foreground | on             | ratio     |
 * | --------------------------------------- | ---------- | -------------- | --------- |
 * | `SourcesModal` `styles.error`           | `#991B1B`  | `--r-surface`  |  2.08:1 ✗ |
 * | `DelimitersModal` `styles.error`        | `#991B1B`  | `--r-surface`  |  2.08:1 ✗ |
 * | `ServerSettingsPanel` `styles.error`    | `#991B1B`  | `--r-surface`  |  2.08:1 ✗ |
 * | `ServerSettingsPanel` `styles.blocked`  | `#ffaaa7`  | `--r-surface`  |  9.53:1   |
 * | `FixedBankConfigModal` `styles.refusal` | `#f3cd88`  | the amber fill | 10.39:1   |
 *
 * `#991B1B` is `colors.error`, and it is a BACKGROUND colour in this palette — the
 * command toast, the connection banner and the raster banner all fill with it and
 * put white on top. Used as a FOREGROUND on a dark panel it measures 2.08:1, which
 * is below even the 3:1 large-text floor: that is the owner's report, and it was
 * three independent copies of the same mistake rather than one.
 *
 * ── NO NEW COLOUR IS INTRODUCED HERE ────────────────────────────────────────
 *
 * `refusal` is `FixedBankConfigModal`'s treatment, moved rather than redesigned —
 * the same border, the same 12% amber fill, the same `--r-caution-text`. It measures
 * 10.39:1. The red spellings are DELETED, not replaced by a second red: per
 * `theme.ts`, red means error or destructive intent, and a refusal is neither. It
 * is the palette's ATTENTION case, which is amber — the hue `pending`, `OCCUPIED`
 * and `UNKNOWN` already carry.
 *
 * `notice` is the neutral statement — "Applied. All listeners remain
 * loopback-only." — and it must NOT be amber: dressing a success as a warning is
 * the same class of error as spending a destructive colour on a save button.
 *
 * ── WHY A COMPONENT AND NOT A STYLE OBJECT ──────────────────────────────────
 *
 * An exported style object is copied; a component is consumed. This mirrors
 * `Button` under `ModalAction`: the ROLE decides the treatment and the table is the
 * only place the treatment is written down.
 *
 * `text` and `detail` are STRINGS, not `ReactNode`. That is the constraint, not an
 * oversight — a node can carry a `style`, and the whole defect being closed here is
 * a message that arrived carrying its own.
 */
export type NoticeRole = 'refusal' | 'notice';

const ROLE_STYLE: Record<NoticeRole, CSSProperties> = {
  refusal: {
    border: `1px solid ${cssVars['--r-notice-line']}`,
    background: cssVars['--r-notice-fill'],
    color: cssVars['--r-caution-text'],
  },
  /*
    `RUNTIME-REDESIGN-01` Phase 9 — the reference's PLAIN `.notice` pair, which is what a
    neutral statement looks like in the approved design. It used to borrow the panel's own
    surface and border, which made a notice indistinguishable from a panel.
  */
  notice: {
    border: `1px solid ${cssVars['--r-notice-neutral-line']}`,
    background: cssVars['--r-notice-neutral-bg'],
    color: cssVars['--r-notice-neutral-text'],
  },
};

/**
 * The quieter second line — the bridge's own sentence, which names the layer or
 * both ranges while the first line carries the rule.
 *
 * It was `colors.textMuted` inside the amber box. The hierarchy now comes from SIZE
 * and not from a grey that has to survive an unusual backdrop: `colors.text` on the
 * amber fill measures 12.18:1, `colors.textMuted` on the neutral fill 5.55:1. Both
 * clear AA, which the old pairing did only by luck of the backdrop it happened to
 * sit on. (Re-measured in Phase 9 on the reference's pairs; Phase 2 read 14.07:1 and
 * 5.64:1 on the previous fills.)
 */
const DETAIL_COLOR: Record<NoticeRole, string> = {
  refusal: colors.text,
  notice: colors.textMuted,
};

/*
  `RUNTIME-REDESIGN-01` Phase 9 — the reference's `.notice` box as rendered: `13px 15px`,
  radius 8, 13 px on a 1.6 line (`NOTICE_PX` in the token home). The two lines stack, so the
  reference's icon-to-text gap is not what `gap` means here; the inter-line gap stays small.
*/
const base: CSSProperties = {
  borderRadius: cssVars['--r-notice-radius'],
  padding: cssVars['--r-notice-pad'],
  fontSize: cssVars['--r-notice-fs'],
  lineHeight: cssVars['--r-notice-lh'],
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
};

/**
 * A message box, in the one treatment its role earns.
 *
 * `aria` is the ANNOUNCEMENT channel and is independent of the colour — the
 * Designer's `Callout` learned that the hard way (#352 recoloured a banner and
 * silently dropped it out of the alert channel, because the role had been derived
 * from the variant). A refusal defaults to `alert` because it is always the
 * consequence of something the operator just did; a standing note about the
 * configuration being edited passes `note` and is not announced.
 *
 * `dir="auto"` on both lines: these strings sit beside Persian content and a
 * bridge's message may itself be Persian, so the paragraph direction follows the
 * text rather than the chrome.
 */
export function Notice({
  /*
    NAMED `noticeRole` AND NOT `role`, for the reason `ModalAction` records one file
    over: `role` is the ARIA attribute. A prop of that name on a component that puts
    a real `role` on its `<div>` is one refactor away from emitting
    `role="refusal"` — an invalid ARIA role — and the a11y lint flags every call
    site meanwhile (it did, immediately, when this was written as `role`). The
    concept is still THE ROLE; only the prop name gets out of ARIA's way.
  */
  noticeRole,
  text,
  detail,
  aria,
}: {
  noticeRole: NoticeRole;
  text: string;
  detail?: string;
  aria?: 'alert' | 'status' | 'note';
}): JSX.Element {
  return (
    <div
      style={{ ...base, ...ROLE_STYLE[noticeRole] }}
      data-notice={noticeRole}
      role={aria ?? (noticeRole === 'refusal' ? 'alert' : 'status')}
    >
      <span dir="auto">{text}</span>
      {detail !== undefined && detail !== '' && (
        <span dir="auto" style={{ color: DETAIL_COLOR[noticeRole], fontSize: '0.8rem' }}>
          {detail}
        </span>
      )}
    </div>
  );
}
