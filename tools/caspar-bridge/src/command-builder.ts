import { quote } from '@cg/caspar-client';
import type { SourceProducer } from '@cg/shared-ipc';
import { withCgControl, type CgControl, type FieldValues } from '@cg/shared-schema';
import type { NormalizedRect } from './live-layers.js';

/** A CasparCG `(channel, layer)` coordinate. */
export interface CommandSlot {
  readonly channel: number;
  readonly layer: number;
}

/**
 * The CG "flash layer" index inside the producer. HTML producers use a single
 * layer; `0` matches what `amcp-mock` and CasparCG expect for one template.
 */
const FLASH_LAYER = 0;

/**
 * AMCP command-construction **seam** (ADR 0006).
 *
 * This is the SINGLE place AMCP command lines are built for an HTML-producer
 * slot. Keeping construction here means the verified sequence is isolated from
 * `ServerSession` / `CommandQueue` / `Reconciler`.
 *
 * ✅ **`CG UPDATE` hardware-validated on CasparCG 2.3.2 (`4de6d18f` Dev) — ADR 0006.**
 * The C-001 Phase-3b harness (`tools/caspar-amcp-probe`) proved `CG UPDATE` delivers
 * a Persian-laden JSON payload to `window.update` intact. The verb sequence is:
 *
 *   load   → `CG <ch>-<layer> ADD 0 "<template>" 0 "<data>"`  (play-on-load OFF)
 *   take   → `CG <ch>-<layer> PLAY 0`
 *   update → `CG <ch>-<layer> UPDATE 0 "<data>"`
 *   out    → `CLEAR <ch>-<layer>`
 *
 * B-039 — the play-on-load flag is **`0`** (load does NOT auto-play): load only
 * ADDs the producer (loaded, not playing); the operator's take issues the `CG PLAY`.
 * The bridge (`CasparRuntime`) chooses the verb sequence prescriptively — a take
 * after an out re-issues this `load()` (re-ADD) before `take()` since the prior
 * `CLEAR` destroyed the producer. (The load/take/out/retake cycle with the flag OFF
 * is re-validated on real CasparCG before B-039 closes.)
 *
 * The disproven alternatives are NOT pending work: `CALL ... "update"` returned
 * `202` but never invoked `window.update`; `CG INVOKE ... "update" "<json>"`
 * delivered an EMPTY param; the inline `CG INVOKE ... "update(<json>)"` form
 * delivered `"[object Object]"`. `CG UPDATE` is the answer.
 *
 * All user values are escaped via `quote()` from `@cg/caspar-client` (the one
 * canonical AMCP quoter), applied EXACTLY ONCE per argument. The data argument is
 * already a `JSON.stringify` string; `quote()` applies the hardware-confirmed
 * two-layer escape (B-041 take 2: the JS-literal layer, then the AMCP layer — net
 * each JSON `\` → four wire backslashes, each `"` → `\"`, never a raw control
 * byte), so the payload survives BOTH of CasparCG's un-escapes (AMCP tokenizer,
 * then the html_cg_proxy `update("…")` V8 embed) byte-exact at the template's
 * `JSON.parse`. See `packages/caspar-client/src/amcp/escape.ts` for the rule and
 * its provenance. A raw value never reaches the wire unquoted.
 */
/** The longest `command` an audit entry carries (`AuditEntrySchema.command` caps at 256). */
export const WIRE_LINE_SUMMARY_MAX = 200;

/**
 * `B-209` — an AMCP line as the audit record keeps it: the verb, the target and the
 * first quoted argument intact, every LATER quoted argument elided, the whole thing
 * capped.
 *
 * The first quoted argument is kept because for `CG ADD` it is the template URL —
 * the host and the PORT CasparCG was told to fetch from, which is exactly what a
 * reader of a refused take needs (an ephemeral port changes on every bridge
 * restart, `C-032`). The data payload after it is the operator's field values, which
 * the stack snapshot already holds; eliding it keeps a Persian ticker's worth of text
 * out of a column whose job is to name a command. `CG UPDATE`'s single argument IS
 * the payload and is kept up to the cap, because there the payload is the command.
 *
 * ⚠ Pure and total: any line, any length, never throws. A summariser that could throw
 * would turn a refused command into a lost audit row, which is the outcome this
 * exists to prevent.
 */
