# Session BN — the confidence-grab measurement kit, and a runbook that measures three things in one visit

> **Safe to pull.** Everything below is on `dev`; see §0 for the pushed SHA.
>
> **Letter:** `BN`, as the prompt reserved. `BO` and `BP` ran ahead of it — the assignment collapse
> went first by the prompt's own priority note, and it landed as session BP's freeze.

## 0. State

| Fact              | Value                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| Tip read at start | `9604a3b1` — `HEAD == origin/dev`, tree clean                                        |
| **Pushed**        | see §7 — verified by `git ls-remote origin dev`, never by an exit code               |
| Ships             | a TOOL and a FORM. **No product behaviour, nothing in `apps/`, no openspec change.** |

## 1. What this session built

**(a) The kit** — `tools/caspar-amcp-probe/bin/confidence-probe.mjs` (source
`src/confidence-probe.ts`). It drives a real CasparCG over AMCP, prints a human summary and writes
machine-readable JSON. It lives in the existing AMCP probe workspace rather than a new one: that
package is already the repo's probe harness (five entry points before this), so a new workspace
would have added a lockfile change and a second home for the same thing.

**(b) The runbook** — `docs/recon/2026-08-22-confidence-grab-measurement.md`. **A FORM, not a
report**: every table is empty and stays empty until the box fills it. Three sections, one visit:
§A the C-016/C-023 grab measurement, §B the 2× discriminator, §C the AMCP probes the repo already
owes.

**(c) The 2× checklist, committed** — `docs/recon/2x-live-source-plant-check.md`, so §B can
cross-reference it instead of re-deriving its reasoning. It existed only as a message before this.

## 2. 🔴 The property that matters most: it refuses to guess

The grab verb is **not hard-coded**. The kit asks (`VERSION`, then `HELP`), filters **the server's
own enumeration** for grab-shaped tokens, and tries only tokens the server printed — in their
narrowest form, because anything more would be this code inventing an argument grammar. When the
enumeration names nothing, it emits a FINDING and stops.

**That behaviour is pinned by tests, not by the comment claiming it.** Against `@cg/amcp-mock` — a
server that knows `VERSION` and `INFO` and has never heard of a grab command — the suite asserts
that zero candidates were named, that **zero commands were attempted**, and that the finding says so
in words a plant reader can act on.

⚠ **You will find `ChannelSnapshot` in this repo and it is NOT evidence.**
`docs/recon/ciab-client-tools.json` lists an `Add / ChannelSnapshot` tool, but that file is the CIAB
**client's** tool list and its own README says the `Add` folder is that product's own tooling and
that a client tool must never be read as a server capability. Recorded in the runbook so the next
reader is declining it deliberately rather than discovering it and treating it as the answer.

## 3. The stop rule, written as code rather than as a sentence

BN §8: _"If measuring 3.4 would require putting something on the program channel → stop and ask."_
Both §3.4 paths `PLAY` a producer. So the kit **refuses**: no `--probe-channel` ⇒ skipped with the
reason recorded; a `--probe-channel` equal to the channel being measured ⇒ skipped, and **nothing is
sent**. Mutation-checked — disabling that one branch reddens exactly the test that asserts it.

Also: it never `PLAY`s on the channel it is measuring, and every clear it sends names a layer, never
a bare channel-wide `CLEAR`.

## 4. Two findings already, both read from the code rather than measured

1. 🔴 **The bridge's HTTP server has NO filesystem root.** `template-http-server.ts` serves exactly
   one route — `/template/<id>` — from an in-memory map, and 404s everything else. So C-016's
   _"served over the bridge's HTTP server"_ needs a route that **does not exist yet**, wherever a
   grab lands on disk. Design work for the C-016 session, not a defect. (That file is
   `never-stage`; it was read, not modified.)
2. **`Mixers / Defer` and `Mixers / Commit` DO appear in the CIAB list**, and the same README says
   the `Mixers` folder is the one part of that file close enough to AMCP to be evidence about the
   server. So §C1's mechanism probably exists — but **no client tool list can ever say whose queue a
   `COMMIT` applies to**, which is the entire question and the only reason the project forbids it.
   Recorded so the tool list cannot stand in for the probe.

