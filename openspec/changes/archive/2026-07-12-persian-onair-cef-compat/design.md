# Design — B-066: CEF-incompatible `replaceAll` aborts template boot (persian-onair-cef-compat)

## 1. Causal analysis — one bug, three symptoms

Verified against `main` (`0ebf4ff`) and confirmed independently by the
Designer track's parallel trace:

```
bindings.ts:133  original.replaceAll(placeholder, value)   ← Chromium 85+
        ▲
createRuntime(scene)
  └─ applyScopedFieldValues(scene, scene, {}, tree)   ← runs DURING construction,
       └─ applies field DEFAULTS through every text binding → hits replaceAll
              ⇒ THROWS on CEF < 85 — the template script ABORTS at boot
        ▼
exported boot script (buildSingleFileHtml — the one page CasparCG loads,
bridge-served /template/<id> AND the file-drop export):
    var runtime = CG.createRuntime(scene, …);   ← throws HERE
    CG.installCasparGlobals(runtime);           ← never runs
        ⇒ SYMPTOM 2: "update is not defined" / "play is not defined"
           (installCasparGlobals is what defines the bare
           window.play/update/stop/next — verified; the page never got there)
        ⇒ SYMPTOM 3: Persian "????" — nothing rendered at all; with the
           stage dead there is no glyph to show. The payload path is clean
           (§3), so the "????" is a downstream effect, not an encoding bug.
```

The cascade is proven by test (§5): with `String.prototype.replaceAll`
DELETED (faithful CEF-71 emulation), the pre-fix boot throws exactly this
way; post-fix the same boot completes, the bare globals exist, and a
simulated CasparCG `update(json)` renders Persian.

## 2. The CEF baseline: Chromium 71, and why

- The repo already declares it twice: the IIFE bundle targets `chrome71`
  ("the oldest supported CEF — CasparCG 2.3 LTS ≈ Chromium 71",
  `bundle-runtime.mjs`) and the exporter's CSS comment pins "CEF 63=2.2,
  71=2.3.x, 117=2.4.x". ADR-0006's hardware validation ran on CasparCG
  2.3.2 — the 2.3 LTS lineage is the support floor.
- The live failure brackets the rig's CEF: chrome71-target SYNTAX parsed
  fine (the error was a runtime TypeError, not a SyntaxError) but
  `replaceAll` (85) was missing → CEF ∈ [71, 84]. Consistent with the 2.3
  lineage. The live checklist asks the owner to note the exact CEF version
  from the logs for the record.
- **The gap this bug exposed**: esbuild `target: 'chrome71'` down-levels
  SYNTAX (optional chaining, class fields, …) but does NOT polyfill or
  down-level BUILT-IN METHODS. `replaceAll` sailed through a
  correctly-targeted bundle. Method compatibility needs its own guard (§4).

## 3. The "????" trace — every repo hop is UTF-8; no encoding fix needed

End-to-end audit of the field-value path (all verified in code this
session, several already CI-proven):

| Hop                                                 | Mechanism                                                                                                                                                 | Verdict |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `.vcg` pack → unpack                                | byte-level zip; `TextDecoder` (UTF-8) on read                                                                                                             | clean   |
| Runtime app → bridge (templates.import, stack.load) | browser `WebSocket.send(string)` — RFC 6455 text frames are UTF-8                                                                                         | clean   |
| bridge WS receive                                   | `data.toString()` — Node Buffer default UTF-8                                                                                                             | clean   |
| bridge → command line                               | `JSON.stringify` + frozen `quote()` (B-041, hardware-validated)                                                                                           | clean   |
| wire write                                          | `sock.write(line + '\r\n', cb)` — Node stream default write encoding UTF-8; the `setEncoding('utf-8')` on the socket is READ-side only                    | clean   |
| wire → decode                                       | already CI-proven: the B-041 matrix sends Persian through this exact transport and asserts byte-exact after the mock's two-layer (AMCP + V8-embed) decode | clean   |

There was no `latin1`/`ascii`/`binary` encoding anywhere on the path (the
only ASCII Buffer in the tree is the OSC `#bundle` header constant —
ASCII-only content, unrelated). Conclusion, matching the parallel trace:
the observed "????" was a DOWNSTREAM effect of the boot abort (nothing
rendered), and any "?" seen in CasparCG's own console/log window is that
log's ANSI-codepage transliteration — a display artifact of the
observation channel, not wire corruption. **`quote()` and the B-041 escape
rule are untouched** (the tripwire was never approached).

What this change still adds: the one segment no test covered — a REAL
packed `.vcg` with Persian field DEFAULTS through unpack → delivery →
`TemplateInfo` → bridge load → mock-decoded `CG ADD` — is now locked
byte-exact with an explicit zero-"?" assertion, so any future
downconversion anywhere on the path turns a live mystery into a red test.

## 4. The durable guard — why these mechanisms

1. **Bundle-artifact scan (test)**: the emitted `cgJs`/`cgJsIife` strings
   are the exact bytes CasparCG executes, INCLUDING bundled dependencies
   (zod rides in via `@cg/shared-schema`). Only an artifact-level check
   can see a banned method inside a dependency. The banned list is
   curated against Chromium 71 (notably: `Object.fromEntries` (73),
   `matchAll` (73), `Promise.allSettled` (76), `replaceAll` (85),
   `Promise.any` (85), `String/Array.at` (92), `Object.hasOwn` (93),
   `findLast/findLastIndex` (97), `structuredClone` (98)).
   `flat`/`flatMap` (69) and `trimStart/End` (66) are ALLOWED — under the
   baseline. The audit found `replaceAll` as the sole current offender;
   the one in-tree `flatMap` is legal.