export function summarizeWireLine(line: string, max = WIRE_LINE_SUMMARY_MAX): string {
  const open = line.indexOf('"');
  let summary = line;
  if (open !== -1) {
    const close = closingQuote(line, open);
    if (close !== -1) {
      const head = line.slice(0, close + 1);
      // Every further quoted argument (escaped quotes included) becomes an ellipsis.
      const rest = line.slice(close + 1).replace(/"(?:[^"\\]|\\.)*"/g, '"…"');
      summary = head + rest;
    }
  }
  return summary.length > max ? `${summary.slice(0, max - 1)}…` : summary;
}

/** The index of the quote that closes the one at `open`, honouring `\"`, or -1. */
function closingQuote(line: string, open: number): number {
  for (let i = open + 1; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '"') return i;
  }
  return -1;
}

export class CommandBuilder {
  /** Load a template onto a slot — `CG ADD` with play-on-load OFF (loaded, NOT playing). */
  load(slot: CommandSlot, template: string, fields: FieldValues): string {
    return `CG ${target(slot)} ADD ${String(FLASH_LAYER)} ${quote(template)} 0 ${quote(serialize(fields))}`;
  }

  /** Play (take to air) the loaded template on a slot. */
  take(slot: CommandSlot): string {
    return `CG ${target(slot)} PLAY ${String(FLASH_LAYER)}`;
  }

  /** Push updated field values to the playing template on a slot. */
  update(slot: CommandSlot, fields: FieldValues): string {
    return `CG ${target(slot)} UPDATE ${String(FLASH_LAYER)} ${quote(serialize(fields))}`;
  }

  /**
   * `multibox-layout-switch` `tasks.md` 6.7 — **tell the PAGE which LOOK is active.**
   *
   * The same `CG UPDATE` verb and the same escape chain as {@link update}; the look id rides
   * the payload under the reserved key (`withCgControl`), which the page lifts off before the
   * field machinery sees it. Deliberately NOT a new verb: `CG UPDATE` is the one form proven
   * on 2.3.2 to deliver a JSON payload to `window.update` intact, and inventing a second
   * transport would mean re-earning that proof (the `CALL` / `CG INVOKE` alternatives were
   * measured and disproven — see this class's header).
   *
   * `fields` is normally EMPTY: a look switch changes no author value. It is a parameter
   * rather than hard-coded because the payload merges page-side, and a caller that has fields
   * to send anyway must be able to send both in ONE command rather than two — a second command
   * is a second chance for the two to land apart.
   *
   * ⭐ `C-028` — `plates` rides the SAME payload for exactly that reason. A switch can change
   * a plate's fit (two looks may bind one input to different boxes and assert different shapes
   * for it), so the id and the facts must land together or the page punches the new look's
   * holes at the old look's aspects. Absent — a non-`C-028` caller, or a template with no
   * plates — leaves the payload byte-for-byte what it was.
   */
  updateLook(slot: CommandSlot, lookId: string, fields: FieldValues = {}): string {
    /*
      🔴 **`single-clock-look-switch` — the `plates` and `from` arguments are GONE.**

      `plates` (`C-028`) sent each plate's resolved aspect and mode so the PAGE could compute
      the same fit; `from` (`SKEW-INTERSECT-01`) named the look being left so the page could
      narrow its holes to `outgoing ∩ entering`. Both existed to steer a MASK, and a
      plate-bearing page now sits BELOW its plates and punches nothing. The fit that reaches
      air is the bridge's own `MIXER FILL` / `CLIP`, from the same facts, on the side that
      owns the picture.

      ⚠ What SURVIVES is the look id, and the reason it survives is unchanged: the page still
      flips its own per-look decoration, and it still has to be told which look that is.
    */
    const control: CgControl = { look: lookId };
    return `CG ${target(slot)} UPDATE ${String(FLASH_LAYER)} ${quote(
      serialize(withCgControl(fields, control)),
    )}`;
  }