## 5. §B — reproduced, not re-derived, and nothing was synthesised

The six values are reproduced with **every cell empty**. The hypothesis (a 25 fps file mapped 1:1
onto a 50 fps channel = exactly 2×) is written as **UNVERIFIED**, with step 4 named as the only
thing that settles it, and both branches of that answer spelled out so either is recordable.

⭐ **What this session DID add is a verification pass over the checklist's own code claims** — it
cited eight facts from the tree, and each was checked against `9604a3b1`. **None was wrong**; one
path was abbreviated (`video-convert-args.ts` is under
`apps/designer/src/renderer/features/assets/`). One thing the pass added: the importer already has
`fpsConformNotice`, so an importer-produced file is at **the project's** rate deliberately and with
a warning shown — which sharpens step 3 from _"did it come from the importer"_ to **_"what was that
project's `frameRate`"_**.

⚠ The checklist's stale "(BO)" reference is gone — the reproduced copy says "the planned session"
without a letter, since `BO` was later used for a different session that has already shipped.

## 6. §C — and one instruction in the prompt that is now stale

§C measures the AMCP probes the repo has marked unmeasured **in its own code comments**, each quoted
verbatim with its file and line: C1 `DEFER`/`COMMIT` scope, C2 `PLAY`-on-occupied, C3 the `CLIP`
intersection probe (6.3a(a)) and its precision question (6.3a(b)), C4 `B-155`'s frame count.

🔴 **The prompt told §C to gate C2 and C4 on "has the 7.16 collapse landed?" — it has, and not as a
collapse.** Session BP resolved 7.16 differently: a row now **FREEZES its template assignment at
TAKE** (`510ea468`). So the cause is removed, **all four probes are worth running**, and §C measures
the RESIDUAL, which is what it was always for. The runbook states this as a resolved checkbox with
the commit, and says plainly that a copy still reading "wait for the collapse" is out of date.

🔴 **What is NOT removed: the plant measurement.** `B-155` is still OPEN and `tasks.md` 7.15 is
still unticked. C4 is that measurement, and §C's opening says a green suite cannot substitute for
it — the mock is the very thing that models `PLAY`-on-occupied as a replace.

## 7. Verification

- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; openspec 58/58).
- `@cg/caspar-amcp-probe` — 2 files / 22 tests, including the 5 new ones. Typecheck, lint and build
  clean; `--help` and the summary path exercised by hand.
- **Mutation-checked:** disabling the air-channel guard reddens the test that asserts §3.4 refuses.
- **NUL sweep** (golden rule 9's new addendum): the kit's own source had **five raw NUL bytes** —
  the OSC padding characters, which the tooling turns into bytes when you type the escape. Caught by
  scanning the file after writing it, exactly as the rule now says to. Fixed to escapes; every
  text-ish tracked file is NUL-free.
- ❌ **No Linux `gate:e2e` is owed** — nothing in `apps/`, no UI, no render path. The diff is a
  probe workspace and documentation.

## 8. What does NOT exist, by decision

- ❌ No `design.md`, no panel, no UI, no `@cg/shared-ipc` channel, no product behaviour.
- ❌ **No openspec change.** Recon precedes the change; the 2026-07-28 recon document is the
  precedent, and the prompt was explicit that concluding otherwise means stopping rather than
  opening one. Nothing about this session's diff required it — it adds a tool and documentation.
- C-016 stays `[ ]`. C-023 untouched.

## 9. Out of scope — named untouched

The PGM panel and its polling · C-023's UI · AW's banner · BC's two deferred findings · `B-151` /
`B-152` / `B-153` · `tasks.md` 7.10 · P2.DEL · Session E · **any FIX for the 2×** (this session
captures the discriminator only, never a repair) · `template-http-server.ts` (read-only,
`never-stage`).