2. **Compat lint via `no-restricted-syntax`**: flags the banned calls at
   the offending SOURCE line during dev, in the packages whose code ships
   to CEF (`@cg/template-runtime`, `@cg/shared-schema`). Chosen over
   `eslint-plugin-compat` because that plugin checks **Web APIs** (fetch,
   observers), not ES built-in METHODS — it would not have caught
   `replaceAll`. Chosen over `eslint-plugin-es-x` to avoid a new
   dependency whose ES-version presets misalign with a Chromium-version
   baseline anyway (Chrome 71 straddles ES2018/19) — the curated selector
   list IS the baseline, kept in ONE shared config next to a pointer at
   the bundle test's mirror list.
   Name-based matching (any `.replaceAll(` call, receiver-blind) is
   deliberate paranoia: a compat gate should over-flag, and an
   intentional exception can disable the rule locally with a comment.
3. **esbuild `target: 'chrome71'` everywhere CasparCG-facing** (syntax
   belt-and-suspenders): already true for the IIFE; now also the `.vcg`'s
   `cgJs` ESM (the `.vcg` index.html is a CasparCG-loadable page — es2022
   output would SyntaxError on CEF 71 before any boot error could even
   surface) and `tools/template-fixtures/build.mjs`. The Designer preview
   consumes the same `cgJs` — chrome71 output is merely more conservative
   syntax there, behavior-identical.

## 5. The fix + the boot hardening

- `bindings.ts`: `original.replaceAll(placeholder, value)` →
  `original.split(placeholder).join(value)`. Exact same semantics for a
  LITERAL placeholder (all occurrences, no regex interpretation — regex
  metacharacters in a placeholder like `{{n$m}}` are inert by
  construction, which a global-regex rewrite would have had to escape).
  ES3-era methods; nothing to guard.
- The single-file boot script (the page CasparCG loads) wraps its boot in
  the fixtures' proven `try/catch` + "cg boot error" `<pre>` pattern: a
  future boot-time failure paints a visible red error on the output
  instead of a silent blank page whose only trace is a mystifying
  "update is not defined" in the CEF console. Happy-path behavior is
  byte-identical; this is additive visibility (and it keeps the
  createRuntime → installCasparGlobals order — installing globals against
  a runtime that failed to construct is not possible).
- NOT changed: the `CG ADD`/`CG PLAY`/`CG UPDATE` verb sequence. ADR-0006
  hardware-validated it on CasparCG 2.3.2; `CG INVOKE` and `CALL` were
  hardware-DISPROVEN (empty/`[object Object]` params — see
  `command-builder.ts` provenance + `tools/caspar-amcp-probe`). The
  "entrypoints undefined" symptom is fixed by making the served page boot
  (and visibly report if it can't) — not by re-litigating the verbs.

## 6. Test strategy (red-first)

- **Bundle compat scan** (`@cg/single-file-export`): scans both emitted
  bundle strings for the banned list — RED today (`replaceAll` ×2, one per
  bundle), green after the fix; permanent regression net for the class.
- **CEF-emulation boot cascade** (`@cg/template-runtime`): delete
  `String.prototype.replaceAll` in the test env, run the boot sequence
  (`createRuntime` → `installCasparGlobals`) on a Persian lower-third with
  field defaults — RED today (throws exactly like CEF), then: no throw,
  `window.play/update/stop/next` defined, `update('{"…":"سارا"}')`
  renders the Persian value. Plus a direct bindings test: placeholder
  replacement replaces ALL occurrences and a regex-special placeholder
  stays literal, via the CEF-safe path.
- **Boot-error visibility** (`@cg/single-file-export`): the produced HTML
  carries the try/catch + "cg boot error" pre (string-level), so the
  hardening can't silently regress.
- **Persian byte-exact end-to-end**: (a) `apps/runtime` — a real packed
  `.vcg` with Persian defaults keeps exact codepoints through
  `produceTemplateDelivery` (fields + served scene literal); (b)
  `tools/caspar-bridge` — a Persian field default loaded through the
  bridge lands in the mock's two-layer-decoded `CG ADD` payload with the
  exact codepoints and zero `?`. Expected green immediately — that IS the
  §3 finding, locked against regression.
- CI discipline: bridge suite green in isolation AND under the full
  parallel `pnpm test`; every socket/server released deterministically.

## 7. Live-confirmation checklist (the real gate — owner's CasparCG)

1. Export any Persian template from the Designer → import into the
   Runtime app → Load on real CasparCG.
2. `CG ADD` shows NO "replaceAll is not a function", NO "cg boot error"
   pre on the output, and NO "update/play is not defined" in the CEF log.
3. `window.play`/`window.update` are DEFINED (CEF devtools or log).
4. The template RENDERS, and the rendered Persian is correct — no "?"
   (the render is the ground truth; CasparCG's console may still
   transliterate Persian to "?" in its OWN log display — that is the
   log's codepage, not the payload).
5. Note the CEF/Chromium version from the CasparCG logs for the record
   (expected ∈ [71, 84] per §2).
6. This unblocks the D-119 Persian starter-template re-test.

## 8. Accepted residuals

- The baseline is a POLICY (support the 2.3-LTS CEF floor). If the owner's
  rig turns out to be ≥ Chromium 85 after all (checklist §7.5), the guard
  is simply stricter than strictly needed — the safe direction.
- The banned-method list is curated, not exhaustive; the bundle test and
  the lint share one list, and any newly-noticed post-71 built-in is a
  one-line addition to each.
- CSS compatibility is out of scope (the exporter already keeps CSS
  conservative per its CEF-compat comment); this change covers JS.
