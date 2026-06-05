import type { Scene } from '@cg/shared-schema';
import { breakingNewsScene } from './breaking-news.js';
import { fullscreenScene } from './fullscreen.js';
import { logoBugScene } from './logo-bug.js';
import { lowerThirdScene } from './lower-third.js';
import { persianReferenceScene } from './persian-reference.js';
import { quoteCardScene } from './quote-card.js';
import { scoreboardScene } from './scoreboard.js';
import { showcaseScene } from './showcase.js';
import { tickerScene } from './ticker.js';

/**
 * A binary asset a starter ships (font or image). On load the Designer fetches
 * the bytes from `url` (a root-relative path served from the app's `public/`),
 * imports them into the project's AssetStore so they appear in the Assets
 * panel, and rewrites the scene's placeholder references to the freshly-minted
 * assetId. In the scene, an image element's `assetId` is the `key`, and a font
 * is referenced as the family `asset-<key>` (mirroring the imported-font
 * convention) on both the text elements and the `fonts` entry.
 */
export interface StarterAsset {
  /** Placeholder token used in the scene; rewritten to the real assetId. */
  key: string;
  kind: 'image' | 'font';
  /** Filename shown in the Assets panel after import. */
  filename: string;
  /** Root-relative URL the Designer fetches the bytes from (served from public/). */
  url: string;
}

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
  /**
   * Marks a freshly-added template so the landing page can flag it with a
   * "New" badge. Optional — absent means an established template.
   */
  isNew?: boolean;
  /**
   * Font / image assets this starter ships. Seeded into the project's
   * AssetStore on load (so they show up in the Assets panel) and their
   * placeholder references in `scene` are rewritten to real assetIds.
   */
  assets?: StarterAsset[];
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
    id: 'showcase',
    label: 'Aurora Network — Showcase',
    description:
      'A 7-second title sequence built from five nested compositions — drifting aurora backdrop, spinning logo-bug, glass lower third, RTL Persian, bound fields.',
    preview: '/starters/showcase.png',
    isNew: true,
    assets: [
      {
        key: 'showcase-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: '/fonts/vazirmatn/vazirmatn-arabic-500-normal.woff2',
      },
      {
        key: 'showcase-texture',
        kind: 'image',
        filename: 'aurora-texture.jpg',
        url: '/starters/showcase/texture.jpg',
      },
      {
        key: 'showcase-emblem',
        kind: 'image',
        filename: 'aurora-mark.svg',
        url: '/starters/showcase/aurora-mark.svg',
      },
    ],
    scene: showcaseScene,
  },
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
  showcaseScene,
  tickerScene,
};
