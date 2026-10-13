/**
 * `CLIENT-TEST-RELEASE-01` B3 — the typed surfaces of `../src/markdown.mjs` and `../src/build-guide.mjs`
 * (plain zero-dep ESM, no build). Update each pair together.
 */
declare module '*markdown.mjs' {
  export const CONFIRM_MARKER: string;
  export function escapeHtml(text: string): string;
  export function inline(text: string): string;
  export function markdownToHtml(markdown: string, resolveImage?: (src: string) => string): string;
}

declare module '*build-guide.mjs' {
  export const REPO: string;
  export function fontFaces(): string;
  export function guideHtml(markdownFile: string): string;
  export function pdfPageCount(bytes: Buffer): number;
  export function buildGuidePdf(markdownFile: string, outFile: string): Promise<number>;
}
