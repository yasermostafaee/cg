# Phase 4 — Export Architecture

What comes out of the Designer and how it's consumed by CasparCG and by the Runtime. Contracts, pipelines, and the JS surface the broadcast HTML must expose.

---

## 1. The Broadcast Template Contract (what `index.html` exposes)

The exported HTML must satisfy **two simultaneous consumers**: CasparCG's HTML producer (production playout) and the Designer's preview iframe (WYSIWYG editing). Both speak through the same JS surface.

### 1.1 Internal API — `window.cg`

```ts
// Shipped inside index.html by @cg/template-runtime
declare global {
  interface Window {
    cg: TemplateRuntime;
  }
}

interface TemplateRuntime {
  /** Resolves when fonts, assets, and scene init are complete. */
  ready: Promise<void>;

  /** Play entry animation. Resolves when entry animation ends. */
  play(data: FieldValues, opts?: { frame?: number }): Promise<void>;

  /** Apply new field values. Default mode = merge (only changed fields).
   *  Resolves when DOM has reflected the change (1 frame). */
  update(data: Partial<FieldValues>, opts?: { mode?: 'merge' | 'replace' }): Promise<void>;

  /** Play exit animation. Resolves when exit ends and DOM is hidden. */
  stop(opts?: { immediate?: boolean }): Promise<void>;

  /** Optional. Advance to next state for paginated templates (ticker pages). */
  next?(): Promise<void>;

  /** Hard cleanup — kill timelines, detach listeners. Synchronous. */
  remove(): void;

  /** Subscribe to lifecycle events (used by the editor preview). */
  on(
    event: 'ready' | 'play.start' | 'play.end' | 'update' | 'stop.start' | 'stop.end' | 'error',
    cb: (e: unknown) => void,
  ): () => void;
}
```

**Invariants:**

- All async methods are **idempotent and re-entrant**: `update` during `play` is allowed; `stop` during `update` cancels the update.
- `play` MUST NOT throw on missing fields — it falls back to declared defaults.
- `update` validates against the field schema; invalid values log a `cg.error` event but do not throw.
- `remove` is the only synchronous method; after it runs, `window.cg` is no longer usable.

### 1.2 CasparCG-facing adapter — global functions

CasparCG's HTML producer calls **bare global functions**. The runtime ships a thin adapter:

```ts
// Auto-installed by @cg/template-runtime when document.readyState becomes 'complete'
window.play = (payload?: string) => window.cg.play(parsePayload(payload));
window.update = (payload?: string) => window.cg.update(parsePayload(payload));
window.stop = () => window.cg.stop();
window.next = () => window.cg.next?.();
window.remove = () => window.cg.remove();

// CasparCG passes JSON-stringified data; legacy installs pass XML.
function parsePayload(s?: string): FieldValues {
  if (!s) return {};
  if (s.trim().startsWith('<')) return parseLegacyXml(s); // <templateData><componentData id="headline" ...>
  return JSON.parse(s);
}
```

JSON is the canonical wire format; XML is a one-way compatibility shim for stations migrating from legacy templates.

### 1.3 Designer-preview adapter — `postMessage`

The Designer drives the preview iframe via `postMessage`. The same `@cg/template-runtime` installs a listener:

```ts
// Inbound (parent → iframe)
type PreviewIn =
  | { kind: 'play'; data: FieldValues }
  | { kind: 'update'; data: Partial<FieldValues>; mode?: 'merge' | 'replace' }
  | { kind: 'stop'; immediate?: boolean }
  | { kind: 'remove' }
  | { kind: 'setField'; fieldId: string; value: unknown } // designer-only live edit
  | { kind: 'setScene'; scene: Scene } // hot-swap during edit
  | { kind: 'screenshot'; at: 'pre' | 'mid' | 'post' } // for thumbnails
  | { kind: 'seek'; frame: number }; // scrub timeline

// Outbound (iframe → parent)
type PreviewOut =
  | { kind: 'ready'; resolution: Resolution; fps: FrameRate }
  | {
      kind: 'lifecycle';
      phase: 'play.start' | 'play.end' | 'update' | 'stop.start' | 'stop.end';
    }
  | { kind: 'error'; code: string; message: string; elementId?: Id }
  | { kind: 'metrics'; firstPaintMs: number; entryEndedMs: number }
  | { kind: 'shot'; pngBase64: string };
```

