import { useEffect, useState } from 'react';

/**
 * `RUN-NEXT-VERSION-03` 1.4 — **THE TEMPLATE'S OWN PAGES, as pictures the console can show.**
 *
 * A book's authored pages name a project asset (`assetId`); the page CG Control baked at import carries
 * each one as a `data:` URI in the boot script's `assetUrls` map (`@cg/single-file-export`'s shell:
 * `CG.createRuntime(scene, { …, assetUrls: {…}, lottieAssets: {…} })`). The Inspector's strip and
 * `Manage pages…` read them from there — the same bytes the page draws, on air and in PVW.
 */

const MARK = 'assetUrls: ';

/**
 * The `assetId → data:` map baked into a page, or `{}` when the page carries none (or is not one of
 * ours). Reads the one JSON object after the mark by its braces — a `data:` URI holds neither quotes
 * nor braces, and JSON strings are skipped whole.
 */
export function authoredPictureUrls(html: string): Record<string, string> {
  // The boot script is the page's LAST script; the runtime bundle before it spells `assetUrls: ` too.
  const at = html.lastIndexOf(MARK);
  if (at < 0) return {};
  const start = at + MARK.length;
  if (html[start] !== '{') return {};
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, i + 1)) as unknown;
          if (typeof parsed !== 'object' || parsed === null) return {};
          return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).filter(
              (e): e is [string, string] =>
                typeof e[1] === 'string' && e[1].startsWith('data:image/'),
            ),
          );
        } catch {
          return {};
        }
      }
    }
  }
  return {};
}

const byTemplate = new Map<string, Promise<Record<string, string>>>();

/**
 * The authored pictures of a row's template, read once per template and channel from the page CG
 * Bridge stores for it (`templates.page`, PVW's own read). `{}` while it is read, and for a page the
 * console cannot get.
 */
export function useAuthoredPictures(
  templateId: string | undefined,
  channel: number | undefined,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (templateId === undefined) return;
    const key = `${templateId}|${String(channel ?? '')}`;
    let read = byTemplate.get(key);
    if (read === undefined) {
      read = window.cg.templates
        .page(templateId, channel)
        .then((page) => (page.kind === 'page' ? authoredPictureUrls(page.html) : {}))
        .catch(() => ({}));
      byTemplate.set(key, read);
    }
    let cancelled = false;
    void read.then((found) => {
      // An empty answer (no page yet, or none to read) is not kept: the next mount asks again.
      if (Object.keys(found).length === 0) byTemplate.delete(key);
      if (!cancelled) setUrls(found);
    });
    return () => {
      cancelled = true;
    };
  }, [templateId, channel]);
  return urls;
}
