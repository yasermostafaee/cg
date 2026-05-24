import { z } from 'zod';
import { SceneSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Designer project channels — scene CRUD against on-disk JSON.
 *
 * The Scene shape lives in @cg/shared-schema and crosses the wire as
 * inferred JSON. Save round-trips through Zod so a file edited by hand
 * outside the Designer is validated on next open.
 */

const RecentEntrySchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  templateType: z.string().min(1),
  /** Last-opened wall-clock time (ISO8601). */
  lastOpenedAt: z.string().datetime(),
});

export type RecentProject = z.infer<typeof RecentEntrySchema>;

export const ProjectsNewChannel = defineChannel(
  'projects.new',
  z.object({
    name: z.string().min(1),
    templateType: z.enum([
      'logo-bug',
      'lower-third',
      'ticker',
      'breaking-news',
      'fullscreen',
      'custom',
    ]),
  }),
  z.object({ scene: SceneSchema, path: z.string().nullable() }),
);

export const ProjectsOpenChannel = defineChannel(
  'projects.open',
  /** Path is optional — when omitted, Main shows a file dialog. */
  z.object({ path: z.string().optional() }),
  z.object({ scene: SceneSchema.nullable(), path: z.string().nullable() }),
);

export const ProjectsSaveChannel = defineChannel(
  'projects.save',
  z.object({
    scene: SceneSchema,
    /** Omit to save-as (file dialog). */
    path: z.string().optional(),
  }),
  z.object({ path: z.string() }),
);

export const ProjectsRecentChannel = defineChannel(
  'projects.recent',
  z.void(),
  z.array(RecentEntrySchema),
);

/** Main → Renderer push: emitted when the active project changes. */
export const ProjectsActiveChangedChannel = definePublishChannel(
  'projects.active-changed',
  z.object({ scene: SceneSchema.nullable(), path: z.string().nullable() }),
);

/**
 * Catalog of built-in starter templates (Phase 8 §11 / M8.0).
 *
 * Renderer asks Main for the catalog at boot; clicking a starter calls
 * `projects.starter` which returns a *clone* of the starter's Scene to
 * become the new active project.
 */
const StarterEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  templateType: z.string().min(1),
});
export type StarterEntry = z.infer<typeof StarterEntrySchema>;

export const ProjectsStartersChannel = defineChannel(
  'projects.starters',
  z.void(),
  z.array(StarterEntrySchema),
);

export const ProjectsStarterChannel = defineChannel(
  'projects.starter',
  z.object({ starterId: z.string().min(1) }),
  z.object({ scene: SceneSchema, path: z.null() }),
);
