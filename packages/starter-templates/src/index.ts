import type { Scene } from '@cg/shared-schema';
import { breakingNewsScene } from './breaking-news.js';
import { fullscreenScene } from './fullscreen.js';
import { logoBugScene } from './logo-bug.js';
import { lowerThirdScene } from './lower-third.js';
import { persianReferenceScene } from './persian-reference.js';
import { quoteCardScene } from './quote-card.js';
import { scoreboardScene } from './scoreboard.js';
import { tickerScene } from './ticker.js';

export interface StarterTemplate {
  /** Stable id used by IPC to fetch the starter. */
  id: string;
  /** Display name shown on the landing page. */
  label: string;
  /** Short helper text shown under the label. */
  description: string;
  /**
   * Poster image shown on the landing card — a real render of the starter
   * captured mid-animation. A root-relative URL served from the Designer's
   * `public/` (e.g. `/starters/<id>.png`). Optional so a template can ship
   * before its poster exists.
   */
  preview?: string;
  /** The pre-built Scene. The Designer clones it on load — the operator
   *  edits a copy, not the shared constant. */
  scene: Scene;
}

/**
 * All starter templates exposed to the Designer. Each is a fully animated,
 * schema-valid Scene (validated in this package's tests). Order is the
 * order they appear on the landing page.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'lower-third',
    label: 'Aurora Lower Third',
    description: 'Glassy gradient plate with an accent wipe and slide-in name & title.',
    preview: '/starters/lower-third.png',
    scene: lowerThirdScene,
  },
  {
    id: 'persian-reference',
    label: 'Persian Lower Third',
    description: 'RTL Vazirmatn lower third — gradient plate, accent wipe, QA reference.',
    preview: '/starters/persian-reference.png',
    scene: persianReferenceScene,
  },
  {
    id: 'breaking-news',
    label: 'Breaking News',
    description: 'Bottom-third alert: slide-up panel, accent wipe, pulsing LIVE.',
    preview: '/starters/breaking-news.png',
    scene: breakingNewsScene,
  },
  {
    id: 'ticker',
    label: 'Breaking Ticker',
    description: 'Full-width scrolling headline with a pulsing LIVE badge.',
    preview: '/starters/ticker.png',
    scene: tickerScene,
  },
  {
    id: 'fullscreen',
    label: 'Fullscreen Title',
    description: 'Cinematic title card — radial stage, blur focus-in, letter-spacing reveal.',
    preview: '/starters/fullscreen.png',
    scene: fullscreenScene,
  },
  {
    id: 'logo-bug',
    label: 'Logo Bug',
    description: 'Corner channel ID with a spinning dashed ring and pulsing dot.',
    preview: '/starters/logo-bug.png',
    scene: logoBugScene,
  },
  {
    id: 'quote-card',
    label: 'Quote Card',
    description: 'Editorial citation — oversized mark, rising quote, author underline wipe.',
    preview: '/starters/quote-card.png',
    scene: quoteCardScene,
  },
  {
    id: 'scoreboard',
    label: 'Scoreboard',
    description: 'Top-centre score bug with team colours and a popping score.',
    preview: '/starters/scoreboard.png',
    scene: scoreboardScene,
  },
];

/** Lookup by id, or null when the id isn't known. */
export function getStarter(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.id === id) ?? null;
}

export {
  breakingNewsScene,
  fullscreenScene,
  logoBugScene,
  lowerThirdScene,
  persianReferenceScene,
  quoteCardScene,
  scoreboardScene,
  tickerScene,
};
