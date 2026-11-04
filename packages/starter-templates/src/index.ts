import type { Scene } from '@cg/shared-schema';
import { iribNewsScene } from './irib-news.js';
import { iranPremierLeagueScene, LEAGUE_LOGOS } from './azadegan-table.js';
import { countdownStepsScene } from './countdown-steps.js';
import { imageFolderSequenceScene } from './image-folder-sequence.js';
import { iranWeatherForecastScene } from './iran-weather-forecast.js';
import { iranWeatherPagesScene } from './iran-weather-pages.js';
import { logoBugScene } from './logo-bug.js';
import { multiboxScene } from './multibox.js';
import { sequenceScene } from './sequence.js';
import { tickerScene } from './ticker.js';
import { titleScene } from './title.js';
import { WEATHER_CHOICES } from './weather-icons.js';

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
   * A short, silent WebM excerpt at a modest 1.15×, used only by the template gallery.
   * Its duration is independent from the full broadcast run, but authored motion
   * is never compressed into a rapid time-lapse.
   */
  motionPreview?: string;
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

const WEATHER_ASSETS: StarterAsset[] = WEATHER_CHOICES.map(({ icon }) => ({
  key: `weather-${icon}`,
  kind: 'image',
  filename: `weather-${icon}.svg`,
  url: `/starters/assets/weather-${icon}.svg`,
}));