  /**
   * C-012 — GRACEFUL stop: tell the template to run its own outro and leave the
   * producer RESIDENT on the layer.
   *
   * The fifth verb, and the one that makes `out()` a genuine choice rather than
   * the only way off air. Hardware-verified on CasparCG 2.3.2 (`4de6d18f`, PR
   * #353's probe):
   *
   *   CG <ch>-<layer> STOP 0  -> 202 CG OK; OSC still reports `html`;
   *                              the template's `window.stop` FIRED
   *   CG <ch>-<layer> PLAY 0  -> 202 CG OK, resumed — with NO re-ADD
   *   CLEAR <ch>-<layer>      -> OSC goes SILENT; the producer is DESTROYED
   *
   * So STOP and CLEAR reach genuinely different end states, and both are legible
   * to the occupancy tap: stopped reads OCCUPIED (the producer is there),
   * cleared reads silent.
   */
  stop(slot: CommandSlot): string {
    return `CG ${target(slot)} STOP ${String(FLASH_LAYER)}`;
  }

  /**
   * R-028 (owner call o2) — advance the template's sequence: `CG NEXT`.
   *
   * The capability has existed template-side all along — the exporter sets
   * `window.next`, `next()` is a CasparCG global, and `runtime.next()`
   * dispatches to the sequence drivers — but the bridge could never SEND it:
   * this builder had no NEXT verb, so the wire gap made the whole feature
   * unreachable. The verb lands here (the single AMCP construction seam);
   * the channel/UI wiring is R-028 part B, gated on the import-derived
   * `hasNext` bit so an enabled control can never be a no-op.
   */
  next(slot: CommandSlot): string {
    return `CG ${target(slot)} NEXT ${String(FLASH_LAYER)}`;
  }

  /** Hard-out: clear the slot. DESTROYS the producer — contrast `stop()`. */
  out(slot: CommandSlot): string {
    return `CLEAR ${target(slot)}`;
  }

  /**
   * R-022 — set a layer's audio volume: `MIXER <ch>-<layer> VOLUME <value>`.
   *
   * The sixth verb, and the one REHEARSE is built on. Rehearse leaves the
   * CasparCG producer RESIDENT and mutes the layer, rather than
   * CLEAR-then-re-ADD: that cycle is exactly the sequence that failed in the
   * field — an adopt-`CLEAR` succeeded, the `CG ADD` after it returned 404, and
   * the layer was left empty on air. Rehearse must not depend on a path with a
   * known failure mode. (This is also R-029's recorded containment option 2.)
   *
   * WHY A MUTE IS NEEDED AT ALL. On 2.3.2 a resident, unplayed template is
   * already silent (issue #669 — zero across all 10,339 OSC samples) and
   * invisible (`cg-pending` hides the stage), so on today's plant this is
   * belt-and-braces. On 2.5.0 `CG ADD` alone puts audio on air 0.24 s later with
   * the stage still hidden — so the mute is what makes rehearse survive the
   * upgrade instead of becoming a landmine on it.
   *
   * MIXER STATE IS NOT PRODUCER STATE. It belongs to the channel's mixer, so it
   * survives a `CLEAR` and a `CG REMOVE` of the producer on the layer. Nothing
   * restores it implicitly — which is why {@link CommandBuilder.mixerVolume} is
   * called from the PLAY path unconditionally, on every take, rather than only
   * from a "leave rehearse" step: the failure mode of a missed restore is a
   * graphic that airs SILENT, and no crash, reload or missed transition may be
   * able to cause it.
   *
   * Not hardware-validated. `MIXER … VOLUME` is long-standing, documented AMCP
   * and the 2.3.2 plant is the reference, but this verb has not been exercised on
   * it by this project — recorded in `DEBT.md`.
   */
  mixerVolume(slot: CommandSlot, volume: number): string {
    return `MIXER ${target(slot)} VOLUME ${String(volume)}`;
  }