Same module, two adapters — one binary on disk, runs identically in CasparCG and in the editor.

---

## 2. Bootstrap Sequence (inside `index.html`)

```
[ document parsed ]
        │
        ▼
1.  Load CSS (single bundled cg.css, includes @font-face)
2.  Preconnect / preload font files (link rel="preload" as="font")
3.  Load @cg/template-runtime (single bundled cg.js, ~40-80 KB gz)
4.  Fetch template.json (relative path)            ─┐
5.  document.fonts.ready                             ├─ awaited in parallel
6.  Decode all <img> referenced by ImageElements    ─┘
        │
        ▼
7.  Build scene DOM from template.json (createElement; no innerHTML for content)
8.  Resolve bindings (fields ↔ elements); attach formatters
9.  Pre-build GSAP timelines for entry/loop/exit (paused at frame 0)
10. Install window.cg, install global adapters, install postMessage listener
11. Emit ready event (cg.ready resolves; postMessage 'ready')
12. Wait for play() — DO NOT auto-play

NOTE: Nothing is visible until step 11 because <body> has class="cg-pending"
      whose CSS rule is `visibility: hidden`. First DOM paint shows nothing.
```

**Auto-play would defeat take/preview/program** — operators must drive the entry frame.

---

## 3. Content Security Policy

Shipped in `index.html` as a `<meta http-equiv="Content-Security-Policy">` tag and **also** enforced by the Designer iframe's `csp` attribute and by Electron's `webRequest.onHeadersReceived` for the preview origin.

```
default-src 'none';
script-src  'self';
style-src   'self';
font-src    'self';
img-src     'self' data:;
media-src   'self';
connect-src 'none';
frame-ancestors 'self';
base-uri 'none';
form-action 'none';
```

- **No `unsafe-eval`**: modern GSAP doesn't need it; we ship pre-bundled.
- **No `unsafe-inline`** for styles or scripts: all styles in `cg.css`, all scripts in `cg.js`.
- **`connect-src 'none'`** prevents a template from phoning home — broadcast templates have no business making network calls.
- **`img-src data:` is allowed** for tiny inline placeholders only; binary images come from the bundled `assets/` directory.

Templates that violate CSP fail-fast in the editor (operator sees the error before export).

---

## 4. Font Loading Order

```
HTML head
└── <link rel="preload" as="font" type="font/woff2" crossorigin
         href="fonts/Vazirmatn-Regular.woff2">  (one per declared weight)

cg.css
└── @font-face { font-family: 'Vazirmatn'; src: url('fonts/...woff2') format('woff2');
                  font-weight: 400; font-style: normal; font-display: block; }
```

- `font-display: block` (not `swap`) — broadcast cannot tolerate a fallback flash. Block until fonts are ready, but `document.fonts.ready` is awaited in step 5 of the bootstrap, so block has bounded duration.
- The Designer warns if any text element references a font family **not declared in `scene.fonts`** (forces designers to declare deps explicitly).
- Fonts ship **inside the .vcg** (`fonts/` directory), so the Runtime's "missing font on the playout machine" failure mode is eliminated by construction.
- Persian fonts (Vazirmatn, Noto Sans Arabic) are pinned to specific releases and checksummed in `manifest.fontDeps`.

---

## 5. Asset Path Resolution

All paths in `template.json` and `index.html` are **relative to `index.html`**:

```
file:///C:/playout/templates/extracted/<id>/index.html
                                            ├── assets/img/logo.png
                                            ├── assets/lottie/intro.json
                                            └── fonts/Vazirmatn-Regular.woff2
```

