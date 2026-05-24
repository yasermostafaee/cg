import type { Scene } from '@cg/shared-schema';
import { breakingNewsScene } from './breaking-news.js';
import { fullscreenScene } from './fullscreen.js';
import { logoBugScene } from './logo-bug.js';
import { persianReferenceScene } from './persian-reference.js';
import { tickerScene } from './ticker.js';

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

/**
 * All starter templates exposed to the Designer + Runtime. Order is the
 * order they appear in the Library sidebar — the Persian reference goes
 * first (it's the QA gate template), then the rest in canonical
 * Phase 3 §5 order.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'persian-reference',
    label: 'Persian Reference Render',
    description: 'QA-grade Persian lower-third with Vazirmatn, RTL text, and bound accent color.',
    scene: persianReferenceScene,
  },
  {
    id: 'logo-bug',
    label: 'Logo Bug',
    description: 'Persistent corner channel mark — bound text on a rounded plate.',
    scene: logoBugScene,
  },
  {
    id: 'lower-third',
    label: 'Lower Third (English)',
    description: 'Simple anchor + role lower-third for English broadcasts.',
    // Reuse the Persian scene shape — the rendering machinery is the
    // same, only the defaults differ. M8.5/M9 will add a distinct
    // English scene once the asset library lands.
    scene: persianReferenceScene,
  },
  {
    id: 'ticker',
    label: 'Breaking Ticker',
    description: 'Full-width scrolling headline strip — uses the M8.1 seamless-wrap ticker.',
    scene: tickerScene,
  },
  {
    id: 'breaking-news',
    label: 'Breaking News',
    description: 'Bottom-third alert banner with a yellow kicker and large headline.',
    scene: breakingNewsScene,
  },
  {
    id: 'fullscreen',
    label: 'Fullscreen Title',
    description: 'Full-frame title card with accent rule and subhead.',
    scene: fullscreenScene,
  },
];

/** Lookup by id, or null when the id isn't known. */
export function getStarter(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.id === id) ?? null;
}

export { breakingNewsScene, fullscreenScene, logoBugScene, persianReferenceScene, tickerScene };
