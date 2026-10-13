import type { LucideIcon } from 'lucide-react';
import { STATION_SETUP_PX } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';

/**
 * 🔴 `SETTINGS-POLISH-04` §4 — **A SECTION'S STANDING NOTICE**, the reference's `.notice`.
 *
 * ── WHY IT IS NOT THE PINNED MESSAGE REGION, WHICH IS WHERE IT USED TO LIVE ──────────────
 *
 * `AUDIT-CLOSE-01` delta A gave the modal's pinned region ONE job: answering *"why did the
 * last action not happen?"* — an EVENT, pinned beside the button that produced it, because a
 * refusal the operator has to scroll for is a refusal he does not read. That rule is intact
 * and this band does not touch it.
 *
 * What was wrong is that `Server changes are paused while on air` is not an event. It is TRUE
 * before he presses anything, it is true while he types, and it does not change in response to
 * any act — it is a standing fact the section states about ITSELF, which is the distinction
 * `B-239` drew for the footer's contract sentence and `controls.css`'s `.cg-setup-notice` has
 * carried a comment about ever since. The class existed; nothing rendered it.
 *
 * ── WHERE IT GOES, MEASURED OFF THE DRAWING ──────────────────────────────────────────────
 *
 * The reference emits exactly one `.notice`, on its Servers pane, as a NORMAL BLOCK in the
 * pane's flow: `.section-head` → `.notice` → the first `.card`, with `margin-bottom:21px`. Its
 * left and right edges are the cards' — it is content, inset like content, and scrolls with
 * it. Not pinned, not above the head, not spanning the pane's gutters.
 *
 * ⚠ **THE BLOCK AND THE REFUSAL ARE BOTH STILL SHOWN, in two places, on purpose.** This band
 * says WHY and names the remedy; the footer's clause says whether the press is available; the
 * pinned region stays empty until an actual act is refused. Three lifetimes, three homes — and
 * `isBlocked` is unchanged, so nothing about WHEN a commit is refused moved with the sentence.
 */
export interface SetupNoticeSpec {
  /** The bold line — what is in force. One short sentence, read from across the room. */
  readonly title: string;
  /** The quieter explanation under it, which must name the REMEDY (`SETTINGS-MATCH-02` §9a). */
  readonly body: string;
  /** The mark beside it — a padlock for a block, an info glyph for a plain standing fact. */
  readonly icon: LucideIcon;
}

/**
 * ⚠ **NOT a `role="alert"` and not a live region.** The same rule the pinned region follows
 * (`§9d`): this is rendered at rest, announcing nothing, and a band that shouts on every tab
 * switch is the defect an alert role would introduce here. It is a paragraph with a heading.
 */
export function SetupNotice({ spec }: { spec: SetupNoticeSpec }): JSX.Element {
  return (
    <div className="cg-setup-notice" data-setup-notice="">
      <Icon icon={spec.icon} size={STATION_SETUP_PX.noticeIcon} />
      <div>
        <strong className="cg-setup-notice__title">{spec.title}</strong>
        <p className="cg-setup-notice__body">{spec.body}</p>
      </div>
    </div>
  );
}
