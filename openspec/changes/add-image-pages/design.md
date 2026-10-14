# Design — pages of pictures turned on air (`D-163`)

## 0. Measured before building

### 0.1 `B-102` — real, and fixed first

`applyAssetUrls` ran once, at build (`template-runtime/src/runtime.ts:622`). A sequence composition
item is built when it comes on stage (`renderComposition`) and a repeater row at every fresh play
(`stampRows`), so an `<img>` inside either never got a `src` on an exported page. The Designer
preview hid it (it re-attaches images itself, `preview.ts`). Reproduced without a station by
`packages/template-runtime/tests/nested-image-assets.test.ts` (4 red); fixed in `eb00cf7e` by running
the same walk on each late-built subtree. A picture item would have met the same cause.

### 0.2 How Next travels today

Console NEXT (`layerRowActions.ts:900-916`) → `window.cg.stack.next({ itemId })`
(`WebSocketRuntime.ts:1799`) → `stack.next` (`shared-ipc/src/channels/stack.ts:147-151`) → the
bridge's `nextItem` (`caspar-runtime.ts:6025-6047`) → **`CG <ch>-<layer> NEXT 0`**
(`command-builder.ts:275-277`) → CasparCG calls the page's `window.next()`
(`caspar-globals.ts:41-43`) → `runtime.next()` → every sequence driver's `next()`.

**There is no AMCP verb for previous or for "page N".** The established road from the bridge to a
running page for anything else is the reserved `__cg` member of a `CG UPDATE`
(`shared-schema/src/control-payload.ts`: `look`, `timing`, `take`), read defensively so an older
page drops a member it does not know. **Previous and Go to therefore travel as `__cg.page` on
`CG UPDATE`.** On a row that carries a page list, **Next travels the same way**: the console's
counter (`12 / 300`) must never disagree with the page, and a relative `CG NEXT` is dropped by the
page during a transition (`sequence-driver.ts:234-238`), while an ABSOLUTE page is idempotent. A
template with no page list keeps `CG NEXT`, unchanged.

### 0.3 A file from the console to the bridge

CG Control already sends template pages to the bridge as JSON over the authenticated WebSocket
(`templates.import`, `templateDelivery.ts:320-324`; frames are `JSON.stringify`, `ws-frame.ts:218`;
`maxPayload` 64 MiB, `bridge.ts:1791-1798`; 8 s default request timeout). There is no binary or HTTP
upload path. **Reused:** one `media.put` request per picture on the same socket, the bytes base64 in
the frame, under the same sign-in, permission (`operator`) and channel gate as `templates.import`.
Stored under `<stateHome>\.cg-runtime\bridge-row-media\` (beside `bridge-templates\`, never inside
it: the registry refuses files outside its own name pattern, `B-116`), one file per picture, named
by its SHA-256.

### 0.4 How templates reach CasparCG — and why pictures cannot take the same road

Templates are served by `TemplateHttpServer` (`:7911` for the service), URL
`http://<advertised host>:<port>/template/<serveKey>` with the version in the key, `no-store` on
every answer. The page's CSP is `img-src data:; connect-src 'self'`
(`exporter-single-file.ts:427`), and the server's route set is a **written, enforced security
boundary**: `SECURITY.md` — "THE TEMPLATE-SERVING ORIGIN HOSTS NOTHING BUT TEMPLATES … no control,
identity or data route may ever be added to it", pinned by `template-server-route-set.test.ts`.

So the prompt's assumed road — "served to CasparCG by the same server that serves templates" —
would need either a new data route on that origin or a wider `img-src`. **Both loosen a guard, and
this run may not.** The road that breaks no rule: **the picture travels inside the operator's own
`CG UPDATE`, as the `data:` image the CSP already allows.** Measured on the owner's CasparCG
2.5.0 (`127.0.0.1:5250`, channel 1 at 1080p50), eight 1920×1080 scan-like PNGs of ~1.07 MB (1.43 MB
as base64 in the command):

|                                                  | per page                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| AMCP reply (`202 CG OK`)                         | 33–48 ms                                                                       |
| send → page shown (decoded, swapped, next frame) | 89–115 ms (604 ms for the very first, cold)                                    |
| page's own parse / decode                        | ~1.5 ms / ~23 ms                                                               |
| **CasparCG's log**                               | **+1.43 MB per page** — CasparCG logs every received command in full at `info` |