  /**
   * C-015 phase 6 (6.1) — **seat a LIVE SOURCE producer on a layer.**
   *
   * The eighth verb, and the first thing this builder has ever emitted that is not
   * a `CG …` on an html producer. `take()` is `CG … PLAY 0` — it plays a template
   * INSIDE an already-ADDed html producer and cannot start any other kind — so
   * before this there was no way for the bridge to put a route, a card or a clip on
   * a layer at all. (A broadcast-safety test had to open its own raw TCP socket to
   * do it, documented there as "deliberately NOT the bridge"; that test was itself
   * the evidence of this gap.)
   *
   * 🔴 **THE ARGUMENT IS BUILT FROM A PARSED SHAPE, NEVER FROM A STRING.**
   * `SourceProducer` is a discriminated union on `kind`, so an unreachable producer
   * form is a parse error at the config boundary rather than an AMCP `400` at take
   * time — with a guest's box black and nothing on screen saying why. This method
   * is the only place that union becomes wire text.
   *
   * The five spellings, and how much each is worth:
   *
   *   `route`    — `route://<channel>[-<layer>]`. MEASURED on the plant's 2.3.2
   *                (design.md §0b): the form is accepted and does not run away. The
   *                optional `-<layer>` tail is a SAFETY term and not merely grammar —
   *                on a single-channel install, `route://<channel>` pointed at its own
   *                channel is a feedback loop, so the studio plate can only be
   *                addressed with the layer form (§9a.2).
   *   `media`    — a bare file name, quoted. What CasparCG assumes for an
   *                argument carrying no scheme and no keyword.
   *   `decklink` — `DECKLINK DEVICE <n>`. ⭐ **MEASURED on the plant's 2.5.0
   *                (`69e8ad5`) in BOTH forms — the index AND the persistent ID.**
   *                The card is a **DeckLink SDI 4K**, enumeration index **1**,
   *                persistent ID **23487013**.
   *                  - 2026-08-24: `PLAY 1-10 DECKLINK DEVICE 1` → `Initialized`,
   *                    repeatedly, with real signal.
   *                  - 2026-08-25: `PLAY 1-10 DECKLINK DEVICE 23487013` →
   *                    `DeckLink SDI 4K [23487013|1080p5000] Initialized`, `202`,
   *                    then `Input format changed from 1080p5000 to 1080i5000` —
   *                    and THAT last line is what makes it a pass rather than a
   *                    `202` over a dead producer, because only an open card can
   *                    report the incoming raster changing under it. The log names
   *                    the device by its ID, so the server resolved the argument AS
   *                    an ID rather than coincidentally matching an index.
   *                ⇒ **`n` may be EITHER an enumeration index or a persistent ID**,
   *                and the schema (`z.number().int().positive()`) already admits
   *                both, so this method needs no discrimination between them.
   *                ⭐ Prefer the persistent ID where an operator has one: an index
   *                moves when the PCIe order changes or a second card is fitted.
   *                Evidence: `docs/recon/2026-08-25-decklink-model-walk.md` Q1.
   *                ⚠ **What is NOT settled is CONTENTION, not spelling** — one
   *                physical input admits ONE producer, and a `CLEAR` answers `202`
   *                before the old producer is destroyed. See **B-177**; it bites
   *                the caller that sequences these, never this formatter.
   *   `ndi`      — `NDI NAME "<source>"`. ⚠ **PARSE-VERIFIED ONLY** — no NDI source
   *                exists on this plant and the NDI module is gated, so nothing here
   *                has ever put an NDI producer on air. That debt is **C-021's**.
   *   `stream`   — the URL alone, quoted, exactly as `media` is (C-025). Its
   *                standing is stated honestly: the owner ran
   *                `PLAY 1-<layer> "<url>"` BY HAND on the plant and it PLAYED —
   *                one manual run, not a suite, and more than `ndi` has ever had
   *                here. The scheme allowlist is `validateSourceCatalog`'s (the
   *                config boundary); by the time a URL reaches this method it has
   *                already been accepted there.
   *
   * `keyDevice` is deliberately NOT read here. A fill+key pair is TWO layers, so it
   * is a decision about how many producers to seat and where — the caller's, from
   * the ledger's `role` — not a spelling this method can make. Reading it here would
   * put a key signal on the fill layer.
   *
   * ⚠ **That silence is a REAL GAP, and it has an item: C-027.** Nothing seats the
   * key, so a mapping carrying `keyDevice` yields the fill alone. The operator is
   * told this in CG Control's Sources modal rather than left to infer it from a
   * missing picture — the modal's summary describes only what THIS method emits, and
   * a stored `keyDevice` is reported there as not yet sent. If that sentence and this
   * method ever disagree again, `apps/runtime/tests/decklinkKeyDeviceHonesty.dom.test.ts`
   * is the test that fails: it asserts BOTH halves against the SAME value.
   */
  playSource(slot: CommandSlot, producer: SourceProducer): string {
    return `PLAY ${target(slot)} ${this.sourceArgument(producer)}`;
  }

