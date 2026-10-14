# Design — pages of pictures turned on air (`D-163`, `R-100`)

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
upload path. **Reused:** one `pages.put` request per picture on the same socket, the bytes base64 in
the frame, under the same sign-in and permission as `templates.import`. Stored under
`<stateHome>\.cg-runtime\bridge-pages\` (beside `bridge-templates\`, never inside it: the registry
reads every file there as a template, `B-116`), one file per picture, `<sha256>-<w>x<h>.<ext>`.

### 0.4 How pictures reach CasparCG — the first decision, MEASURED and OVERTURNED

Templates are served by `TemplateHttpServer` (`:7911` for the service), URL
`http://<advertised host>:<port>/template/<serveKey>`, `no-store` on every answer. Its route set was a
written boundary — `SECURITY.md`: "THE TEMPLATE-SERVING ORIGIN HOSTS NOTHING BUT TEMPLATES" — and the
page's CSP took images only as `data:`.

**First built: the picture inside the operator's own `CG UPDATE`, as a `data:` image** — the road that
moved no boundary. Measured on the owner's CasparCG 2.5.0 (`127.0.0.1:5250`, channel 1 at 1080p50):
AMCP reply 33–48 ms and page shown 89–115 ms for ~1 MB scans, CasparCG's log +1.43 MB per page (it
logs every command in full at `info`). Then the memory, which decided it:

| `CG UPDATE` payload, each | updates | CasparCG main process, private | per update |
| ------------------------- | ------- | ------------------------------ | ---------- |
| ~16 bytes                 | 600     | +0 MB                          | 0          |
| ~20 KB                    | 600     | +33 MB                         | ~56 KB     |
| ~1 MB                     | 60      | +154 MB                        | ~2.6 MB    |

**CasparCG 2.5.0 keeps memory in proportion to every `CG UPDATE`'s bytes, for the life of the
process** (a `CLEAR` gave none of it back: 899 → 889 MB). Paging a 300-page book of 1920×1080 pages
(~15 KB each) back and forth three times grew the main process by 60 MB, ~33 KB per turn. A book of
real scans would add ~2.6 GB per pass. Inline delivery fails the prompt's own requirement ("the
CasparCG process memory stays flat"), so it was overturned.