The log is the real cost: one pass through a 300-page book of such scans writes about 430 MB of
CasparCG log. The efficient alternative — a content-addressed `GET /media/<sha256>` on the template
origin plus `img-src 'self'` — is a decision for the owner, because it amends `SECURITY.md`. It is
put to him in the report with a recommendation; nothing in this change depends on it, and moving to
it later changes only the transport (the store, the page list and the console stay).

### 0.5 Golden rule 10

Next / Previous / Go to are PLAYOUT verbs on an on-air row: each operator press sends exactly one
`CG UPDATE` carrying exactly the page asked for, and nothing is sent ahead (no speculative
"next page" preload — that would be a command the operator did not ask for). On a row that does not
own live layers, a page change and a new book are STATE ONLY: stored, shown on every console, sent
with the next take. Changing the pages of an ON-AIR row is allowed: the current page number is kept
when it still exists, otherwise the book goes to page 1, and the console says so.

## 1. Schema (additive, no schema-version bump)

- `SequenceImageItemSchema` `{ kind: 'image', id, assetId?, media?, name?, dwellMs? }`, refined to
  carry exactly one of `assetId` (an authored page, a project asset) or `media` (an operator page,
  the SHA-256 of a picture the bridge holds). `name` is the file name, for people.
- `SequenceElement.imageFit` — the image element's `fit` values, default `contain`, one setting for
  every picture of the sequence.
- `ListField.pages?: true` — this list is a page list (its items are picture items).
- `CgControl.page?: { field, index, media? }` — `index` 0-based; `media` maps SHA-256 → `data:image/…`
  and is read only for `data:image/png|jpeg|webp` values.

## 2. The page

- A picture item is drawn by `buildImage` (exported from `scene-builder.ts`) for a synthetic image
  element the size of the sequence box, inside the usual item cell. Its `src`: an authored page from
  the host's `assetUrls` (the export), or — Designer preview — the preview's own `data-cg-asset-id`
  walk; an operator page from the page's media cache.
- **Decode before swap.** The incoming picture is decoded (`img.decode()`) before it enters; a page
  whose bytes are missing or cannot be decoded leaves the current page on screen. A blank frame is
  never produced by a page turn.
- `next()` unchanged; `previous()` mirrors it (no wrap on a finite sequence; wraps to the last item
  under `'infinite'`); `goTo(index)` is absolute and latest-wins: a request during a transition is
  kept and applied when it ends, never dropped. Before a run starts, `goTo` sets the page the run
  starts on.
- Memory: nodes exist only for the page on screen and the one coming in; the media cache keeps the
  three most recently delivered pictures.

## 3. Designer

`Add pictures…` (many files) and `Add folder…` on the sequence's Items section; files sorted by
`naturalCompare` (new, in `@cg/text-shaping`: digit runs compared as numbers in any of the three
digit sets), imported through the existing asset store (SHA-256 dedupe), one picture item each. The
first pictures make the sequence a book: `none`/`none` (Cut), `advance: 'manual'`, `repeat: 1`.
A sequence whose items are all pictures may take a Data key; the seeded list field is a page list.

## 4. CG Control and CG Bridge

- Import records `pageLists: [{ fieldId, wrap }]` on `TemplateInfo` (the sequence bound to a page
  list; `wrap` = its `repeat` is infinite), so every console and the bridge know it.
- `media.put` stores one picture (PNG, JPEG or WebP; header-checked; limits below) and answers its
  SHA-256 and size. The row's page list is an ordinary field value of picture items naming those
  hashes, so it is persisted, synced to every console and applied by the existing `stack.update`;
  the bridge refuses a page list naming a picture it does not hold.
- `stack.page { itemId, field, to: 'next' | 'previous' | <page number> }` moves the row's page. The
  row state carries `pages: { <fieldId>: <0-based index> }`, persisted with the row.
- A take carries each page list's current page; an update of an on-air row's page list carries the
  page now shown (kept, or page 1).
- Removal: when a row is removed, every stored picture no other row names is deleted; at start, the
  same sweep runs against the restored rows.
- **Limits** (from §0.4): a picture at most **4 MB** and **3840 × 2160** pixels; a row at most
  **500 pages**. Refusals name the file and the limit in the operator's words.
