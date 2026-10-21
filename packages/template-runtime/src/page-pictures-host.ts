/**
 * 🔴 `RUN-NEXT-VERSION-03` 1.1 — **A BOOK'S PICTURES, GIVEN BY THE HOST when the page's own origin
 * cannot serve them.**
 *
 * On air a page turn names its picture by an address on the page's own origin
 * (`/page/<sha256>.<ext>`, the template server's page route), and only that form is accepted from
 * the wire (`readCgControl`). CG Control's PVW renders the byte-identical page in a `srcdoc` frame,
 * whose origin is the console's, which has no such route — so the address resolved to nothing and
 * the page drew an empty picture (and, before `img.alt = ''`, its file name).
 *
 * The host fills the gap through the page's OWN copy of the runtime, exactly as it sets the page's
 * placement (`applyOutputPosition`) and its sound (`setSoundMuted`): it hands over the picture for a
 * hash, and the page draws that wherever the turn names the hash. The wire is unchanged — PVW sends
 * the same `__cg.page` the bridge sends — and a host that provides nothing (CasparCG) changes
 * nothing. Only `data:` pictures are taken: the host is the same-origin parent, never the wire.
 */

const KEPT = 8;
const DATA_PICTURE = /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/;
const hosts = new WeakMap<Document, Map<string, string>>();

/** Give the page the picture for this hash; the last {@link KEPT} are held. */
export function providePagePicture(sha256: string, url: string, doc: Document = document): void {
  if (!/^[0-9a-f]{64}$/.test(sha256) || !DATA_PICTURE.test(url)) return;
  let held = hosts.get(doc);
  if (held === undefined) {
    held = new Map<string, string>();
    hosts.set(doc, held);
  }
  held.delete(sha256);
  held.set(sha256, url);
  while (held.size > KEPT) {
    const oldest = held.keys().next().value;
    if (oldest === undefined) break;
    held.delete(oldest);
  }
}

/** The host's picture for this hash, when it gave one. */
export function hostPagePicture(sha256: string, doc: Document = document): string | undefined {
  return hosts.get(doc)?.get(sha256);
}
