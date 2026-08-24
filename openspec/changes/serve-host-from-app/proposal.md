# Set the template serve address in the app, not on the command line

## Why

`B-162` gave the bridge `--template-serve-host` / `--template-serve-port`, and that closed the
**derivation** half of `C-024`: the operator can now SAY which of this machine's interfaces the
plant reaches, instead of the bridge guessing with `guessLanHost()` and failing silently when the
guess is wrong.

What it did not close is the **persistence** half. The flags have no stored layer, so the address
must be re-typed at every start — `caspar-bridge.mjs:179` says so in its own comment ("There is no
persisted-file layer for this one yet; see C-024"). An address that must be re-typed is an address
that will one day not be typed, and the failure that produces is the one `B-162` exists to prevent:
`CG ADD` returns 200, health stays green, the journal records success, and the server shows live
sources with no graphic over them.

Every other bridge store already has the three-layer shape (`R-010`): **explicit flags > persisted
file > built-in default.** The serve host is the one setting that stops at layer one. This change
gives it the middle layer and an operator surface, in the panel where the server hosts it is a fact
about already live.

🔴 **The bridge's lifetime stays outside the console.** This change does not start, stop or restart
the bridge, and adds no control that could. `connections.set-config` already re-derives template
serving on a running bridge and already answers `unreachable` — the apply path exists, and this
change uses it rather than building a lifecycle.

## What Changes

- **`ConnectionConfig` gains `templateServeHost` and `templateServePort`**, so the address is
  persisted by the store that already persists the servers it is about, and survives a restart.
- **Precedence is preserved exactly: a command-line flag still WINS over the stored value.** Boot
  scripts and automation depend on it, and a panel that silently overrode a flag would be the
  inverse of the confusion `B-162` just fixed.
- **When a flag is in force, the panel SAYS SO on the field it masks** — it names the flag, shows
  the value actually in effect, strikes the stored one through and labels it _not in force_. The
  control stays editable and is never greyed, because the stored value is what takes over at the
  next boot without the flag.
- **Empty means "derive it", not "an empty address"**, and empty is never folded into absent
  anywhere along the path — both resolve to the derivation, by one normalizer, and both are tested.
- **The detected interface addresses are offered as CANDIDATES** beside the field, labelled as
  candidates rather than as a verdict. Picking the wrong interface is exactly the failure
  `guessLanHost()` has; a list that implied the machine knew which one was right would reproduce it
  with more confidence.
- **On Apply, the servers that cannot fetch the address are NAMED in the dialog** — the bridge's own
  `unreachable` verdict, which `set-config` already returns, surfaced where the operator just made
  the change.

## Impact

- Affected specs: `runtime-caspar-bridge`
- Affected code: `@cg/shared-ipc` (`channels/connections.ts`), `tools/caspar-bridge`
  (`serve-host-config.ts` — new, `caspar-runtime.ts`, `bridge.ts`, `bin/caspar-bridge.mjs`),
  `apps/runtime` (`ServerSettingsPanel.tsx`, `MockRuntime.ts`, `WebSocketRuntime.ts`)
- Affected PRD items: `C-024` (this is its remaining half), `B-162` (the CLI half it extends)
- ⚠ **`tools/caspar-bridge/src/template-http-server.ts` is NOT touched** — it is in
  `.claude/never-stage` while the owner's plant-testing hack sits in it uncommitted.
  `deriveServeOptions` already takes an override, so the whole change composes above that seam.
