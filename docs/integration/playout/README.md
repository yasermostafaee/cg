# CG Control ↔ Apasai Playout — the integration record

The documents the two teams exchanged, adopted verbatim; [ADR 0010](../../adrs/0010-playout-link.md)
is the decision resting on them. 🔴 **Change this folder only by a versioned addendum, never by
editing v1 in place** — each file was consumed verbatim by the other team's assistant.

| File                                  | What it is                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAYOUT-INTEGRATION-CONTRACT-v1.md`  | The contract, v1 (2026-09-15). Topology, the JWT claims, D1–D8, roles, the acceptance checklist.                                                                                                                                                                                                                                                                                                            |
| `cg-control-playout-api.openapi.yaml` | OpenAPI 3.1 of D1–D5 / D8 — the machine-readable half of the same contract.                                                                                                                                                                                                                                                                                                                                 |
| `PLAYOUT-CG-RESPONSE-v1.md`           | Their first response (build 2.8.44): C1–C7, O1–O3, the Q1–Q7 answers, their 17/17 run.                                                                                                                                                                                                                                                                                                                      |
| `CG-CONTROL-REPLY-A-2026-09-16.md`    | Our Reply A = **Addendum A**: C1–C7 adopted, O1 viewer sign-in ON, O2 → D9 proposed, O3 the `iss` rule, our deployment facts.                                                                                                                                                                                                                                                                               |
| `PLAYOUT-CG-RESPONSE-B-v1.md`         | Their Response B (build 2.8.45): O1 ON plus **C8**, **D9 implemented verbatim**, the firewall script prepared, 22/22.                                                                                                                                                                                                                                                                                       |
| `CG-CONTROL-REPLY-B-2026-09-16.md`    | Our Reply B: C8 folded into Addendum A, D9 accepted as **v1.1 live**, the open-items table.                                                                                                                                                                                                                                                                                                                 |
| `PLAYOUT-CG-RESPONSE-C-v1.md`         | Their Response C (2026-09-16, 2.8.45 pinned): the firewall table, the refreshed handoff, and the CG routes re-run over the network address. ⚠ Its firewall table was NOT in force — see Response D.                                                                                                                                                                                                         |
| `CG-CONTROL-REPLY-C-2026-09-16.md`    | Our Reply C (2026-09-16): item 1 awaited in writing with both rules listed, our three inbound rules, and what the bridge sends on connect. First raised that a **Block outranks an Allow**.                                                                                                                                                                                                                 |
| `CG-CONTROL-REPLY-D-2026-09-21.md`    | Our Reply D (2026-09-21): 8080 / 8443 / 9250 measured reachable from `192.168.21.93`, the `pktmon` capture, and the observation that a **`RST` on 9999** contradicts their table.                                                                                                                                                                                                                           |
| `PLAYOUT-CG-RESPONSE-D-v1.md`         | Their Response D (2026-09-21, engine 2.8.47): both our points conceded and verified against Microsoft's docs — the allow rule was **inert**, and the **Public profile's firewall is off**, so 5250 was open to the whole LAN. The corrected twin-rule model.                                                                                                                                                |
| `CG-CONTROL-REPLY-E-2026-09-21.md`    | Our Reply E (2026-09-21): the twelve any-port program rules blunt their Decision 1; a time-boxed window on the pinned 2.8.45 offered as a third path; and **does 2.8.47 still carry apasai-core `2.5.0 6b29237 Dev`?**                                                                                                                                                                                      |
| `PLAYOUT-CG-RESPONSE-E-v1.md`         | Their Response E (2026-09-21, engine **2.8.48**): **item 1 complete — the written authorisation.** It answers our Reply D §3 and **crossed with our Reply E**, so Reply E's questions are untouched by it. ⚠ SUPERSEDED by the revised E below — read that one.                                                                                                                                             |
| `CG-CONTROL-REPLY-F-2026-09-21.md`    | Our Reply F (2026-09-21): the authorisation accepted; asks whether the twelve program rules were removed or merely not shown; flags `singbox_tun` on THEIR host as a measurement risk for the OSC half.                                                                                                                                                                                                     |
| `PLAYOUT-CG-RESPONSE-E-v1-revised.md` | 🔴 **Their revised Response E (2026-09-21) — THE authorisation the 2026-09-22 run used.** Supersedes the first E: §5 the core is byte-identical (mtime/size/md5 + a live `VERSION` on 2.8.48); §6 **their plant NIC is DOWN** and everything routes via the Kerio tunnel; §7 the time-boxed window is moot and would now lock us out; §9 the real inbound grant is an **NDI-created rule**, not the twelve. |
| `PLAYOUT-CG-RESPONSE-F-v1.md`         | Their Response F (2026-09-21): the twelve were not shown, not removed; the scope bounds were their deliberate choice (Windows REFUSES a rule containing loopback/multicast/broadcast, writing neither rule); and 🔴 **they predict they present source `172.27.36.46`, not `192.168.21.111`** — the warning that made us widen all three inbound rules before the run.                                      |
| `CG-CONTROL-REPLY-G-2026-09-22.md`    | Our Reply G (2026-09-22): their warning went one layer deeper — **all three** of our rules were scoped to `.111`, so the template fetch on 7911 would have failed as a take-404 too; all three widened additively; the HTTP GET sent so they can read our source address from their own log.                                                                                                                |
| `handoff/2026-09-16/`                 | Dated evidence snapshots from the test Playout — `jwks.json` and `channels.json`.                                                                                                                                                                                                                                                                                                                           |

**Contract status.** v1 accepted by both sides · **Addendum A** carries C1–**C8** · **v1.1 / D9
(`GET /api/cg/revoked`) implemented and LIVE**, not a proposal. Nothing in the Response C → E
exchange touched the contract; all of it was firewall, enforcement and build.

## Item 1 is DONE — and how it was actually done (2026-09-21)

🔴 **Superseded, kept because the trail is the lesson.** Until 2026-09-21 this section read that
the AMCP allow rule was not applied and the joint test was blocked on exactly that. Both halves
turned out to be true for a **different reason than either side thought**, and the correction is
worth more than the fix.

**What Response C claimed, and what was actually in force.** Response C §1 listed the rules on
`192.168.21.111` as verified: the block rule enabled, the engine API and PGM ranges allowed,
`Apasai - Allow AMCP from trusted hosts` absent. The table was accurate **and described a machine
on which none of it was being enforced** — all three connected interfaces are categorised
**Public** and the Public profile's firewall was **off** (Response D §2–§3). TCP 5250 was open to
the whole LAN with apasai-core listening on `0.0.0.0:5250`. ⭐ **A rule listing is not
enforcement; ask for the profile/enabled state beside it — theirs or ours.**

**And the rule would not have worked even once applied.** Windows Defender Firewall evaluates an
explicit **Block** ahead of any **Allow** (Response D §1, verified by them against Microsoft's
documentation after our Reply C and Reply D §3 raised it). Only an authenticated-bypass rule
(`-OverrideBlockRules`, requiring IPsec and `RemoteUser`) lets an allow beat a block, and theirs
was an ordinary allow rule. The block rule's remote scope was `Any`, so it covered
`192.168.21.93`. ⭐ **"The rule is applied" is not "the rule is in force", and the difference is
invisible in a rule listing.**

**What Response E establishes — the written authorisation.** An inbound allow on TCP 5250 scoped
to exactly `192.168.21.93`; the old `Apasai - Block external playout-core AMCP` with remote `Any`
**replaced** by `Apasai - Block untrusted playout-core AMCP`, whose scope stops at
`…-192.168.21.92` and resumes at `192.168.21.94-…`; and — the part that was false in Response C —
**all three firewall profiles enabled**, with the profile table printed beside the listing. They
did not out-rank the block: **they removed our address from it**, so no block matches us and the
allow decides. Their `Error` → `Warning` log pair (§3) shows only enforcement changing between the
two states, with no rule touched.

**Build.** The engine moved to **2.8.48**. The 2.8.45 pin was self-blocking — that build recreates
its blanket block on every start and cannot hold an allow rule (Response D §4) — so **2.8.48 is
the build to name in the recon record**. apasai-core, which is what `C-040` actually validates, is
`2.5.0 6b29237 Dev` and is unchanged as far as they have stated.

## Open items, true as of 2026-09-22

1. ✅ **Item 1 — the TCP 5250 allow rule — DONE and EXERCISED.** Authorised in writing by
   `PLAYOUT-CG-RESPONSE-E-v1-revised.md`, and on 2026-09-22 a bridge from `192.168.21.93`
   connected and `VERSION` answered `2.5.0 6b29237 Dev` on the first attempt.
2. ✅ **Item 2 — our side — in place, and WIDENED.** Three inbound rules on `192.168.21.93`, all
   Allow and enabled, each now admitting **both** `192.168.21.111` and `172.27.36.46`:
   `CG bridge OSC in` (UDP 6250), `CG bridge templates in` (TCP 7911), `CG probe fixtures in`
   (TCP 7900–7901). 🔴 Their Response F §4 is why: a rule scoped to `.111` alone would have
   dropped OSC **and** the template fetch, manufacturing a `degraded` reading and a take-404
   shape that both look like faults in apasai-core.
3. ✅ **The measurement has RUN** —
   [`docs/recon/2026-09-22-apasai-core-validation.md`](../../recon/2026-09-22-apasai-core-validation.md).
   The AMCP surface is identical to stock 2.5.0, OSC reaches a non-loopback AMCP client
   (`healthy`), and a template round trip completed with the fetch hop proven. They were told
   before we connected, as agreed. **`C-040` remains `[~]`: the SIGN-IN half has not run.**
4. **Their revised Response E answered the second of Reply E's questions; the first is still
   open.** (a) The twelve `apasai-engine` / `apasai-core` program rules were **not shown, not
   removed** (Response F §1) — and the more important finding is theirs: the running core is not
   covered by those rules at all. An **NDI-created rule** (`Protocol Any`, `LocalPort Any`,
   `RemoteAddress Any`) is the real grant, so scoping the twelve would have changed nothing. Their
   staged plan is in revised Response E §9; only the NDI narrowing closes it, and it waits for a
   service window. (b) ✅ **ANSWERED** — the core is byte-identical across the engine move
   (revised §5), and our own `VERSION` confirms `2.5.0 6b29237 Dev` running on 2.8.48.
5. 🔴 **The SOURCE-ADDRESS question is open, and it is now a question for them.** They report the
   plant NIC down and predict they present `172.27.36.46`; every TCP connection they made to our
   template server on 2026-09-22 arrived from **`192.168.21.111`**. Our rules admit both, so the
   run stands either way — but which address they present decides whether the widening can be
   narrowed again, and whether the dead NIC is still dead.
6. **Owed to them:** an independent reading of what a host that is **not** `192.168.21.93`
   observes on 5250 (Response E §6). They expect a silent drop rather than a reset. ⭐ Partial
   evidence already exists: from `.93`, port **9999** moved from a 3.7 ms `RST` (2026-09-21, their
   firewall off) to a **26 s timeout** (2026-09-22) — enforcement is visible from outside.
7. **`revoked.json` still has not reached this folder.** D9 is live and the endpoint is specified;
   the dated snapshot is not here.
8. **The test fixtures are still ours to release** — `cg-op1`, `cg-op2`, `cg-admin`, `cg-view`,
   `cg-noch` and channel `cg-test2` — after the plant deployment, and we say when.
9. 🔴 **2026-09-22 — OUR SIGN-IN HALF IS BUILT, AND IT HAS NOT MET YOUR BOX.**
   `C-037` and the sign-in half of `R-066` are implemented (`openspec/changes/playout-auth-signin`):
   the `auth` frame, offline ES256 verification against a cached JWKS, the gate at the one
   chokepoint, D9 revocation polling, the `playout.*` configuration group, and a console sign-in.
   ⚠ **Every one of those is exercised against a FAKE Playout on loopback** — a test server that
   generates its own ES256 key in memory at test start and writes nothing to disk — and **not one
   byte has been sent to `192.168.21.111`**. That is why `C-040` stays `[~]`: the AMCP half is
   measured, the SIGN-IN half has not run. The real run is a separate, announced event, and we
   still tell you before we connect.
   ⚠ Two things the build measured that the contract does not state, recorded so the first joint
   run is not spent discovering them: the claim is **`roles` (plural, `string[]`)** and there is no
   singular `role`; and **D9 has no home in `PLAYOUT-INTEGRATION-CONTRACT-v1.md`** — it is
   specified across Reply A and Response B and accepted as v1.1, so a reader of the contract file
   alone will not find it.
   ⚠ ~~And one thing that is NOT done…~~ **`C-038` LANDED 2026-09-22** — see item 11.
10. 🔴 **2026-09-22 — `C-038` IS BUILT, AND ONE READING OF `cg_channels` IS OURS AND NOT YOURS.**
    Per-channel authorisation landed (`openspec/changes/playout-authz-channels`): a permission
    class on every route, and the request's channels checked against the principal's grants.
    ⚠ **Our host rule is WIDER than the contract's wording, and we are telling you rather than
    letting you find it.** §3.2 says `host` is _"the CasparCG server address exactly as the bridge
    connects to it"_, and a station with a redundant pair has TWO such addresses — servers A and B
    are MIRRORS of one channel set, not a partition of it. So we accept a grant whose `host`
    matches **either** configured server, not only the primary. In practice nothing changes: you
    issue A's address today, and a grant naming a host that is not ours still authorises nothing.
    Two consequences worth stating: a redundant station does not need its grants reissued after a
    failover, and a grant naming ANOTHER station's host does not authorise this station's
    channel 1 — the channel number matching is not enough. **This belongs in the next addendum;
    if you would rather we matched only `servers.A.host`, say so and it is a one-line change.**
    ⚠ We also carry `cg-admin` and a new `cg-op-elsewhere` as local fixtures. The latter is not a
    request for a user on your side — it exists only to prove the host half of the rule above
    actually does something, and its address is `192.0.2.10` (RFC 5737 documentation range),
    never dialled.

11. ✅ **CLOSED 2026-09-23 — the false caveat is gone.** It read, directly above rows carrying a
    VERIFIED name, that the actor was merely a label somebody had typed rather than a proven
    sign-in — true for every build before `C-037` and untrue the moment a bridge runs
    `auth: 'playout'`. `OPERATOR-NAME-SWEEP-01` retired the sentence, the field behind it, its
    persisted key and the bridge-contract members it hung from, and left a permanent two-axis
    guard (`operatorNameRetired.test.ts`) that fails if either the symbol or the sentence
    returns to source.
    ⚠ **One thing changed for stations running `auth: 'off'`, and it is not a regression:** the
    console now sends no `actor` at all, so a console's row records `console` and a row nothing
    at a console caused records `unattributed` (`BRIDGE-TRUTH-01` §4, 2026-09-23 — until then both
    read `unattributed`). The label it replaced was a claim nobody checked; the remedy for a
    station that wants attribution in the log is federating identity, which is what this
    integration is for.
12. ⚠ **THE CORS ORIGIN IS THE PORT THE CONSOLE ACTUALLY SERVES ON, and the dev server's
    fallback is not it.** Their CORS list names `http://192.168.21.93:5174` and
    `http://127.0.0.1:5174`. Measured 2026-09-22: with something already holding 5174 the
    Runtime dev server bound **5175** instead, silently, and the console then ran on an origin
    the Playout would not answer a preflight for. Nothing broke in the local test only because
    the fake Playout serves permissive CORS. Before the joint sign-in run, confirm the port the
    console is actually served on and make sure that exact origin is on their list — the
    symptom otherwise is a sign-in that fails with no HTTP answer at all, which this console
    reports as "پلی‌اوت پاسخ نمی‌دهد" and reads as the Playout being down.