/**
 * All starter templates exposed to the Designer — D-119's audited core plus
 * D-179's production workflow examples. Every entry is a fully animated,
 * schema-valid Persian Scene with a real playout lifecycle.
 * Order is the order they appear on the landing page.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'irib-news',
    label: 'میان‌برنامهٔ خبر',
    // `DESIGNER-FIX-0905` — ONE line per card. What each starter does on air is the badge
    // (`describePlayout`), not a sentence at the end of the description.
    description:
      'Two-deck IRIB-style strap: live Tehran and Greenwich clocks, brand tag, bound title, RTL headline crawl.',
    preview: '/starters/irib-news.png',
    motionPreview: '/starters/motion/irib-news.webm',
    assets: [
      {
        key: 'irib-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'apasai-logo',
        kind: 'image',
        filename: 'apasai-logo.svg',
        url: '/starters/assets/apasai-logo.svg',
      },
    ],
    scene: iribNewsScene,
  },
  {
    id: 'ticker',
    label: 'نوار اخبار',
    description:
      'Persian news strap with a measured RTL crawl; the headlines are an editable list.',
    preview: '/starters/ticker.png',
    motionPreview: '/starters/motion/ticker.webm',
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
    label: 'آرم شبکه',
    description:
      'Corner channel bug with a replaceable APASAI image asset and a ready-made animated sting.',
    preview: '/starters/logo-bug.png',
    motionPreview: '/starters/motion/logo-bug.webm',
    assets: [
      {
        key: 'logo-bug-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'apasai-logo',
        kind: 'image',
        filename: 'apasai-logo.svg',
        url: '/starters/assets/apasai-logo.svg',
      },
    ],
    scene: logoBugScene,
  },
  {
    id: 'title',
    label: 'زیرنویس معرفی',
    description:
      'Two-tier guest / expert title flush right, with a transparent replaceable logo and bound name and role.',
    preview: '/starters/title.png',
    motionPreview: '/starters/motion/title.webm',
    assets: [
      {
        key: 'title-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'apasai-logo',
        kind: 'image',
        filename: 'apasai-logo.svg',
        url: '/starters/assets/apasai-logo.svg',
      },
    ],
    scene: titleScene,
  },
  {
    id: 'sequence',
    label: 'توالی خبر',
    description:
      'Headlines rotate one at a time, then the strap closes itself; the items are an editable list.',
    preview: '/starters/sequence.png',
    motionPreview: '/starters/motion/sequence.webm',
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
  {
    id: 'iran-premier-league',
    label: 'جدول لیگ برتر ایران',
    description:
      'جدول تک‌صفحه‌ای ۱۸ تیم با دادهٔ نمونهٔ ثابت از ورزش سه، اعداد فارسی و اتصال به فایل؛ داده‌ها زنده نیستند.',
    preview: '/starters/iran-premier-league.png',
    motionPreview: '/starters/motion/iran-premier-league.webm',
    assets: [
      {
        key: 'iran-premier-league-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'iran-premier-league-stadium',
        kind: 'image',
        filename: 'iran-premier-league-stadium.png',
        url: '/starters/assets/iran-premier-league-stadium.png',
      },
      ...LEAGUE_LOGOS.map(
        ({ code, name }): StarterAsset => ({
          key: `league-${code}`,
          kind: 'image',
          filename: `${name}.png`,
          url: `/starters/assets/league-${code}.png`,
        }),
      ),
    ],
    scene: iranPremierLeagueScene,
  },
  {
    id: 'iran-weather-pages',
    label: 'آب‌وهوای مراکز استان‌ها',
    description:
      'مراکز استان‌ها به ترتیب الفبا، چهار صفحهٔ Sequence و انتخاب نوع آب‌وهوا با آیکون متحرک و Value rules.',
    preview: '/starters/iran-weather-pages.png',
    motionPreview: '/starters/motion/iran-weather-pages.webm',
    assets: [
      {
        key: 'iran-weather-pages-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'weather-atmosphere',
        kind: 'image',
        filename: 'weather-atmosphere.png',
        url: '/starters/assets/weather-atmosphere.png',
      },
      ...WEATHER_ASSETS,
    ],
    scene: iranWeatherPagesScene,
  },
  {
    id: 'iran-weather-forecast',
    label: 'پیش‌بینی چندروزهٔ هوا',
    description: 'امروز و چهار روز آینده در یک صفحه، با Repeater افقی و ورودی‌های عددی محدودشده.',
    preview: '/starters/iran-weather-forecast.png',
    motionPreview: '/starters/motion/iran-weather-forecast.webm',
    assets: [
      {
        key: 'iran-weather-forecast-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'weather-atmosphere',
        kind: 'image',
        filename: 'weather-atmosphere.png',
        url: '/starters/assets/weather-atmosphere.png',
      },
      ...WEATHER_ASSETS,
    ],
    scene: iranWeatherForecastScene,
  },
  {
    id: 'image-folder-sequence',
    label: 'توالی تصاویر پوشه',
    description:
      'Sequence تصویری آماده برای جایگزینی گروهی با Add folder و مرتب‌سازی طبیعی نام فایل‌ها.',
    preview: '/starters/image-folder-sequence.png',
    motionPreview: '/starters/motion/image-folder-sequence.webm',
    assets: [
      {
        key: 'image-folder-sequence-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'gallery-slide-1',
        kind: 'image',
        filename: 'quran-wide-001.png',
        url: '/starters/assets/quran-wide-001.png',
      },
      {
        key: 'gallery-slide-2',
        kind: 'image',
        filename: 'quran-wide-002.png',
        url: '/starters/assets/quran-wide-002.png',
      },
      {
        key: 'gallery-slide-3',
        kind: 'image',
        filename: 'quran-wide-003.png',
        url: '/starters/assets/quran-wide-003.png',
      },
      {
        key: 'gallery-slide-4',
        kind: 'image',
        filename: 'quran-wide-004.png',
        url: '/starters/assets/quran-wide-004.png',
      },
      {
        key: 'gallery-slide-5',
        kind: 'image',
        filename: 'quran-wide-005.png',
        url: '/starters/assets/quran-wide-005.png',
      },
    ],
    scene: imageFolderSequenceScene,
  },
  {
    id: 'countdown-steps',
    label: 'شمارش معکوس اذان',
    description: 'زیرنویس اذان مغرب؛ زمان هدف قابل ویرایش و تبدیل شمارش به اعلان ماندگار با Steps.',
    preview: '/starters/countdown-steps.png',
    motionPreview: '/starters/motion/countdown-steps.webm',
    assets: [
      {
        key: 'countdown-steps-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
    ],
    scene: countdownStepsScene,
  },
  {
    id: 'multibox',
    label: 'میزگرد چندقابه',
    description:
      'پریست‌های واقعی یک تا چهار قاب؛ تک‌قاب تمام‌صفحه و سه‌قاب با دو قاب بالا و یکی پایین، بدون عنوان ثابت.',
    preview: '/starters/multibox.png',
    motionPreview: '/starters/motion/multibox.webm',
    assets: [
      {
        key: 'multibox-vazir',
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: VAZIRMATN_URL,
      },
      {
        key: 'multibox-studio',
        kind: 'image',
        filename: 'multibox-studio.png',
        url: '/starters/assets/multibox-studio.png',
      },
    ],
    scene: multiboxScene,
  },
];

/** Lookup by id, or null when the id isn't known. */
export function getStarter(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.id === id) ?? null;
}

export {
  iranPremierLeagueScene,
  countdownStepsScene,
  imageFolderSequenceScene,
  iranWeatherForecastScene,
  iranWeatherPagesScene,
  iribNewsScene,
  logoBugScene,
  multiboxScene,
  sequenceScene,
  tickerScene,
  titleScene,
};
export { describePlayout, type StarterPlayoutSummary } from './describe-playout.js';
