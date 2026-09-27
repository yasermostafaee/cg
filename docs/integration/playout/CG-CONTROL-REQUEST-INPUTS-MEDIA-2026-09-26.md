# CG Control → Apasai Playout — Request: your input list (D10) and your media library (D11), read-only, for CG Control

> **به همکار گرامی در تیمِ Playout — لطفاً کلِ این فایل را همان‌طور که هست به Claude Code خودتان بدهید.**
> اگر CC کارِ دیگری در دست دارد، بعد از تمام شدنش بدهید.
> این نامه دو endpointِ **فقط‌خواندنی** اضافه می‌کند: لیستِ ورودی‌های ایستگاه (استودیو ۱، استودیو ۲، …) و جست‌وجو در کتابخانهٔ مدیا. روی هیچ کانالی چیزی نوشته نمی‌شود و روی air اثری ندارد.

**From:** CG Control · **Date:** 2026-09-26 · **Re:** contract v1 + Addendum A (C1–C8) + v1.1/D9 → this letter proposes **v1.2 = D10 + D11**. Nothing else in the contract changes.

---

## TASK — for the Claude Code session on the Playout side

### Why

Until now CG Control kept its **own** list of live inputs: an operator typed "studio1 = DeckLink device 1, 1080p5000" into CG Control. That is a second copy of something the Playout already owns, and it goes wrong the moment the two disagree.

From now on **the Playout is the only place inputs and media are defined.** CG Control reads two lists from you:

1. **D10 — the station's inputs:** Studio 1, Studio 2, … Each has its own kind and format; those are your business.
2. **D11 — the media library:** it can be large (thousands of items), so it is **searched and paged on your side**. CG Control never downloads the whole library.

In CG Control, an operator binds each video box of a graphic (we call it a **plate**) to **one of your inputs** or **one of your media items**. CG Control then plays it itself, on its **own** layers (50–99) of a programme channel, over AMCP, exactly as today. The Playout does not play anything for us.

Who reads: **our bridge, server-side.** It uses the same Bearer token and the same path as the D4 and D9 reads, with no `Origin` header. So **no CORS entry is needed** for D10/D11.

---

### D10 — `GET /api/cg/inputs`

**Auth:** `Authorization: Bearer <JWT>`. Any CG role may read it, including `viewer`. There is no per-channel filtering, because the list is station-wide.
**Caching:** `ETag` / `If-None-Match` → `304`. We read it at sign-in, at most every 30 s after that, and when an operator opens the picker.

```json
{
  "inputs": [
    {
      "id": "studio-1",
      "name": "استودیو ۱",
      "casparHost": "192.168.21.111",
      "producer": { "kind": "decklink", "device": 1 },
      "format": "1080i5000",
      "available": true
    },
    {
      "id": "studio-2",
      "name": "استودیو ۲",
      "casparHost": "192.168.21.111",
      "producer": { "kind": "route", "channel": 5, "layer": 10 },
      "format": "1080i5000"
    },
    {
      "id": "web-1",
      "name": "پخش اینترنتی",
      "casparHost": "192.168.21.111",
      "producer": { "kind": "stream", "url": "srt://10.0.0.5:9000" },
      "format": "AUTO",
      "aspect": 1.7778
    }
  ]
}
```

| field        | rule                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | **Stable forever.** It survives a rename and a restart, and it is never reused for a different input. Alphabet `[A-Za-z0-9_-]`, 1–48 characters. CG Control stores it; an operator never sees it. |
| `name`       | The name your operators know it by. 1–64 characters, **unique within the list**. Persian is fine.                                                                                                 |
| `casparHost` | Spelled exactly as in D4. It is the core this input can be played on.                                                                                                                             |
| `producer`   | **Exactly one** of the four shapes below. It is what CG Control will send as `PLAY <ch>-<layer> …` on one of its own layers (50–99) of a programme channel listed in D4.                          |
| `format`     | The signal's CasparCG video-mode name, the same vocabulary as `casparcg.config` (`PAL`, `NTSC`, `720p5000`, `1080i5000`, `1080p2500`, `2160p2500`, …), or `AUTO` when the signal is detected.     |
| `aspect`     | Width ÷ height as a decimal (for example `1.7778`). **Required when `format` is `AUTO` or absent**, and optional otherwise.                                                                       |
| `available`  | Optional. `false` when you know the input is disabled or has no signal right now. We still show it, marked.                                                                                       |

**The four producer shapes, and the exact AMCP each one becomes on our side:**

| `producer`                                       | what CG Control sends                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `{ "kind": "decklink", "device": 1 }`            | `PLAY 2-60 DECKLINK DEVICE 1`. The device may be an index or a persistent ID.         |
| `{ "kind": "route", "channel": 5, "layer": 10 }` | `PLAY 2-60 "route://5-10"`. `layer` is optional.                                      |
| `{ "kind": "ndi", "source": "HOST (Cam 1)" }`    | `PLAY 2-60 NDI NAME "HOST (Cam 1)"`                                                   |
| `{ "kind": "stream", "url": "srt://…" }`         | `PLAY 2-60 "srt://…"`. Allowed schemes: `http https rtmp rtmps rtsp srt udp rtp mms`. |

🔴 **One rule that matters for air:** the producer you give us **must be safe to open while the Playout itself is using that input.** One physical DeckLink input usually admits only one producer. So if your own playout holds the device (for example you air Studio 1 on your channel), give us a `route` to where you hold it, not the raw device. Opening our copy must never disturb yours. If an input cannot be shared at all, leave it out of D10.