13. 🔴 **2026-09-23 — `BRIDGE-TRUTH-01` §2 and §3: what changed on OUR side for the joint run.**
    All of it inside our own band; nothing of yours is addressed.
    - **Our clear now resets the layer's mixer.** After a `CLEAR` of a declared bank row that
      landed on the primary, the bridge sends `MIXER <ch>-<layer> CLEAR` (your Q4 word order;
      the reversed spelling is your measured `400`). Never on a layer outside our declared bank,
      never after a `CLEAR` that did not land, and never on a playout layer. So a layer we
      empty no longer keeps the `VOLUME 0` our load leaves behind.
    - ⚠ **The severity we told you in Reply P §3 was overstated.** Our own take re-asserts
      `MIXER … VOLUME 1` on every take, so our next take on such a layer was always audible;
      the residue silenced only a producer that did NOT come through our take. The correction
      belongs in our next letter.
    - **The band reader** (`@cg/caspar-client` `readBandVolumes`) is how we will take the
      before/after readings: one burst of `MIXER <ch>-<layer> VOLUME` queries and one read,
      matched by order. Measured 2.7 ms for fifty layers against our loopback fake — not against
      a real server; your 182 ms is the real-server figure. Reading a layer inserts an identity
      transform entry (`tweens_[index]`); we treat a read as not side-effect free.
    - **Wording, as agreed:** an `INFO`-based reading establishes **no producer**, never
      **clean**. Our docs and our one probe that said otherwise have been corrected; we never
      address `INFO` by layer and never read a layer volume from `INFO`'s `<volume>` nodes.

