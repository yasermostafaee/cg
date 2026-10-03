# console-polish — design

## §0 — what was measured before anything was built

### §0.1 The template lists (`B-300`)

- **One list remains.** The Library dialog was folded away by `R-028` and the Import dialog retired by
  `UI-POLISH-01` D (`Import a .vcg` opens the chooser from the picker); `Manage` went in `UI-POLISH-01` C.
  The per-row template picker (`features/fixedLayers/useTemplatePicker.tsx`) IS the per-channel list. Every
  other reader (`useTemplateIndex`) is a name lookup, and it already re-pulls on every push.
- **The bridge already pushes.** `templates.changed` (`shared-ipc/channels/templates.ts`) goes to EVERY socket
  after an import, a successful removal and the upgrade copy, station-wide (`channel-scope.ts`). It names no
  one.
- **The picker did not listen.** It read `templates.list({channel})` once, at open ("pulled at OPEN time
  rather than subscribed"), and again only after its OWN import or removal.
- **What B met.** A Load of a template removed on A: refused `unknown-template`, worded
  `That template is not registered with the bridge — re-import it.` as a toast — and, through §0.2, an
  invisible error item. A remove of it: `Template “<uuid>” is not on CH n.` — the raw id. An import of it:
  accepted (it is simply listed again).

### §0.2 The `N in error` badge (`B-301`)

- **What it counts.** `airTally(onChannel(stack, view))` — every stack item whose status is `error`, in the
  view's channel OR WITH NO SLOT (`onChannel` keeps slotless items in every view; the bridge tells every
  socket about them).
- **A failed import adds nothing.** `importVcgFile` throws before or at `templates.import`; no stack item is
  made.
- **A refused Load adds one, forever.** `#loadFixedImpl` called `reconciler.applyIntent({kind:'load'})` —
  which creates the item — BEFORE its checks (`unknown-template`, `not-fixed`, `wrong-bank`, `slot-bound`);
  each refusal then `applyAck(seq, false, code)` → `error`. No `assignSlot` ran, so the item has no layer: no
  row shows it, no OSC can settle it, `out()` refuses a slotless item, and only Remove All reaches it. It is
  saved to `bridge-stack.json` and re-seeded at start. Each attempt is a fresh `itemId`, so two attempts are
  `2 in error`. The offline mock returns before creating anything, which is why no spec saw it.
- **The owner's two.** A failed import cannot produce them; two refused Loads can — and §0.1 is how a Load
  of a just-removed template happens from a stale picker.
- **No way to list or dismiss.** The badge was a `span` with a `title`.

### §0.3 The picker's tabs and the names (`B-302`, `B-303`)

- `.cg-popover` and `.cg-picker` carry no padding; every part pads itself: the choices 8 px (plus the ghost
  button's own), the controls and the empty line 8 px, the rows and headings 12 px (`--r-space-3`). The tab
  strip is the shared `.cg-tab-strip`, 0 inline — the flush `Inputs 0`. The same strip is worn by the
  Layers bar and the channel strip, so the fix is scoped to the picker. Three call sites share the panel:
  Look inputs, Source defaults, the on-air swap.
- `Default (${sourceName(id)})` and `Use template assignment (${name})` are each ONE string; the closed
  field and the choice button render it bare. `sourceName` reads the name only — a departed default is
  never marked. The existing mark is `Unavailable` (`SourceLabel`), not `Missing`.
- `<bdi>` alone does not fix the owner's name: `dir=auto` takes the FIRST strong letter, `N`, and lays
  `NDI کانالِ ۱ (APASAI)` out left to right — exactly what he saw. The Playout shows its names right to
  left.

### §0.4 First-run (`R-080`, `R-081`, `B-304`)

- **Two screens.** CG Control's own question (`PlayoutAddressGate`, before any socket) and the bridge's
  first-run (`FirstRunScreen`, phase `target`/`channel`). The CG Bridge field (gate) has no placeholder and
  no hint; nothing ever says where CG Bridge was found (Station setup shows `CG Bridge  host:port`).
- **Today's check, in its order** (`CONNECTION_CHECK_IDS`, the bridge returns them so): `proxy` (nothing
  needed) · `route` (an IPv4 address) · `amcp` (a station-admin's sign-in on a Playout ≥ 2.8.54 — it WAITS
  until then) · `api` (nothing) · `cors` (the API line) · `ports` (nothing) · `topology` (nothing). So the
  line that waits for the sign-in sits third, between two that need nothing.
