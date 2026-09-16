# CG Control ↔ Apasai Playout — the integration record

The documents the two teams exchanged, adopted verbatim; [ADR 0010](../../adrs/0010-playout-link.md)
is the decision resting on them. 🔴 **Change this folder only by a versioned addendum, never by
editing v1 in place** — each file was consumed verbatim by the other team's assistant.

| File                                  | What it is                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PLAYOUT-INTEGRATION-CONTRACT-v1.md`  | The contract, v1 (2026-09-15). Topology, the JWT claims, D1–D8, roles, the acceptance checklist.                              |
| `cg-control-playout-api.openapi.yaml` | OpenAPI 3.1 of D1–D5 / D8 — the machine-readable half of the same contract.                                                   |
| `PLAYOUT-CG-RESPONSE-v1.md`           | Their first response (build 2.8.44): C1–C7, O1–O3, the Q1–Q7 answers, their 17/17 run.                                        |
| `CG-CONTROL-REPLY-A-2026-09-16.md`    | Our Reply A = **Addendum A**: C1–C7 adopted, O1 viewer sign-in ON, O2 → D9 proposed, O3 the `iss` rule, our deployment facts. |
| `PLAYOUT-CG-RESPONSE-B-v1.md`         | Their Response B (build 2.8.45): O1 ON plus **C8**, **D9 implemented verbatim**, the firewall script prepared, 22/22.         |
| `CG-CONTROL-REPLY-B-2026-09-16.md`    | Our Reply B: C8 folded into Addendum A, D9 accepted as **v1.1 live**, the open-items table.                                   |
| `handoff/2026-09-16/`                 | Dated evidence snapshots from the test Playout — `jwks.json` and `channels.json`.                                             |

**Contract status.** v1 accepted by both sides · **Addendum A** carries C1–**C8** · **v1.1 / D9
(`GET /api/cg/revoked`) implemented and LIVE**, not a proposal · one prerequisite outstanding on
their side: an administrator must run `secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` to open
TCP 5250 from the bridge host.

**The test Playout.** Base URL `http://192.168.21.111:8080` — which is also `iss`, byte-for-byte,
and never derived. `aud` contains `cg-control`. Signing is ES256 and **the JWKS is read LIVE**;
the snapshot here is dated evidence and nothing else. Engine build **2.8.45** is pinned for our
re-validation so the result is attributable. Five temporary test users exist, named here and
nowhere near their password — `cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, `cg-noch` — as is
channel `cg-test2`; we say when the fixtures are released.

🔴 **No credential lives in this folder.** The sample tokens are NOT adopted, and the R5 password
line in `PLAYOUT-CG-RESPONSE-v1.md` is redacted in place and marked as such — the ONE content edit
made on adoption. `handoff/2026-09-16/jwks.json` is PUBLIC key material (three P-256 points, no
`d`) and is **stale**: the Playout team reset its signing keys after testing on 2026-09-16, which
is why the bridge reads the JWKS live.

⚠ **Presentation moved, content did not.** `format:check` globs the whole tree, so every file here
was run through `prettier --write`: markdown emphasis respelled `*x*` → `_x_`, table cells padded,
the contract's embedded JSON block reflowed, and the YAML re-quoted with bracket spacing. Verified
after the fact — the two JSON snapshots are deep-equal to the originals, and the four other
markdown files are identical once emphasis and table padding are normalised. No value changed
anywhere. If byte-fidelity is wanted instead, the route is a `.prettierignore` entry, the same one
`tools/*/evidence/**` and `docs/recon/ciab-client-tools.json` already use for the same reason.
