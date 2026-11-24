import {
  upcomingProgramMediaAssetId,
  upcomingProgramMediaHash,
  upcomingProgramMediaPath,
} from '@cg/shared-schema';

const PREVIEW_MEDIA = /^data:(image\/(?:png|jpeg|webp)|video\/(?:webm|mp4));base64,/;
const previews = new WeakMap<Document, Map<string, string>>();

/** CG Control gives its srcdoc frame the bytes read from Bridge for that approved hash. */
export function provideUpcomingProgramMedia(
  sha256: string,
  url: string,
  doc: Document = document,
): void {
  if (upcomingProgramMediaHash(upcomingProgramMediaAssetId(sha256)) === undefined) return;
  if (!PREVIEW_MEDIA.test(url)) return;
  let sources = previews.get(doc);
  if (sources === undefined) {
    sources = new Map<string, string>();
    previews.set(doc, sources);
  }
  sources.set(sha256, url);
}

export function upcomingProgramVisualUrl(
  doc: Document,
  assetId: string,
  kind: 'image' | 'video',
  assetUrls: Readonly<Record<string, string>> | undefined,
): string | undefined {
  const uploaded = upcomingProgramMediaHash(assetId);
  if (uploaded === undefined) {
    const asset = assetUrls?.[assetId];
    return typeof asset === 'string' ? asset : undefined;
  }
  if (doc.URL !== 'about:srcdoc') return upcomingProgramMediaPath(uploaded);
  const preview = previews.get(doc)?.get(uploaded);
  return preview?.startsWith(`data:${kind}/`) ? preview : undefined;
}