  /**
   * C-015 phase 6 (task 6.0) — the producer ARGUMENT alone, without the `PLAY`.
   *
   * Exposed for exactly one caller: the ledger records _"the concrete producer
   * argument actually SENT"_ (`live-layers.ts`), and the only way to record that
   * honestly is to ask the same function {@link playSource} asks. Formatting the
   * argument a second time at the ledger's call site would be a second spelling
   * of the wire text — and the failure it produces is a ledger that CLAIMS a
   * layer carries `route://1-2` while the layer carries something else, which no
   * test comparing the ledger against itself can see.
   *
   * It is deliberately NOT a way to hand-build a `PLAY`: every seating path goes
   * through {@link playSource}, so the layer-scoped `target()` cannot be skipped.
   */
  sourceArgument(producer: SourceProducer): string {
    return producerArgument(producer);
  }

  /**
   * C-015 phase 6 (6.1) — **the placement of a live layer: `FILL` AND `CLIP`, as ONE
   * PAIR from ONE computation.**
   *
   * 🔴 **THIS RETURNS TWO COMMANDS ON PURPOSE, AND IT MUST NEVER BE SPLIT INTO
   * `mixerFill` + `mixerClip`.** The reason is measured, not stylistic
   * (design.md §3, on 2.5.0 and re-confirmed on the plant's 2.3.2): `CLIP` masks in
   * the SAME channel-normalized space as `FILL` and does **not travel with it**. A
   * fill box that moves out from under its clip window renders **NOTHING AT ALL** —
   * on air, a black hole where a guest's face should be, with a `202` on the wire
   * and no error anywhere.
   *
   * The measurement that proves it is the last row of §3's table:
   * `MIXER 1-2 FILL 0.5 0.5 0.5 0.5` puts the box bottom-right, and
   * `MIXER 1-2 CLIP 0 0 0.5 0.5` then makes it vanish entirely rather than clipping
   * it — had `CLIP` been source-relative or travelled with the fill, some box would
   * have survived.
   *
   * Two builder methods would make that a CALLER mistake — one someone makes once,
   * at 2 a.m., by updating a fit and forgetting the mask. One method makes it
   * **unrepresentable**. This is golden rule 7's shape exactly: one condition
   * governing two commands is evaluated once, and here one geometry emitting two
   * commands is emitted once.
   *
   * ORDER: `FILL` then `CLIP`. ⭐ **`B-198` — and they now land on the SAME FRAME**, because
   * every `MIXER` line of a seating batch is sent with `DEFER` and one {@link mixerCommit}
   * applies the lot. See {@link deferMixer} for the measurement that settled the open question
   * this comment used to record.
   */
  mixerFit(slot: CommandSlot, fit: { fill: NormalizedRect; clip: NormalizedRect }): string[] {
    return [
      `MIXER ${target(slot)} FILL ${rect(fit.fill)}`,
      `MIXER ${target(slot)} CLIP ${rect(fit.clip)}`,
    ];
  }

  /**
   * C-015 phase 6 (6.6) — reset a layer's mixer geometry: `MIXER <ch>-<layer> CLEAR`.
   *
   * **NOT optional tidiness.** Mixer state belongs to the CHANNEL'S MIXER, not to
   * the producer, so it survives both a `CLEAR` of the layer and a `CG REMOVE` —
   * the same fact `mixerVolume` above is built on, and measured on hardware. A Live
   * Source teardown that omits this leaves a `FILL` **and a `CLIP`** on the layer for
   * the next, entirely unrelated graphic to inherit.
   *
   * Of the two, the inherited `CLIP` is the worse: a stale `FILL` puts a graphic in
   * the wrong PLACE, which someone sees and reports, while a stale `CLIP` makes an
   * otherwise-correct graphic **invisible**, with nothing on the wire explaining why.
   *
   * It resets geometry only. `VOLUME` is deliberately left alone by the mock's model
   * of this verb and by the real one, so R-022's rehearse restore keeps being tested
   * on its own terms rather than being silently repaired by a teardown.
   */
  mixerClear(slot: CommandSlot): string {
    return `MIXER ${target(slot)} CLEAR`;
  }