- The Runtime extracts each `.vcg` to a working directory under `%PROGRAMDATA%\BroadcastCG\templates\<templateHash>\`.
- Extraction is **content-addressed by `templateHash`**, so re-importing the same `.vcg` is a no-op.
- The Designer preview uses an Electron custom protocol `cgpreview://<sessionId>/` mapped to the in-progress scene's working directory.
- No absolute paths, no `file://` literals in the template — portable across machines.

---

## 6. Frame-Rate Sync

CasparCG's HTML producer (CEF) runs `requestAnimationFrame` at the channel's frame rate (vsync-locked). The runtime uses **GSAP's ticker** which inherits rAF, plus an explicit conversion layer.

```ts
// Pseudo-contract — implementation deferred to Phase 9
type Clock = {
  framesToSec(frames: number): number; // frames / scene.frameRate
  secToFrames(sec: number): number;
  currentFrame: number;
};

// Every preset's duration is interpreted through Clock:
gsap.to(el, { x: 0, duration: clock.framesToSec(preset.duration), ease: preset.easing });
```

When the actual host frame rate differs from `scene.frameRate` (e.g., a 50fps template loaded on a 60fps channel), the runtime emits a `cg.warning` event but **plays at the host rate**. Frame counts become approximate; this is logged in the audit trail.

**Cardinal rule:** the broadcast renders at the _channel's_ rate. The scene's declared rate is for animation math only.

---

## 7. The Export Pipeline (Designer → `.vcg`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. PRE-FLIGHT VALIDATION                                                │
│    • Zod-validate Scene                                                 │
│    • Zod-validate every Element and FieldBinding                        │
│    • Check no binding refers to undeclared field      (error)           │
│    • Check no field is unbound                        (warning)         │
│    • Check every Element.assetId resolves              (error)          │
│    • Check every TextElement.font.family ∈ scene.fonts (error)          │
│    • Check resolution and frameRate are in allowed set (error)          │
│    • Render headless preview → capture metrics; fail if firstPaint >    │
│      budgeted threshold or layout errors logged                         │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. ASSET NORMALIZATION                                                  │
│    • Re-encode images to original format (recompress only on request)   │
│    • Strip EXIF / metadata                                              │
│    • Deduplicate by sha256 (multiple elements ↔ same asset = 1 file)   │
│    • Validate Lottie JSON (lottie-web schema; reject unsupported features│
│      like expressions, layer styles, certain matte modes)               │
│    • Validate video codecs (h264 / prores422 only — CasparCG playable)  │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. CODE GENERATION                                                      │
│    • Render index.html from a frozen template (Mustache-style)          │
│      ─ inlines: scene id, resolution, fps, fonts <link rel="preload">   │
│      ─ references: cg.css, cg.js (both shipped inside zip)              │
│    • Copy cg.css and cg.js from @cg/template-runtime (versioned)        │
│    • Write template.json (Scene, prettified)                            │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. THUMBNAILS                                                           │
│    • Headless render at frame 0 (cold), entry-end frame, and stop-start │
│    • Output thumbnails/320.png and thumbnails/1080.png                  │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. INTEGRITY                                                            │
│    • For every file: sha256, byte length                                │
│    • Build Merkle-style root: sha256( sort(paths).map(sha256).join() ) │
│    • Populate manifest.integrity                                        │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. SIGNING (optional, deployment policy)                                │
│    • Ed25519 sign integrity.root                                        │
│    • Populate manifest.signing { algorithm, publicKeyId, signature }    │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. PACKAGING                                                            │
│    • Zip with STORE (no deflate) for *.png *.woff2 *.json (already      │
│      compressed or trivial) and DEFLATE for *.html *.css *.js           │
│    • No directory entries, no extra attributes                          │
│    • Deterministic ordering: paths sorted lexicographically             │
└──────────────────────┬──────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. ATOMIC WRITE                                                         │
│    • Write to <dest>.vcg.tmp                                            │
│    • fsync                                                              │
│    • Rename <dest>.vcg.tmp → <dest>.vcg  (atomic on NTFS)               │
│    • Emit ExportComplete audit entry                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Determinism:** given identical inputs, two exports produce byte-identical `.vcg` files. This is verified by a CI test (re-export and compare hashes).