**The test Playout.** Base URL `http://192.168.21.111:8080` — which is also `iss`, byte-for-byte,
and never derived. `aud` contains `cg-control`. Signing is ES256 and **the JWKS is read LIVE**;
the snapshot here is dated evidence and nothing else. Engine build **2.8.48** (was 2.8.45; see
above). Five temporary test users exist, named here and nowhere near their password — `cg-op1`,
`cg-op2`, `cg-admin`, `cg-view`, `cg-noch` — as is channel `cg-test2`.

🔴 **No credential lives in this folder.** The sample tokens are NOT adopted, and the R5 password
line in `PLAYOUT-CG-RESPONSE-v1.md` is redacted in place and marked as such — the ONE content edit
made on adoption. The five files adopted on 2026-09-21 and the four adopted on 2026-09-22 were
each scanned before copying — against a positive control on a file that does carry credential
prose — and carry none: no password, secret, API key, bearer token, JWT or private-key material.
⚠ The revised Response E §5 quotes an `md5` prefix of the core BINARY; that is a build identity,
not a secret.
`handoff/2026-09-16/jwks.json` is PUBLIC key material (three P-256 points, no `d`) and is
**stale**: the Playout team reset its signing keys after testing on 2026-09-16, which is why the
bridge reads the JWKS live.

⚠ **Presentation moved, content did not.** `format:check` globs the whole tree, so every file here
was run through `prettier --write`: markdown emphasis respelled `*x*` → `_x_`, table cells padded,
the contract's embedded JSON block reflowed, and the YAML re-quoted with bracket spacing. Verified
after the fact — the two JSON snapshots are deep-equal to the originals, and the four other
markdown files are identical once emphasis and table padding are normalised. No value changed
anywhere. The same applies to the five files adopted on 2026-09-21. If byte-fidelity is wanted
instead, the route is a `.prettierignore` entry, the same one `tools/*/evidence/**` and
`docs/recon/ciab-client-tools.json` already use for the same reason.
