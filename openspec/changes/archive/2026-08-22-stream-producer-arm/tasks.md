# Tasks — stream-producer-arm (C-025)

## 1. Schema and validation (`@cg/shared-ipc`)

- [x] 1.1 `STREAM_URL_SCHEMES` — the nine, with the load-bearing docstring: the list states what
      the CLIENT requires the product to accept, never a CasparCG/ffmpeg capability claim; widening
      is a product decision, not a discovery
- [x] 1.2 The `stream` arm on `SourceProducerSchema` — `{ kind: 'stream', url: min(1) }`, its
      docstring naming why it is not a `media` extension and where the scheme rule lives
- [x] 1.3 The scheme rule in `validateSourceCatalog` — ONE spelling, reached at LOAD and at every
      CHANGE by bridge and mock; refuses an absent scheme and a scheme outside the nine, naming the
      source and the scheme; scheme comparison case-insensitive (RFC 3986 §3.1)
- [x] 1.4 `stream-scheme-not-allowed` added to `SOURCES_SET_CONFIG_REASONS` with its one-line
      rationale beside the existing four ("not allowed", not "unsupported")
- [x] 1.5 Tests: union parses the arm; the nine accepted (each, and `RTMP://` case); outside-scheme
      and no-scheme refused with the named code through the same door `duplicate-name` uses; the
      aspect fall-through pinned (no format ⇒ explicit aspect ⇒ null — AUTO's branch, no required
      field); the media arm not narrowed (a URL in `file` still passes); the reasons census updated
      to five. Every new assertion was seen RED (pre-implementation run, or a targeted mutation for
      the born-green ones) — the reds are recorded in the session report.

## 2. The bridge (`@cg/caspar-bridge`)

- [x] 2.1 `producerArgument` gains `case 'stream'` → the URL, quoted, exactly as `media` — the
      exhaustive no-default switch forced this at compile, as designed
- [x] 2.2 `playSource`'s doc updated: "four spellings" → five, with this arm's standing stated
      honestly — the owner ran `PLAY 1-<layer> "<url>"` BY HAND on the plant and it played; one
      manual run, not a suite (distinct from `decklink`/`ndi`'s parse-verified-only standing)
- [x] 2.3 `canHoldLivePlate` answers `true` for a stream (a continuous signal, no timeline to run
      out), with the doc naming the stalled-stream caveat as B-086's axis and C-025-v1 out of scope
- [x] 2.4 Tests: `PLAY 1-10 "<url>"` byte-exact; quote-identity for a URL carrying `? & = : /`;
      the hold answer. All seen RED first (`PLAY 1-10 undefined`, `undefined to be true`).

## 3. The Runtime surface (`@cg/runtime`)

- [x] 3.1 The fifth kind in `SourcesModal`: `PRODUCER_KINDS` (placed with the signal-bearing
      producers, `media` kept last as the odd one out), `KIND_LABEL` (`Internet stream (URL)`),
      `emptyProducer` (default URL passes the allowlist so the kind switch itself is never
      refused), `describeProducer` (`stream <url>`), and the URL field (`Stream URL`, placeholder
      `rtmp://server/live/stream`)
- [x] 3.2 The operator sentence for `stream-scheme-not-allowed` in `sourcesReasonMessage` —
      compile-forced by the `satisfies Record` over the shared reason union
- [x] 3.3 DOM tests (`sourcesModal.dom.test.ts`, new): five options with the stream labelled as a
      feed; choosing stream renders the URL field; a bad scheme is refused with the named sentence
      through the modal's message region (the stub runs the REAL shared validator); an accepted URL
      commits and clears the refusal; switching kinds discards the previous arm's fields. All five
      seen RED first (four options, no URL field, no region).
- [x] 3.4 The mock↔bridge parity guard re-run after the arm landed: green unmodified — validation
      is shared and the bridge method tree is unchanged, which is exactly why it holds
- [x] 3.5 E2E (`live-source-sources.spec.ts`): the stream steps added to the sources scenario —
      fifth option, URL field, visible named refusal for `ftp://`, accepted `srt://` reading back
      as `stream <url>`

## 4. Verification

- [x] 4.1 `pnpm gate` green, uncached
- [x] 4.2 Linux `gate:e2e` debt — DISCHARGED: the `E2E (Playwright)` job RAN (not skipped) and
      completed green on `fef781cb` (the commit carrying this change) —
      https://github.com/yasermostafaee/cg/actions/runs/32575013749
