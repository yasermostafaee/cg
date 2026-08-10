import type { CSSProperties } from 'react';
import { colors } from '../theme.js';

/**
 * THE ONE SPELLING OF A MESSAGE TREATMENT IN THE RUNTIME.
 *
 * Before this there were five, all local, and two of them were illegible. Measured
 * against the modal surface (`chrome.panel` `#111827`):
 *
 * | where                                    | foreground | ratio     |
 * | ---------------------------------------- | ---------- | --------- |
 * | `SourcesModal` `styles.error`            | `#991B1B`  |  2.13:1 ✗ |
 * | `DelimitersModal` `styles.error`         | `#991B1B`  |  2.13:1 ✗ |
 * | `ServerSettingsPanel` `styles.error`     | `#991B1B`  |  2.13:1 ✗ |
 * | `ServerSettingsPanel` `styles.blocked`   | `#FCA5A5`  |  8.66:1   |
 * | `FixedBankConfigModal` `styles.refusal`  | `#FCD34D`  | 11.21:1   |
 *
 * `#991B1B` is `colors.error`, and it is a BACKGROUND colour in this palette — the
 * command toast, the connection banner and the raster banner all fill with it and
 * put white on top. Used as a FOREGROUND on a dark panel it measures 2.13:1, which
 * is below even the 3:1 large-text floor: that is the owner's report, and it was
 * three independent copies of the same mistake rather than one.
 *
 * ── NO NEW COLOUR IS INTRODUCED HERE ────────────────────────────────────────
 *
 * `refusal` is `FixedBankConfigModal`'s treatment, moved rather than redesigned —
 * the same border, the same 12% amber fill, the same `#FCD34D`. It measures
 * 11.21:1. The red spellings are DELETED, not replaced by a second red: per
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
    border: '1px solid #B45309',
    background: 'rgba(180, 83, 9, 0.12)',
    color: '#FCD34D',
  },
  notice: {
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    color: colors.text,
  },
};

/**
 * The quieter second line — the bridge's own sentence, which names the layer or
 * both ranges while the first line carries the rule.
 *
 * It was `colors.textMuted` inside the amber box. The hierarchy now comes from SIZE
 * and not from a grey that has to survive an unusual backdrop: `colors.text` on the
 * amber fill measures 13.06:1, `colors.textMuted` on the neutral fill 5.78:1. Both
 * clear AA, which the old pairing did only by luck of the backdrop it happened to
 * sit on.
 */
const DETAIL_COLOR: Record<NoticeRole, string> = {
  refusal: colors.text,
  notice: colors.textMuted,
};

const base: CSSProperties = {
  borderRadius: '0.25rem',
  padding: '0.5rem 0.7rem',
  fontSize: '0.85rem',
  lineHeight: 1.45,
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
