# Runtime — backlog

Features for the playout controller (`apps/runtime`). The CasparCG control path
itself lives in `caspar.md`. See `README.md` for the format.

## [ ] R-001 — Import a `.vcg` template (upload)   ⟨priority: medium⟩
**What:** Let the operator upload a `.vcg` file to register it as an available
template in the Runtime.
**Why:** The sidebar still says "drop a `.vcg` into the watched folder" — an
Electron-era flow. Browsers have no watched folder, so there's no way to add a
template today.
**Acceptance:**
- WHEN the operator uploads a `.vcg` THEN it is verified (`@cg/vcg-format.verify`)
  and added to the template registry
- WHEN a registered template is selected THEN it can be loaded onto the stack
  with its field schema in the Inspector
- WHEN a `.vcg` fails verification THEN the operator sees a clear error and
  nothing is registered
**Notes:** `@cg/vcg-format` is isomorphic; extend the template registry in
`apps/runtime/src/platform/MockRuntime.ts` (and the real registry later). Replace
the sidebar placeholder copy in `App.tsx`.

## [ ] R-002 — Settings panel UI   ⟨priority: low⟩
**What:** A settings view exposing the operator toggles (telemetry mode to start).
**Why:** The `settings` bridge (get/set/onChanged) is wired but has no UI.
**Acceptance:**
- WHEN the operator opens Settings and changes telemetry mode THEN it persists
  (localStorage) and survives reload
**Notes:** `bridge.settings.*` already implemented in the mock; pairs with P-002
(routing) if Settings becomes its own route.
