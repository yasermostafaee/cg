import type { Scene } from '@cg/shared-schema';
import { persianReferenceScene } from './persian-reference.js';

export interface StarterTemplate {
  /** Stable id used by IPC to fetch the starter. */
  id: string;
  /** Display name shown in the Designer Library. */
  label: string;
  /** Short helper text shown under the label. */
  description: string;
  /** The pre-built Scene. The Designer clones it on load — the operator
   *  edits a copy, not the shared constant. */
  scene: Scene;
}

const PERSIAN_REFERENCE: StarterTemplate = {
  id: 'persian-reference',
  label: 'Persian Reference Render',
  description: 'QA-grade Persian lower-third with Vazirmatn, RTL text, and bound accent color.',
  scene: persianReferenceScene,
};

/**
 * All starter templates exposed to the Designer + Runtime. Order is the
 * order they appear in the Library sidebar.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [PERSIAN_REFERENCE];

/** Lookup by id, or null when the id isn't known. */
export function getStarter(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.id === id) ?? null;
}

export { persianReferenceScene };
