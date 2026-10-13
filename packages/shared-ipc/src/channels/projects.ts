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
  name: z.string().min(1),
  /** D-088 — project id; present for handle-keyed entries, absent in legacy ones. */
  projectId: z.string().min(1).optional(),
  /** D-088 — IndexedDB key of the project's persisted `FileSystemFileHandle`. */
  handleKey: z.string().min(1).optional(),
  /** D-088 — last-saved wall-clock time (ISO8601). */
  lastSavedAt: z.string().datetime().optional(),
  /** Legacy (pre-D-088) — workspace-relative OPFS path; still openable, upgraded on next save. */
  path: z.string().min(1).optional(),
  templateType: z.string().min(1).optional(),
  /** Legacy (pre-D-088) — last-opened wall-clock time (ISO8601). */
  lastOpenedAt: z.string().datetime().optional(),
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
    /**
     * Optional resolution/frameRate override (D-007 New Project modal).
     * When omitted the platform falls back to the v1 defaults.
     */
    resolution: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .optional(),
    frameRate: z
      .union([z.literal(25), z.literal(29.97), z.literal(50), z.literal(59.94), z.literal(60)])
      .optional(),
    /**
     * Optional total scene duration in frames (New Project modal). When
     * omitted the platform falls back to the v1 default of 50.
     */
    durationFrames: z.number().int().positive().optional(),
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
/**
 * `DESIGNER-FIX-0905` — a starter's PLAYOUT BEHAVIOUR, derived from its entry composition
 * (`@cg/starter-templates` `describePlayout`), so the landing card can show a comparable
 * badge — "auto-out after 6 s", "content-driven hold", "loops every ~10 s" — instead of
 * burying the one thing the five starters differ in inside a paragraph. Derived rather than
 * authored: a hand-written badge is one more string that can drift from the scene.
 */
const StarterPlayoutSchema = z.object({
  /** The entry composition's EFFECTIVE mode (`playoutOf`, so a no-out-point default reads `static`). */
  mode: z.enum(['static', 'manual', 'auto-out', 'loop-cycle']),
  /** `operator` for manual / static (the hold source is ignored); else the hold source. */
  hold: z.enum(['operator', 'timed', 'content-driven']),
  /** The timed hold, in seconds, when the hold is timed. */
  holdSeconds: z.number().nonnegative().optional(),
  hasOutPoint: z.boolean(),
  /**
   * The cycle length of a loop-cycle composition the entry DIRECTLY instances (the on-air
   * footprint comp of the two-comp structure) — the logo sting's ~10 s loop lives there while
   * its entry is `manual`. Direct children only: a blink deeper down is not the template's
   * playout behaviour.
   */
  nestedCycleSeconds: z.number().positive().optional(),
});
export type StarterPlayout = z.infer<typeof StarterPlayoutSchema>;

const StarterEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  templateType: z.string().min(1),
  /** Root-relative poster image URL for the landing card (optional). */
  previewUrl: z.string().optional(),
  /** When true, the landing card shows a "New" badge. */
  isNew: z.boolean().optional(),
  /** `DESIGNER-FIX-0905` — the derived playout badge (optional so an old catalog still parses). */
  playout: StarterPlayoutSchema.optional(),
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
