import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Settings channels (Phase 8 §12 / M9.3).
 *
 * The Settings panel reads + writes operator-facing toggles persisted
 * to a JSON file by the SettingsService. v1 only exposes the telemetry
 * mode; subsequent settings append to the schema.
 */

const TelemetryModeSchema = z.enum(['off', 'on', 'air-gapped']);

const SettingsSchema = z.object({
  telemetry: TelemetryModeSchema,
});

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsGetChannel = defineChannel('settings.get', z.void(), SettingsSchema);

export const SettingsSetChannel = defineChannel(
  'settings.set',
  SettingsSchema.partial(),
  SettingsSchema,
);

export const SettingsChangedChannel = definePublishChannel('settings.changed', SettingsSchema);
