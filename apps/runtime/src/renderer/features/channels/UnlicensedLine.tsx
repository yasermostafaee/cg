import { Notice } from '../../ui/Notice.js';
import { UNLICENSED_LINE, unlicensedChannels } from './channelAir.js';
import { inScope } from './channelSignals.js';
import { useChannelAirs } from './useSelectedChannel.js';

/**
 * 🔴 `UI-POLISH-01` G — **AN UNLICENSED CHANNEL'S ONE LINE, in that channel's view only.**
 *
 * The Playout clears an unlicensed channel every minute, our layers with it (V13 §1.2), so this is
 * ATTENTION — the amber `refusal` treatment `Notice` records — and channel-scoped by the
 * `MULTI-CHANNEL-01` L rule: another channel's view shows only the amber mark on this channel's tab
 * (`App`'s `signals`, from the same {@link unlicensedChannels}). `scope` is `null` on a station
 * with one channel, where nothing is filtered.
 */
export function UnlicensedLine({ scope }: { scope: number | null }): JSX.Element | null {
  const airs = useChannelAirs();
  const channels = inScope(unlicensedChannels(airs), (channel) => channel, scope);
  if (channels.length === 0) return null;
  return (
    <div className="cg-channel-air-line" data-unlicensed-line={channels.map(String).join(',')}>
      <Notice noticeRole="refusal" aria="status" text={UNLICENSED_LINE} />
    </div>
  );
}