---

## 8. Runtime Ingest Path (`.vcg` → on disk → registry)

```
[ Watched folder receives new file ]
        │
        ▼
1.  Detect: filename matches *.vcg, size stable for ≥250ms (avoid partial writes)
2.  Open zip; read manifest.json only
3.  Validate Manifest with Zod
4.  Verify manifest.integrity.files (sha256 every file)
5.  Verify manifest.signing if deployment policy requires it
6.  Check manifest.compatibility.minRuntimeVersion vs current
        │
        ├── fails → quarantine (move to /rejected/), audit, notify UI
        ▼
7.  Compute templateHash = sha256(zip bytes)
8.  If %PROGRAMDATA%\BroadcastCG\templates\<templateHash>\ exists → skip extraction
    else extract zip atomically to a temp dir, then rename
9.  Migrate template.json schemaVersion → current (if needed)
10. Zod-validate Scene
11. Register in TemplateRegistry:
        { templateId, templateHash, name, type, fields, fontDeps,
          path: file:///.../<hash>/index.html, thumbnails }
12. Emit TemplateAvailable event → operator UI refreshes
13. Audit: { action: 'import', templateId, templateHash, outcome: 'ok' }
```

The same `.vcg` is identified by `(templateId, templateHash)`. The Runtime can hold multiple versions of the same template simultaneously; the operator chooses.

---

## 9. AMCP Payload Shape (Runtime → CasparCG)

CasparCG 2.3.x exposes templates through the **HTML producer**. The AMCP wire commands the Runtime sends:

```
# Start a graphic at channel 1, layer 20:
PLAY 1-20 [HTML] "file:///C:/programdata/broadcastcg/templates/<templateHash>/index.html"

# Push field values to the running HTML instance (calls window.update(JSON)):
CG 1-20 INVOKE 1 "update" "{\"headline\":\"خبر فوری\",\"subtitle\":\"OpenAI نسخه جدید\"}"

# Trigger entry animation (calls window.play(...) — or window.cg.play indirectly):
CG 1-20 PLAY 1

# Trigger exit animation:
CG 1-20 STOP 1

# Hard cleanup:
CG 1-20 REMOVE 1

# Or clear the whole layer (also removes HTML):
CLEAR 1-20
```

**Quoting rules** (AMCP is line-oriented; the wire is fussy):

- All string args are wrapped in `"..."`.
- Inner double-quotes are escaped: `\"`.
- Inner backslashes are escaped: `\\`.
- Newlines inside data become `\n`; never raw newlines.
- The Runtime's `caspar-client` package owns this escaping in one place.

**Take sequence** (direct mode):

```
1. PLAY 1-20 [HTML] "file:///.../index.html"     ← loads, awaits cg.ready
2. CG   1-20 INVOKE 1 "update" "{...fields...}"   ← seeds field values
3. CG   1-20 PLAY 1                               ← entry animation
                                                    OSC: layer.foreground arrives
                                                    state → on-air
```

**Update on-air:**

```
CG 1-20 INVOKE 1 "update" "{...changed fields only...}"
                                                    OSC: cg.invoked arrives
                                                    state → on-air (no transition)
```

**Out:**

```
CG 1-20 STOP 1                                     exit animation runs
                                                    OSC: cg.stopped, then layer.empty
                                                    state → idle
CLEAR 1-20                                         (optional — only after exit complete)
```

---

## 10. Round-Trip Diagram