  /**
   * 🔴 **`B-198` — STAGE a `MIXER` line instead of applying it.**
   *
   * ── WHAT THE DEFECT WAS ─────────────────────────────────────────────────────
   *
   * A look switch sends one `MIXER … FILL` + `CLIP` pair per plate, and `#applyLivePlates`
   * awaits each line's ACK before writing the next — so the pair for plate 2 is separated from
   * plate 1's by a full command/ACK round trip. When a channel tick fell inside that gap the
   * fills landed a frame apart and the departing box drew over the arriving plate for 40 ms.
   * Measured at 1 recording in 50; forced on demand it reproduces at 22.68 % of the frame,
   * which is that box's own area to the last digit.
   *
   * ── WHAT THIS BUILD ACTUALLY OFFERS, MEASURED ON THE WIRE ───────────────────
   *
   * `MIXER 1-30 FILL … DEFER` answers `202 MIXER OK` and the getter still reports the OLD
   * value; `MIXER 1 COMMIT` answers `202` and the getter then reports the new one. **The
   * control that makes those readings mean something:** a bogus trailing token
   * (`… FILL 0 0 1 1 BANANAS`) answers **`501 MIXER FILL FAILED`** and `MIXER 1 BANANAS`
   * answers **`400 ERROR`** — this parser does NOT silently swallow words it does not know, so
   * a `202` on `DEFER` is a `202` on a verb it understood.
   *
   * ⚠ **THE SCOPE, ALSO MEASURED, AND IT IS WIDER THAN THE VERB LOOKS.** `MIXER 1-30 COMMIT`
   * applied a change staged on 1-31 as well: the layer token is accepted and IGNORED, so there
   * is no per-layer commit — a commit is CHANNEL-WIDE. And the staging area is shared BETWEEN
   * CONNECTIONS: a change deferred on one socket was applied by a `COMMIT` issued on another.
   * A deferred change nobody commits hangs indefinitely (1500 ms with no commit left it
   * unapplied), and a DROPPED CONNECTION does not clear it either — `B-199` measured a change
   * staged on a destroyed socket being applied by a commit from a new one. That is what
   * {@link CasparRuntime}'s abort guard (`B-199`, a throw) and its reconnect flush (`B-221`, a
   * dead link) exist for. From the server's own source (2.5.0 `AMCPCommandsImpl.cpp`,
   * `transforms_applier`): the staging area is ONE process-wide `static` vector per channel
   * index, appended by `DEFER`, applied-then-cleared by `COMMIT`, and touched by nothing else —
   * no `CLEAR`, no `MIXER CLEAR`, no disconnect, no discard verb of any kind.
   *
   * ── 🔴 THE CROSS-CONNECTION EXPOSURE: REAL IN DESIGN, DORMANT IN PRACTICE ──────────────
   *
   * Because that vector is shared by every connection, a `COMMIT` of ours applies whatever
   * anyone staged and a `COMMIT` of anyone's applies ours — measured, not assumed (`B-198`, on
   * the plant's 2.5.0). That half cannot be fixed from here; it is an OPERATING CONSTRAINT and
   * is written where an installer meets it (`docs/operator-guide/README.md`, "Air-critical
   * contracts").
   *
   * **As of 2026-09-05 it is DORMANT.** Over every retained CasparCG log on the playout machine
   * (`192.168.21.114`), exactly TWO senders have ever issued an AMCP command: this bridge at
   * `192.168.21.93`, and the server's own `Console`. No second client has ever connected, so no
   * foreign `DEFER` or `COMMIT` has ever existed on that server. ⚠ Retained logs, not the
   * machine's whole history — strong evidence of current practice, not proof about the past.
   * The enumeration, run by the owner and to be re-run in a PowerShell window ON the playout
   * machine (one line):
   *
   *   Select-String -Path 'D:\casparcg-server-v2.5.0-stable-windows\log\caspar_*.log' -Pattern 'Received message from ([^:]+):' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique
   *
   * **What wakes it:** ANY second AMCP client on that CasparCG — first among them the owner's
   * playout system, which is why `reservedLayers` exists. A third line in that output is the
   * signal; when it appears, the question becomes whether that client uses `DEFER`, and if it
   * does this pair needs a different answer (`B-198` records the pipelining fallback, costed).
   * The half that needs no second client — our own commit failing to ARRIVE — is `B-221`.
   */
  deferMixer(line: string): string {
    // Only a `MIXER` line can be deferred. Everything else — `PLAY`, `CG …` — is returned
    // untouched, so the ONE call site can hand it every line of a batch without sorting them
    // and a `MIXER` added to that batch later is deferred by construction rather than by
    // somebody remembering. That is the same "make it unrepresentable" move `mixerFit` makes
    // for the FILL/CLIP pair, one level up.
    return line.startsWith('MIXER ') ? `${line} DEFER` : line;
  }