- **Why we need `format` / `aspect`:** CasparCG **stretches** a picture to fill whatever box it is placed in. We measured this on real hardware. To keep a guest's picture undistorted inside a graphic's box, CG Control must know the input's shape.
- **What to leave out:** anything CG Control must never use. The list may be empty, and the response is then `{ "inputs": [] }`.

---

### D11 — `GET /api/cg/media`

**Auth:** the same as D10 (Bearer, any CG role). **Read-only.**

**Search / page:** `GET /api/cg/media?q=<text>&type=video,still&sort=name&limit=50&cursor=<opaque>`
**By id** (to re-check the items an operator has already bound): `GET /api/cg/media?ids=m-8841,m-102,…`. It takes at most 100 ids and returns only the ones that still exist. An id that is missing is simply absent from `items`; it is not an error.

```json
{
  "items": [
    {
      "id": "m-8841",
      "name": "تیتراژ خبر ۲۰",
      "clip": "NEWS/TITRAJ_20",
      "type": "video",
      "durationMs": 20480,
      "width": 1920,
      "height": 1080,
      "folder": "NEWS",
      "updatedAt": "2026-09-20T10:14:00Z"
    }
  ],
  "total": 12480,
  "nextCursor": "eyJvIjo1MH0"
}
```

| field             | rule                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable, as in D10. Alphabet `[A-Za-z0-9_-]`, 1–48 characters.                                                                                                                                                                                         |
| `name`            | The title your operators know it by (Persian is fine).                                                                                                                                                                                                |
| `clip`            | 🔴 **Exactly what CasparCG plays:** `PLAY 2-60 "NEWS/TITRAJ_20"` must play this item on the core at D4's `casparHost`. It is the same name `CLS` lists, relative to the core's media folder. **Do not list items the core cannot play by this name.** |
| `type`            | `video` \| `still` \| `audio`. We offer only `video` and `still` for plates.                                                                                                                                                                          |
| `durationMs`      | For `video`.                                                                                                                                                                                                                                          |
| `width`, `height` | When known. We use them for the same stretching reason as D10's `format`.                                                                                                                                                                             |
| `folder`          | Optional path or category. We show it as a small second line, so two items with the same name can be told apart.                                                                                                                                      |
| `updatedAt`       | ISO-8601 UTC. It is used by `sort=recent`.                                                                                                                                                                                                            |

**Search rules (`q`):**

- An empty `q` means every item.
- Split `q` on whitespace. **Every term must match** (AND) a substring of `name` **or** `clip`, case-insensitive.
- 🔴 **Normalise both sides before matching**, because our operators type on Persian keyboards and the library holds names typed on other ones:
  - Arabic `ي` / `ى` → `ی`;
  - `ك` → `ک`;
  - remove ZWNJ (U+200C), tatweel (U+0640) and the Arabic diacritics U+064B–U+065F;
  - digits `۰–۹` (Persian) and `٠–٩` (Arabic-Indic) → `0–9`;
  - collapse repeated spaces.

  Example: `q=خبر 20` must find `تیتراژ خبر ۲۰`, and `q=كليپ` must find `کلیپ`.

**Parameters:**

- **`type`:** a comma list; the default is every type.
- **`sort`:** `name` (the default, Persian collation) or `recent` (`updatedAt` descending).
- **`limit`:** default 50, maximum 200.
- **`cursor`:** opaque, taken from the previous page's `nextCursor`. `nextCursor` is `null` on the last page.
- **`total`:** the number of matches for this query. If it is an estimate, add `"totalIsEstimate": true`.

**Speed (SHOULD):** under 300 ms per page on a library of 50,000 items. Our console asks as the operator types: debounced 250 ms, and at most one request in flight per console. On top of that, the bridge re-checks the bound items by id every 5 minutes.

If your existing media API already holds this data, serve D11 from it, **but the path and the shapes above are the contract.**

---

### Both endpoints

- **On by default on every install, client installs included,** with no switch and no manual step. The client installs everything itself.
- **Errors** use the contract's §4.6 shape: `401 invalid_token`, and `400 invalid_query` for a bad parameter.
- **Air safety:** nothing here writes anything, and neither endpoint may be served from inside the core process. Serve them from the same API server as D1–D9, never from the core, because the `pgm` feed taught us the core's HTTP is not hardened.

---

### Questions — answer inline. Please don't hold the build for them.

- **S1.** Does one Playout install always have **one core** (one `casparHost` in D4)? If not, how should CG Control tell which inputs and media belong to which core?
- **S2.** How does the Playout itself use a DeckLink input while it is on air? Can a second producer (ours) open the same device at the same time on your fork? If not, what will D10 return for it: a `route`, or a dedicated channel?
- **S3.** Does your media library have folders or categories? If so, what does `folder` hold?
- **S4.** For later, not this version: does the library already have **thumbnails**? At what URL, and with what auth?
- **S5.** Are all media files inside the core's own media folder, so that `clip` always plays as-is?
- **S6.** Confirm that `format` uses the `casparcg.config` video-mode names. If you use another vocabulary, send the list.

---

### What to send back

1. The **build number** that carries D10 and D11. **Tell us before it goes onto `192.168.21.111`**, as with 2.8.54.
2. **On `.111`:** please list at least **one input CG Control can really play there.** `.111` has no DeckLink card, so it could be a `stream` or a `route`. Also list a handful of media items, including at least one with a Persian name.
3. The JSON of `GET /api/cg/inputs` on `.111`, and of two `GET /api/cg/media` pages: `?limit=5`, and one with a Persian `q`. **Send JSON only, never a token.**
4. Answers to S1–S6.

**If any part cannot be determined from your source or configuration, say so plainly rather than estimating.**

Contract v1 + Addendum A (C1–C8) + v1.1/D9: **unchanged.** This letter adds D10 and D11 as **v1.2**.