```
DESIGNER                       FILE                       RUNTIME                       CASPARCG
────────                       ────                       ───────                       ────────

[Scene editor]
     │
     │ Export
     ▼
[Validate + bundle] ─────────► template.vcg
                               (atomic write)
                                    │
                                    │ network share / watched folder
                                    ▼
                                                   [Watcher detects]
                                                   [Validate integrity]
                                                   [Verify signature]
                                                   [Extract + register]
                                                          │
                                                   [Operator: TAKE]
                                                          │
                                                          ▼
                                                   [State machine: idle→loaded]
                                                          │
                                                          ├── AMCP: PLAY 1-20 [HTML] "file://..."─────────►
                                                          │                                                  [HTML producer loads]
                                                          │                                                  [cg.ready resolves]
                                                          ◄────────── OSC: layer.foreground (HTML)──────────┤
                                                          │
                                                          ├── AMCP: CG INVOKE 1 "update" "{...}" ───────────►
                                                          │                                                  [window.update(data)]
                                                          ◄────────── OSC: cg.invoked ──────────────────────┤
                                                          │
                                                          ├── AMCP: CG PLAY 1 ──────────────────────────────►
                                                          │                                                  [window.play(data)]
                                                          │                                                  [entry animation runs]
                                                          ◄────────── OSC: cg.invoked (play) ───────────────┤
                                                          │
                                                   [state: on-air]
                                                          │
                                                   [Operator: UPDATE fields]
                                                          │
                                                          ├── AMCP: CG INVOKE 1 "update" "{...}" ───────────►
                                                          │                                                  [window.update(data, merge)]
                                                          ◄────────── OSC: cg.invoked ──────────────────────┤
                                                          │
                                                   [Operator: OUT]
                                                          │
                                                          ├── AMCP: CG STOP 1 ──────────────────────────────►
                                                          │                                                  [window.stop()]
                                                          │                                                  [exit animation runs]
                                                          ◄────────── OSC: cg.stopped ──────────────────────┤
                                                          ◄────────── OSC: layer.empty ─────────────────────┤
                                                          │
                                                   [state: idle]
```

---

## 11. Failure Modes & Mitigations

| Failure                                               | Detection                                                 | Mitigation                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Partial `.vcg` write picked up by watcher             | Filesize unstable for 250ms                               | Watcher waits for stability; atomic export uses `.tmp` + rename            |
| `.vcg` corrupted in transit                           | sha256 file check at ingest                               | Quarantine + audit + UI notification                                       |
| Schema version too new                                | `manifest.compatibility.minRuntimeVersion` check          | Reject with clear "update Runtime" message                                 |
| Font missing on playout machine                       | Fonts ship inside `.vcg`, declared in `manifest.fontDeps` | Impossible by construction; if `source: 'system'`, runtime warns at ingest |
| CSP violation by template                             | CEF console + cg.error event                              | Template fails preflight in Designer → never exports                       |
| CasparCG HTML producer hangs on load                  | No OSC `layer.foreground` within 3s                       | State machine times out, retries `PLAY [HTML]` once, then errors           |
| `update` arrives mid-entry-animation                  | Internal queue in template runtime                        | `update` waits for current animation; merges values; no visible glitch     |
| `stop` mid-`update`                                   | Cancellation token in runtime                             | `update` resolves immediately; `stop` runs exit                            |
| Frame-rate mismatch (50fps template on 60fps channel) | Comparing `scene.frameRate` to host rAF cadence           | Warn; play at host rate; animation durations approximate                   |
| Asset reference dangling (post-migration)             | Pre-flight check at export; ingest re-checks              | Hard error; export blocked                                                 |
| Signature required but absent                         | Manifest signing block missing                            | Deployment policy gate at ingest; quarantine                               |

---

## 12. What's deferred to later phases

- **Detailed AMCP error code handling** → Phase 5 (CasparCG runtime).
- **Sequential / macro playback** (template A → template B with delay) → Phase 6 (UI/UX).
- **Multi-target export** (single `.vcg` containing 16:9 + 9:16 variants) → post-v1; not in v1 schema.
- **Signed update channel for `@cg/template-runtime`** (so templates can be re-bundled with a patched runtime without re-exporting from Designer) → Phase 8 ops concern.
