import type { Scene } from '@cg/shared-schema';
import { iribNewsScene } from './irib-news.js';
import { logoBugScene } from './logo-bug.js';
import { sequenceScene } from './sequence.js';
import { tickerScene } from './ticker.js';
import { titleScene } from './title.js';

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
   * "New" badge. Optional — absent means an established template. The D-119
   * starter set deliberately omits it everywhere (owner decision).
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

/** The bundled Vazirmatn woff2 every Persian starter seeds as an asset font. */
const VAZIRMATN_URL = '/fonts/vazirmatn/vazirmatn-arabic-500-normal.woff2';

/**
 * All starter templates exposed to the Designer — the D-119 set: professional
 * Persian broadcast demos, each a fully animated, schema-valid Scene
 * (validated in this package's tests) with a real playout lifecycle.
 * Order is the order they appear on the landing page.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'irib-news',
    label: 'میان‌برنامهٔ خبر — News Composite',
    // `DESIGNER-FIX-0905` — ONE line per card. What each starter does on air is the badge
    // (`describePlayout`), not a sentence at the end of the description.
    description:
      'Two-deck IRIB-style strap: live Tehran and Greenwich clocks, brand tag, bound title, RTL headline crawl.',
    preview: '/starters/irib-news.png',
    assets: [
      {
        key: 'irib-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
    ],
    scene: iribNewsScene,
  },
  {
    id: 'ticker',
    label: 'نوار اخبار — News Ticker',
    description:
      'Persian news strap with a measured RTL crawl; the headlines are an editable list.',
    preview: '/starters/ticker.png',
    assets: [
      {
        key: 'ticker-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
    ],
    scene: tickerScene,
  },
  {
    id: 'logo-bug',
    label: 'آرم شبکه — Logo Sting',
    description:
      'Corner channel bug: a pen-path mark morphing square → circle → star beside a Persian wordmark.',
    preview: '/starters/logo-bug.png',
    assets: [
      {
        key: 'logo-bug-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
    ],
    scene: logoBugScene,
  },
  {
    id: 'title',
    label: 'زیرنویس معرفی — Guest Title',
    description:
      'Two-tier guest / expert title flush right, with the brand square and bound name and role.',
    preview: '/starters/title.png',
    assets: [
      {
        key: 'title-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
    ],
    scene: titleScene,
  },
  {
    id: 'sequence',
    label: 'توالی خبر — Headline Rotator',
    description:
      'Headlines rotate one at a time, then the strap closes itself; the items are an editable list.',
    preview: '/starters/sequence.png',
    assets: [
      {
        key: 'sequence-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
    ],
    scene: sequenceScene,
  },
];

/** Lookup by id, or null when the id isn't known. */
export function getStarter(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.id === id) ?? null;
}

export { iribNewsScene, logoBugScene, sequenceScene, tickerScene, titleScene };
export { describePlayout, type StarterPlayoutSummary } from './describe-playout.js';