  /**
   * `B-198` — apply everything staged on the channel, on ONE frame.
   *
   * ⚠ **CHANNEL-SCOPED because that is the only scope this build has** (see
   * {@link deferMixer}): `MIXER <ch>-<layer> COMMIT` was measured to commit the whole channel
   * anyway, so spelling a layer here would be a promise the server does not keep.
   */
  mixerCommit(channel: number): string {
    return `MIXER ${String(channel)} COMMIT`;
  }
}

/**
 * One `MIXER` rect as four space-separated numbers, in the order AMCP takes them:
 * `x y width height`, each a fraction of the channel raster ON ITS OWN AXIS.
 *
 * PER-AXIS is the measured basis (design.md §0b fact 1) and is the thing most
 * likely to be "corrected" by someone who expects a uniform fraction. It is also
 * why the page and the wire can disagree: the page scales UNIFORMLY and
 * letterboxes, so the two agree only on a 16:9 raster — which is exactly why the
 * contract test pinning them together requires a non-16:9 case.
 *
 * ⚠ **PRECISION IS NOT MEASURED.** §6 emits computed fractions rather than round
 * numbers, and what rounding the server accepts for these four arguments has never
 * been recorded (tasks.md 6.3a(b)). `numberArg` therefore emits at most 6 decimals,
 * matching what the page's `css()` uses for the same geometry — chosen so the two
 * sides round identically rather than because AMCP is known to want it. If a probe
 * ever shows the server wants fewer, this is the one place to change.
 */
function rect(r: NormalizedRect): string {
  return [r.x, r.y, r.width, r.height].map(numberArg).join(' ');
}

/**
 * A number as an AMCP argument: at most 6 decimals, trailing zeros trimmed.
 *
 * Never exponential notation, which `String(1e-7)` would produce and which no AMCP
 * parser is known to accept: `toFixed` first, then `Number` to trim, and a magnitude
 * below the precision floor lands on a clean `0` rather than on `1e-7`.
 */
function numberArg(n: number): string {
  return String(Number(n.toFixed(6)));
}

/**
 * ONE producer union arm → its AMCP argument text.
 *
 * Every user-supplied value goes through `quote()` EXACTLY ONCE, per this module's
 * contract. Note which values are quoted and which are not, because it is not
 * uniform and the difference is the server's, not ours: a route address, a media
 * file name, a stream URL and an NDI source NAME are single arguments and are
 * quoted; the `DECKLINK` / `DEVICE` / `NAME` keywords and the device INDEX are
 * AMCP syntax and would be refused if quoted. For a URL, `quote()` is the
 * IDENTITY wrap: its escape set (`\`, `"`, LF, CR) contains no character a URL
 * carries, which is why the media-field workaround produced the proven command.
 *
 * The device index is emitted through `String()` on a value the schema has already
 * constrained to a positive integer — there is no path by which an operator string
 * reaches the wire unquoted.
 */
function producerArgument(producer: SourceProducer): string {
  switch (producer.kind) {
    case 'route': {
      // The layer tail is appended only when present. `layer` is
      // `nonnegative()`, so **layer 0 is a real, addressable layer** and the test
      // must be `!== undefined` — a truthiness check here would silently drop it
      // and route the whole channel instead of one layer, which on a
      // single-channel install is the feedback loop §9a.2 exists to avoid.
      const tail = producer.layer === undefined ? '' : `-${String(producer.layer)}`;
      return quote(`route://${String(producer.channel)}${tail}`);
    }
    case 'decklink':
      // Keywords and the index are AMCP syntax, not values: unquoted.
      return `DECKLINK DEVICE ${String(producer.device)}`;
    case 'ndi':
      return `NDI NAME ${quote(producer.source)}`;
    case 'media':
      return quote(producer.file);
    case 'stream':
      return quote(producer.url);
  }
}

/** `<channel>-<layer>` per AMCP. */
function target(slot: CommandSlot): string {
  return `${String(slot.channel)}-${String(slot.layer)}`;
}

/** Field values as the JSON string the HTML producer's `window.update` expects. */
function serialize(fields: FieldValues): string {
  return JSON.stringify(fields);
}
