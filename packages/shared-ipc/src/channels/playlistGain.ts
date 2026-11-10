import { z } from 'zod';
import { defineChannel } from '../channel.js';

export const PLAYLIST_GAIN_MIN_DB = -60;
export const PLAYLIST_GAIN_MAX_DB = 12;
export const PLAYLIST_GAIN_MAX_RAMP_MS = 5_000;

const channel = z.number().int().positive();
const gainDb = z.number().finite().min(PLAYLIST_GAIN_MIN_DB).max(PLAYLIST_GAIN_MAX_DB);
const editToken = z.string().uuid();
const state = z.object({
  gainDb,
  application: z.enum(['pending', 'ramping', 'applied']),
  usage: z.enum(['used', 'unused', 'unknown']),
  editToken,
});
const reason = z.enum([
  'unavailable',
  'forbidden',
  'backup-sign-in',
  'owner-changed',
  'invalid-request',
  'conflict',
  'busy',
  'peer-owner',
  'uncertain',
]);
const reply = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), state }),
  z.object({ ok: z.literal(false), reason, current: state.optional() }),
]);

export type PlaylistGainState = z.infer<typeof state>;
export type PlaylistGainReply = z.infer<typeof reply>;
export type PlaylistGainFailure = z.infer<typeof reason>;

export const PlaylistGainGetChannel = defineChannel(
  'playlistGain.get',
  z.object({ channel }),
  reply,
);
export const PlaylistGainSetChannel = defineChannel(
  'playlistGain.set',
  z.object({
    channel,
    editToken,
    gainDb,
    rampMs: z.number().int().min(0).max(PLAYLIST_GAIN_MAX_RAMP_MS).optional(),
  }),
  reply,
);
