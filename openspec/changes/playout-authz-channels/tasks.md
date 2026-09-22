# Tasks — `C-038` per-channel authorisation

## 1. The shared predicate (`@cg/shared-ipc`)

- [x] `PermissionClass` + `PERMISSION_CLASSES`, with the note that `read` names a PRINCIPAL rung
      and not a promise about the verb
- [x] `holdsPermissionClass` — the hierarchy applied explicitly, so a bare `['station-admin']` is
      not refused the operator rungs
- [x] `grantsChannel(channels, hosts, channel)` — the ONE channel predicate, matching against the
      configured host SET
- [x] `grantedChannels(…)` — the same predicate over a set, for the strip
- [x] `AUTHZ_ROLE_REFUSAL` and `authzChannelRefusal(channel)` — two sentences, different remedies
- [x] `permittedChannels` on `AuthStateSchema`

## 2. The bridge

- [x] `Route.perm` — the REQUIRED 4th field; `route(…)` takes it positionally
- [x] All 65 routes classified: 26 `read` / 33 `operator` / 6 `station-admin`
- [x] `channelsForRequest` — the ONE resolver; explicit channel, `itemId` through both ledgers,
      `itemIds`, and the bulk verbs' union
- [x] `CasparRuntime.channelsForItem` — unions `#slots` and `#liveLayers`
- [x] `CasparRuntime.declaredChannels` — the public face of `#declaredChannels`
- [x] `authzRefusal` — auth-off first, then role, then channel
- [x] Gate wired into `handleMessage`, after the auth gate and before the handler
- [x] `auth.state` and the `auth` reply both carry `permittedChannels`, from one call
- [x] 🔴 `silenceAllLivePlates` named FIRST in the resolver so no later branch can scope it

## 3. The console

- [x] `channelIds` gains the principal (`R-066` bullet 3 names this function)
- [x] `operableChannels` + `permittedSet` — one helper, four auth states
- [x] `useSelectedChannel` returns `operable` and `canOperateSelected`
- [x] `ChannelStrip` marks a non-operable channel `· READ ONLY`, still selectable
- [x] `useCanOperate` (role + channel) and `useHoldsOperatorRole` (role only, for the unscoped
      verbs) — both asking the SAME `holdsPermissionClass` the bridge asks
- [x] `ReadOnlyIndicator` — the fact, once, as a `Tag`
- [x] Bulk verbs (LayersPanel), row verbs (`layerRowActions`), PANIC + RELEASE
      (LiveSourcesPanel), FAILOVER + Lock (StatusBar) — all ABSENT, not disabled

## 4. Tests

- [x] `authz-classes.integration.test.ts` — the census: every route classified, the six
      `station-admin` and the whole `read` set pinned BY NAME
- [x] `authz-gate.integration.test.ts` — the gate at the wire: role, channel, the host rule, the
      refusal order, and the unbound item NOT refused
- [x] `viewerReadOnly.dom.test.ts` — the strip, the absence, the one fact
- [x] `FAKE_ADMIN` and `FAKE_OTHER_STATION_USER` fixtures (the latter is what proves the host
      half does anything)
- [x] **Red-before proved by ABLATION, both sides.** Bridge: neutralising `authzRefusal` reddens
      5 of 10 and leaves the 5 positive controls green. Console: neutralising the three gates
      reddens 6 of 9 and leaves the 3 positive controls green.
- [x] `auth-principal`'s ALS-seam spec: the second principal is now the `admin` fixture, because
      a viewer is correctly refused the verb it drives — the old fixture would have measured the
      refusal instead of the seam

## 5. Records

- [x] `design.md` — the classes, the host rule with (a) and (b), the per-verb unbound table, the
      exemption table, the guard paths
- [x] `proposal.md` + the two spec deltas
- [x] `docs/prd/runtime.md` — `R-066` bullets 3 and 4 `[x]`; `docs/prd/caspar.md` — `C-038` `[~]`,
      with a status note correcting two of its own notes the census overtook
- [x] ADR 0010 — `192.168.21.114` relabelled a **stock test CasparCG** in its two build-identity
      lines, plus a terminology note pinning the three addresses. The integration README gains
      the host-rule interpretation as an open item for the next addendum
- [x] Operator guide — _"When the console is read-only"_, including why the verbs are missing
      rather than greyed, and that the ACCESS is the thing to change

## 6. Gate and discharge

- [x] `pnpm gate` green — 93/93 tasks, `0 cached`, 84/84 OpenSpec items
- [x] Commits + push to `dev` (`dfe94088` · `c9a94a7f` · `65ef6b5c`), remote head verified
- [x] 🔴 **Linux `e2e` discharged for `65ef6b5c`** —
      https://github.com/yasermostafaee/cg/actions/runs/35765969467 · `conclusion: success`,
      and the `E2E (Playwright)` job **RAN** (checked, not assumed — a skipped job proves
      nothing, `P-029`)
- [ ] 🔴 **A second discharge is owed for the e2e commit itself**, which carries
      `playout-authz.spec.ts` and the signed-out strip fix

## 7. 🔴 Owner answer owed

- [ ] **`auth.sign-out` while the console is locked.** REPLY 1 asks for it to be reachable; it is
      not, and that is deliberate — `B-229`'s recorded no-carve-out answer, pinned by an
      assertion in `lock-refuses-intents.integration.test.ts:281`. Not changed. See `design.md`
      §7.
- [ ] **`§1.0a` / `§1.0b`** — the prompt text naming these did not survive compaction, so the
      `design.md` sections written for them (§8 guard paths, §5 exemption table) are my best
      reading rather than a transcription. Worth a glance.