- **Not checked today:** CG Bridge itself (the console's link), versions, this console's sign-in, CG
  Bridge's own Playout session, OSC, the CG license, the channels.
- **The Playout's build** is published nowhere CG can read: not in D1–D11, not in the `2.9.2` license
  answer, and the API's replies say `Server: Kestrel`.
- **Re-run.** Station setup → Servers → Playout already has `Check` (any signed-in principal), rendering
  the same list.
- **`first-run.spec.ts:129` (`B-304`).** The Sign in section shows its blocker — the first of `api`/`cors`
  not passed — INCLUDING while the check is still `checking`, so the API line is drawn twice; an unscoped
  `[data-check="api"]` meets two elements and a strict-mode violation is thrown at once, never retried.
  Locally the first look lands while both are `checking` (3/3 red); in CI it usually lands after the reply,
  when the copy is gone (one flake). Reproduced 2026-10-03 on `acfce121`.

### §0.5 The sign-in screens (`R-082`)

`SignInOverlay` (own scrim and card, a sub-line of prose), `BridgeSignInDialog` (a `Modal`; Enter only from
the password), `FirstRunScreen` (own card), `PlayoutAddressGate` (own page). No logo, no version, no
show/hide anywhere (there is no password primitive). `@cg/splash-kit` (`tools/splash-kit`) exports the
splash's TIMING and build stamp only; the splash's look — the APASAI mark, the ground, the type — lives in
`apps/runtime/index.html` and the `--r-splash-*` tokens. `APP_VERSION` is `__CG_BUILD__.version`.

### §0.6 The audit (`R-083`)

- **Where.** The audit is NDJSON at `--audit-log-path`, default `<state-home>/.cg-runtime/bridge-audit.ndjson`
  — on the service `%ProgramData%\CG Bridge\.cg-runtime\bridge-audit.ndjson`, NOT under `logs\`. The AMCP
  log is plain text at `%ProgramData%\CG Bridge\logs\amcp.log`, rotated at 5 MB to `amcp.previous.log`
  (one kept: at most 10 MB); Shawl's own logs rotate daily, 14 kept.
- **How the dialog loads.** `audit.recent {limit: 200, action?, actor?}` on open, on a filter and on
  Refresh; the bridge `readFile`s the WHOLE file, parses every line, keeps the last 200 matching; channel
  scoping runs AFTER the limit (a scoped console can get fewer than exist). The result filter and the
  search run in the console over those 200. Every row is rendered; nothing is pushed.
- **Rotation.** None (the writer's header: "No rotation… No retention policy"). `Download logs` zips
  `logs\` only — the audit is not in it.

### §0.7 The 9250 collision (`B-305`)

`pgm-return.spec` holds a fake feed on `127.0.0.1:9250` (the rule port) on purpose. `channel-air.spec`
(a CLI bridge — the CLI has no port seam) and `pvw-from-bridge.spec` (in-process, no seam) show the monitors
for channel 1 at `127.0.0.1`, so they dial `127.0.0.1:9250`. CI runs one worker; locally they collide.

## Decisions

1. **The picker listens; the bridge names the actor (`B-300`).** While open the picker subscribes to
   `templates.changed` and re-reads its channel. A new publish channel, `templates.acted` —
   `{act: 'import'|'reimport'|'remove', templateId, name, channel, actor}` — tells every console who did
   what; STATION_WIDE like `templates.changed`. A console knows its own acts (it asked for them), so "on
   another console" is decided where the line is shown. The line is shown when the removed template is the
   picker's chosen one or a Load of it is on the way; a Load refused `unknown-template` within 10 s of such
   a removal reads the same line instead of the raw refusal.
2. **A refused Load creates nothing (`B-301`).** The fixed and dynamic Loads run their checks BEFORE
   `applyIntent`, the way `R-006`'s gates already do; the refusal and its audit row are unchanged. The
   badge reads `error` items WITH A SLOT on the view's channel — current row errors. A row error is
   dismissed through a new `stack.dismiss-error` (the reconciler drops the error ack; the row reads its
   settled status), judged like `stack.remove`. At start CG Bridge drops restored items that have no layer
   and are in `error` — what a refused Load left — writing one log line each: the owner's stored `2 in error`
   reads 0 after the update, and nothing on air is touched (those items never had a layer).
3. **A name's own direction (`B-303`).** One rule, in the naming helpers every surface already calls
   (`OperatorNames`, `IsolatedName`): a name containing any right-to-left letter is laid out right to left;
   any other name left to right; always in its own inline isolate inside an LTR line (ADDENDUM B: the BOX
   stays LTR, the isolate inline). `dir=auto` cannot be the rule: it reads the first strong letter, and the
   owner's name starts with `NDI`.
4. **The check's order is one constant (`R-081`).** `CONNECTION_CHECK_GROUPS` in `@cg/shared-ipc` orders
   the groups and the lines; the bridge produces its lines and the console adds what only it knows (CG
   Bridge's address as it dialled it, the version pair, its own sign-in). Before any sign-in every line of
   the last group WAITS — neutral, never a failure — and says what it waits for. The OSC line follows golden
   rule 8: silence is "no confirmation", a `warn`, never a failure of AMCP.
5. **A password primitive (`R-082`).** `ui/PasswordInput.tsx` — `TextInput` with a show/hide `Icon` button
   (`Eye`/`EyeOff`), its accessible name `Show password`/`Hide password`. One `SignInCard` (`ui/`) gives the
   three screens the mark, the product name, the version and the card. The Persian message keeps its
   isolate and reads right to left by decision 3.
6. **Paging keeps one filter predicate (`R-083`).** `auditMatches(entry, filter)` lives in `@cg/audit` and
   is asked by the bridge's reader and by the console for pushed rows. The reader walks files newest first,
   reading each BACKWARDS in 64 KB chunks and stopping at the page — the first page reads the file's tail.
   A cursor names a file by the timestamp of its FIRST row (rotated files are named by it), so a rotation
   between two pages never loses a cursor. Rotation at local midnight and at 20 MB; retention 90 days and
   200 MB in all, oldest first — an incident is often looked at weeks later, and 200 MB is about 600,000
   rows. `audit.recent` stays for its callers.
7. **`B-305`: an address, not a port.** `pgm-return.spec`'s subject IS the rule port, so it keeps 9250 and
   moves its station and its fake feed to `127.0.0.3` (a loopback address of its own, as `dev-station.spec`
   uses `127.0.0.2`). No CLI flag is added for a test.
