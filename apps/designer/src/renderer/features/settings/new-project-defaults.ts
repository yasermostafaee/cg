import { FrameRateSchema, ResolutionSchema } from '@cg/shared-schema';
import { z } from 'zod';
import {
  DEFAULT_PROJECT_RESOLUTION_PRESET,
  PROJECT_RESOLUTION_PRESETS,
  type ProjectResolutionPresetKey,
} from '../shell/new-project-options.js';

const STORAGE_KEY = 'cg-designer.new-project-defaults.v1';

const newProjectDefaultsSchema = z.object({
  name: z.string().trim().min(1),
  presetKey: z.custom<ProjectResolutionPresetKey>((value) =>
    PROJECT_RESOLUTION_PRESETS.some(({ key }) => key === value),
  ),
  customW: ResolutionSchema.shape.width,
  customH: ResolutionSchema.shape.height,
  frameRate: FrameRateSchema,
  durationFrames: z.number().int().positive(),
});

export type NewProjectDefaults = z.infer<typeof newProjectDefaultsSchema>;

const shippedDefaults: NewProjectDefaults = {
  name: 'Untitled',
  presetKey: DEFAULT_PROJECT_RESOLUTION_PRESET,
  customW: 1920,
  customH: 1080,
  frameRate: 50,
  durationFrames: 50,
};

let sessionDefaults: NewProjectDefaults | undefined;

export function readNewProjectDefaults(): NewProjectDefaults {
  if (sessionDefaults !== undefined) return sessionDefaults;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = newProjectDefaultsSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // The creation form remains available when browser storage is unreadable.
  }
  return shippedDefaults;
}

export function saveNewProjectDefaults(defaults: NewProjectDefaults): void {
  sessionDefaults = defaults;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // Keep the defaults for this visit when persistence is unavailable.
  }
}
