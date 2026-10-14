import { z } from 'zod';
import { defineChannel } from '../channel.js';

/**
 * `R-100` — **A BOOK'S PAGES, sent from the console to CG Bridge one picture at a time.**
 *
 * The console may be on another PC than the bridge, so a picture the operator picks travels on the
 * signed-in socket the console already uses (the `templates.import` road: JSON, the bytes base64),
 * under the same permission and channel gate. The bridge stores it once, by its SHA-256, beside
 * the template store, and answers that hash: the row's page list names pictures by it.
 *
 * The bridge decides what the picture IS from its own bytes (PNG, JPEG or WebP, read from the
 * header), never from a name or a claimed type.
 */
export const PagesPutChannel = defineChannel(
  'pages.put',
  z.object({
    /** The picked file's name, for the operator's words in a refusal. Never trusted for type. */
    name: z.string().min(1).max(512),
    /** The picture's bytes, base64. */
    base64: z.string().min(1),
  }),
  z.object({
    accepted: z.boolean(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    errorCode: z.string().optional(),
    message: z.string().optional(),
  }),
);

/**
 * `R-100` — **THE LIMITS, in one place** for the console's own check before it sends and the
 * bridge's after it receives (a console of another build is not trusted to have checked).
 *
 * Measured on the owner's CasparCG 2.5.0 (`add-image-pages/design.md` §0.4): a 1 MB page is shown
 * ~0.1 s after the press. Every page also crosses AMCP inline, and CasparCG logs each command in
 * full, so the byte cap is the cost of ONE page turn in that log.
 */
export const PAGE_MAX_BYTES = 4 * 1024 * 1024;
/** 3840 × 2160 — a UHD frame, more than any channel this product drives shows. */
export const PAGE_MAX_PIXELS = 3840 * 2160;
/** No side longer than this, so a tall scan cannot pass as "few pixels". */
export const PAGE_MAX_SIDE = 4096;
/** Pages one row may hold. */
export const PAGES_MAX_PER_ROW = 500;

/** The refusal codes `pages.put` and a page-list update answer with. */
export type PageRefusalCode =
  | 'page-not-a-picture'
  | 'page-too-large'
  | 'page-too-many-pixels'
  | 'page-too-many'
  | 'page-missing';

/**
 * The ONE wording of each refusal, in the operator's words: the file's own name and the limit it
 * broke. The console and the bridge both say it with this, so the two cannot drift.
 */
export function pageRefusalMessage(
  code: PageRefusalCode,
  detail: { name?: string; bytes?: number; width?: number; height?: number; count?: number },
): string {
  const name = detail.name ?? 'This picture';
  switch (code) {
    case 'page-not-a-picture':
      return `${name} is not a PNG, JPEG or WebP picture.`;
    case 'page-too-large':
      return `${name} is ${formatMb(detail.bytes ?? 0)}; a page may be at most ${formatMb(PAGE_MAX_BYTES)}.`;
    case 'page-too-many-pixels':
      return `${name} is ${String(detail.width ?? 0)} × ${String(detail.height ?? 0)} pixels; a page may be at most 3840 × 2160 (and ${String(PAGE_MAX_SIDE)} on a side).`;
    case 'page-too-many':
      return `${String(detail.count ?? 0)} pages is more than a row can hold (${String(PAGES_MAX_PER_ROW)}).`;
    case 'page-missing':
      return `${name} is not on CG Bridge any more. Load the pages again.`;
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
