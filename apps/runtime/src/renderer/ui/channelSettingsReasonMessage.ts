import type { CHANNEL_SETTINGS_SET_REASONS } from '@cg/shared-ipc';

/**
 * `R-030` / `STATION-SETUP-02` §5 — operator wording for a refused `channelSettings.set`,
 * keyed off the wire contract's OWN reason union so a new refusal code cannot ship without
 * a sentence here (`fixedLayersReasonMessage.ts` is the precedent, and the reason it sits
 * beside rather than inside `errorCodeMessage.ts` applies here too: a different channel
 * family, a different vocabulary).
 *
 * These carry the RULE; the bridge's `message` carries the SPECIFICS (how many rows are on
 * air, which channels are declared), and the raster section shows both.
 */
type ChannelSettingsSetReason = (typeof CHANNEL_SETTINGS_SET_REASONS)[number];

const MESSAGES = {
  'on-air-block':
    'The raster cannot change while anything is on air — it re-scales every graphic on the channel. Take the rows off air first (Clear All keeps them).',
  'unknown-channel': 'That channel is not one this install declares, so it has no raster to set.',
} satisfies Record<ChannelSettingsSetReason, string>;

/** The operator sentence for a refusal reason; an unknown code surfaces verbatim, never swallowed. */
export function channelSettingsReasonMessage(reason: string | undefined): string | null {
  if (reason === undefined || reason === '') return null;
  return (MESSAGES as Readonly<Record<string, string>>)[reason] ?? `Not accepted (${reason}).`;
}