**Built instead — what the prompt asked for in the first place** ("served to CasparCG by the same
server and host rule that serves templates today … do not open a new port"): a turn NAMES its picture,
`__cg.page.media = { <sha256>: "/page/<sha256>.<ext>" }`, root-relative, and the page fetches it from
its own origin. The template server gains one read-only route, `GET /page/<sha256>.<ext>`: only
pictures CG Bridge stored after its own checks, GET only, `no-store` (the Playout team's rule 12),
`nosniff`, `404` for anything else. The CSP admits it as `img-src data: 'self'`. `SECURITY.md` is
amended to name the third route and why; the route-set guard pins all three by name and kind and
probes the route's edges. Measured with this transport, same book, same CasparCG:

|                                                 | inline (overturned)                     | page route (built)                                                                          |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| CasparCG main process, private                  | 653 → 714 MB over 1,796 turns, climbing | 826.0 → 827.6 MB over 1,198 turns, then released to 775.8                                   |
| the template's renderer (private / working set) | plateau after warm-up                   | 77 → 81 MB / ~620 MB, flat                                                                  |
| AMCP reply per turn                             | 12 ms p50                               | 2 ms p50, 5 ms max (1,198 turns)                                                            |
| CasparCG log, whole run                         | 37.7 MB / 1,796 turns                   | 0.5 MB / 1,198 turns                                                                        |
| blank frames (FILE consumer, every frame)       | —                                       | **0** of 3,159 on-air frames; darkest paper 239 (lit ≈ 237, black 0); 602 page changes seen |

Those frames were recorded at Cut. **At Crossfade** (§2a, the book default after the owner's
report), 80 turns of the same book, every frame recorded: **0 blank frames and no darker frame
between pages** — 2,481 of 2,484 frames from the first page on sit in the top brightness bucket; the
three below are page 1's own fade-in at the take. CasparCG's CEF honours `plus-lighter`.

### 0.5 Golden rule 10

Next / Previous / Go to are PLAYOUT verbs: each operator press sends exactly one `CG UPDATE` naming
exactly the page asked for, and nothing is sent ahead (no speculative preload — a command the
operator did not ask for). The gate is whether the row's template is ON ITS LAYER (pre-rolled or on
air — the bridge's `#loaded`): `CG UPDATE` needs a producer, and a pre-rolled page must open on the
page the operator chose. With nothing on the layer a turn and a new book are STATE ONLY: stored,
shown on every console, carried by the next take. Changing the pages of a row keeps the page number
when the new book still has it, else page 1, told in the same command as the new book.

### 0.6 Concurrency — a row's book moves one press at a time

The bridge dispatches requests without awaiting the previous one, and a turn reads the page, awaits
CasparCG's reply and only then records the new page. Measured on CasparCG 2.5.0: ten Next presses
sent at once all answered page 2. A row's turns, and an update on a row with a book, now queue
(`#withPageQueue`, the live-seat lock's own body lifted into one helper); the take does not (the
repair verb never queues). The same burst now answers pages 2 … 11, in order.

## 1. Schema (additive, no schema-version bump)

- `SequenceImageItemSchema` `{ kind: 'image', id, assetId?, media?, name?, dwellMs? }`, refined to
  carry exactly one of `assetId` (an authored page, a project asset) or `media` (an operator page,
  the SHA-256 of a picture the bridge holds). `name` is the file name, for people.
- `SequenceElement.imageFit` — the image element's `fit` values, default `contain`, one setting for
  every picture of the sequence.
- `ListField.pages?: true` — this list is a page list (its items are picture items).
- `CgControl.page?: { field, index, media? }` — `index` 0-based; `media` maps SHA-256 →
  `/page/<sha256>.<ext>`, and the reader keeps an entry only when it is that path for that very hash
  (no host, no `data:`, no other picture).

## 2. The page

- A picture item is drawn by `buildImage` (exported from `scene-builder.ts`) for a synthetic image
  element the size of the sequence box, inside the usual item cell. Its `src`: an authored page from
  the host's `assetUrls` (the export), or — Designer preview — the preview's own `data-cg-asset-id`
  walk; an operator page from the address its turn named.
- **Decode before swap.** The incoming picture is decoded (`img.decode()`) before it enters; a page
  whose picture cannot be fetched or decoded leaves the current page on screen. A blank frame is
  never produced by a page turn (§0.4: none in 3,159 recorded frames).
- `next()` unchanged; `previous()` mirrors it (no wrap on a finite sequence; wraps to the last item
  under `'infinite'`); `goTo(index)` is absolute and latest-wins: a request during a transition is
  kept and applied when it ends, never dropped. Before a run starts, `goTo` sets the page the run
  starts on.
- Memory: nodes exist only for the page on screen and the one coming in; the page keeps the
  addresses of the three most recent pictures.

## 2a. Fade and crossfade (the owner's report: Hide-show jumped)

A sequence edge may be `fade` (schema, additive): no motion, opacity eased over `transitionMs`.
Fade/fade under `simultaneous` is a DISSOLVE. Two half-faded layers laid one over the other cover
only 75 % mid-way — an opaque page visibly darkens on air — so the driver ADDS them for the length of
the dissolve (`mix-blend-mode: plus-lighter` on both items, `isolation: isolate` on the box): old ×
(1 − t) + new × t, exact for a page and for text. The styling is cleared when the item rests.
Presets: `Crossfade` (fade/fade simultaneous) and `Fade out, fade in` (fade/fade sequential). The
Inspector names the preset field `transition` and the time field `transition time` (both were
"transition"), in SECONDS like the dwell beside it (it was ms), and withholds the time under
Hide-show, saying why. A new book crossfades.

## 3. Designer

`Add pictures…` (many files) and `Add folder…`; files sorted by `naturalCompare` (new, in
`@cg/text-shaping`: digit runs compared as numbers in any of the three digit sets), imported through
the existing asset store (SHA-256 dedupe), one picture item each. The first pictures make the
sequence a book: Crossfade (`fade`/`fade`, §2a), `advance: 'manual'`, `repeat: 1`. A sequence whose
items are all pictures may take a Data key; the seeded list field is a page list.

**The Inspector keeps a card, not a row per page** (the owner's report: 88 pages filled it): the
count, the first four thumbnails, `Manage pages…`, and the add row — `Add pictures…`, `Add folder…`,
`Add text`, `Add composition` (one component, `PageAddButtons`, shared with the manager; beside an
item editor it keeps only the picture buttons, so no surface offers the same act twice). **The Pages
manager** shows every item as a numbered card: a picture as its thumbnail with its file name, a text
item as a text box typed where it stands (in the sequence's Digits, through the item editor's own
`shown` / `typedInto`), a composition item as its picker. Drag to move (a selection moves together),
`‹ ›` for one step, click a thumbnail or a card's number to select (Shift-click a run), Remove
selected, `×`, Sort by name (natural order; a text item keeps its place), the add row, and a List
view that is the sequence's own item editor (dwell, data keys). Each change is one store edit; Done
only closes. Thumbnails are scaled once to 320 px WebP and cached, two at a time. Every control
carries a tooltip, and the tooltip layer is portaled to the body above every layer (it drew under
the dialog — the owner's report).

**The pages render where the author works.** The canvas and Preview read a picture's blob URL from
the asset URL cache, which only the Assets panel primed for new assets; with that panel closed every
page drew `missing image` (the owner's report). The app now primes on every import.

The Preview transport gained Previous; Play / Pause / Out / Stop share a row and Previous / Next the
row below, half each, so all six stay inside the panel (the owner's report: Next was pushed off it).

## 4. CG Control and CG Bridge

- Import records `pageLists: [{ fieldId, wrap }]` on `TemplateInfo` (the sequence bound to a page
  list; `wrap` = its `repeat` is infinite), so every console and the bridge know it.
- `pages.put` stores one picture (PNG, JPEG or WebP; header-checked; limits below) and answers its
  SHA-256 and size. The row's page list is an ordinary field value of picture items naming those
  hashes, so it is persisted, synced to every console and applied by the existing `stack.update`;
  the bridge refuses a page list naming a picture it does not hold.
- `stack.page { itemId, field, to: 'next' | 'previous' | <page number> }` moves the row's page. The
  row state carries `pages: { <fieldId>: <0-based index> }`, persisted with the row.
- A take carries the template's FIRST page list's current page (`CgControl.page` is one member); an
  update of a row's page list carries the page now shown (kept, or page 1).
- The console: the Inspector's page list loads pictures or a folder (natural order) and states the
  count; once applied, a book bar reads `12 / 300` with Previous, Next, and a page box with Go on one
  line. The row shows `12 / 300`; its NEXT turns the page, and PREV is in the row's menu — the row's
  button columns are fixed by the header, and a seventh button wrapped the row onto two lines.
- Removal: when a row is removed, every stored picture no other row names is deleted; at start, the
  same sweep runs against the restored rows. A picture loaded in the last 30 minutes and never named
  is kept until then (a console may still be sending a book's other pages).
- **Limits**: a picture at most **4 MB** and **3840 × 2160** pixels (4096 a side); a row at most
  **500 pages**. Refusals name the file and the limit in the operator's words.
