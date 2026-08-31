import * as http from 'node:http';
import * as https from 'node:https';
import { decodeCgData } from './cg-data.js';
import {
  FULL_FRAME,
  type AmcpHandler,
  type AmcpRequest,
  type HandlerContext,
  type AmcpResponse,
  type MixerRect,
  type ProducerKind,
} from './types.js';

/**
 * Built-in handler set. Models the subset of CasparCG 2.3.x AMCP that
 * @cg/caspar-client exercises: VERSION, INFO, PLAY [HTML], CG ADD,
 * CG INVOKE, CG STOP, CG REMOVE, CLEAR.
 *
 * Anything else is a `400 ERROR`. Tests can override individual verbs via
 * `MockHandle.setHandler`.
 */
export function defaultHandlers(): Map<string, AmcpHandler> {
  const m = new Map<string, AmcpHandler>();
  m.set('VERSION', handleVersion);
  m.set('INFO', handleInfo);
  m.set('PLAY', handlePlay);
  m.set('LOAD', handleLoad);
  m.set('CLEAR', handleClear);
  m.set('CG', handleCg);
  m.set('MIXER', handleMixer);
  return m;
}

/**
 * R-022 — `MIXER <ch>-<layer> VOLUME <value>`.
 * D-137 / C-015 — `MIXER <ch>-<layer> FILL|CLIP <x> <y> <x-scale> <y-scale>`
 * and `MIXER <ch>-<layer> CLEAR`.
 *
 * VOLUME is modelled because rehearse depends on it and its failure mode is
 * SILENCE ON AIR: rehearse leaves the producer resident and mutes the layer, so
 * a mute that is never restored is a graphic that airs with no sound. Without a
 * MIXER handler the mock answered `400 ERROR` to the mute, which would have made
 * the bridge's fail-closed refusal fire in every test and hidden the real
 * behaviour behind a plumbing failure.
 *
 * FILL and CLIP are modelled for the same shape of reason one layer out: the
 * geometry chain in `live-source-multibox` design.md §6 is otherwise
 * UNCHECKABLE OFFLINE, and its failure mode — a live box placed beside the
 * transparent hole it should fill, or masked away entirely — produces no error
 * and no operator signal.
 *
 * Anything OTHER than these four sub-verbs is still `400`, deliberately: an
 * unimplemented sub-verb that silently `202`s would let a wrong command look
 * correct, which is the one thing a mock must never do.
 *
 * All mixer state here is applied to the layer and NOT reset by `CLEAR` or
 * `CG REMOVE` (those handlers patch specific fields), which is the real
 * behaviour — mixer state belongs to the channel, not to the producer — and is
 * precisely why both the volume restore and the geometry reset have to be
 * explicit.
 */
function handleMixer(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'MIXER' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'MIXER' };
  const sub = (req.args[1] ?? '').toUpperCase();

  if (sub === 'VOLUME') {
    const raw = req.args[2];
    if (raw === undefined) return { kind: 'err', code: 402, verb: 'MIXER' };
    const volume = Number(raw);
    // A non-numeric or negative volume is a REFUSAL, not a clamp: silently
    // coercing it would let a malformed mute read as a successful one.
    if (!Number.isFinite(volume) || volume < 0) return { kind: 'err', code: 401, verb: 'MIXER' };
    ctx.setLayer(slot, { volume });
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  }

  if (sub === 'FILL' || sub === 'CLIP') {
    const rect = parseMixerRect(req.args.slice(2));
    // Same doctrine as VOLUME's refusal: four numbers or nothing. A rect with a
    // silently-coerced component is a geometry nobody declared, and half a
    // placement is worse than none — it looks applied.
    if (rect === null) return { kind: 'err', code: 401, verb: 'MIXER' };
    ctx.setLayer(slot, sub === 'FILL' ? { fill: rect } : { clip: rect });
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  }

  if (sub === 'CLEAR') {
    // Resets the layer's GEOMETRY, not its volume: `MIXER CLEAR` on real
    // CasparCG resets the mixer for the layer, and this mock models the two
    // geometry terms it carries. Volume is deliberately left alone here so the
    // R-022 restore path keeps being tested on its own terms.
    ctx.setLayer(slot, { fill: FULL_FRAME, clip: FULL_FRAME });
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  }

  return { kind: 'err', code: 400, verb: 'MIXER' };
}

/**
 * `<x> <y> <x-scale> <y-scale>` → a normalized rect, or `null` when the four
 * arguments are not four finite numbers.
 *
 * NOT clamped to `[0,1]`. A `FILL` may legitimately hang off the frame, and a
 * mock that clamped would hide exactly the bridge bug (an unclamped scene rect)
 * that the real server would show as a box running off the raster.
 */
function parseMixerRect(args: readonly string[]): MixerRect | null {
  if (args.length < 4) return null;
  const nums = args.slice(0, 4).map(Number);
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as [number, number, number, number];
  return { x, y, width, height };
}

const VERSION_STRING = '2.3.2 Stable';

function handleVersion(_req: AmcpRequest): AmcpResponse {
  return { kind: 'ok-line', code: 201, verb: 'VERSION', data: VERSION_STRING };
}

function handleInfo(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  if (req.args.length === 0) {
    const lines: string[] = [];
    for (let ch = 1; ch <= ctx.channelCount; ch++) {
      lines.push(`${String(ch)} PAL PLAYING`);
    }
    return { kind: 'ok-multi', code: 200, verb: 'INFO', lines };
  }
  /*
    🔴 `B-189` — `INFO <channel>` answers in the REAL server's dialect, because the old
    stub's dialect is how a broken parser stayed green for its whole life.

    The real 2.5.0 `69e8ad5` (captured on the wire 2026-08-31, quoted verbatim in
    `@cg/shared-ipc`'s `channel-settings.test.ts`) answers `201 INFO OK` followed by ONE
    payload chunk — an XML document whose internal newlines are bare `\n`, whose mode tag
    is `<format>`, terminated by a single `\r\n`. The old stub answered `200`/`ok-multi`
    with a `<video-mode>` tag: both axes matched the CODE's expectation instead of the
    server's, so `#readChannelMode` discarded every real reply while every test passed.
    **A mock that agrees with the code only proves the code agrees with itself** — this
    handler now mirrors the captured reply's shape exactly (status class, one-chunk body,
    bare-`\n` interior, tag names, 3-space indent), with the mock's own mode value.
  */
  const ch = Number(req.args[0]);
  if (!Number.isInteger(ch) || ch < 1 || ch > ctx.channelCount) {
    return { kind: 'err', code: 404, verb: 'INFO' };
  }
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<channel>',
    '   <format>1080i5000</format>',
    '   <framerate>50</framerate>',
    '   <framerate>1</framerate>',
    '   <mixer>',
    '      <audio/>',
    '   </mixer>',
    '   <output>',
    '      <port/>',
    '   </output>',
    '</channel>',
    '',
  ].join('\n');
  return { kind: 'ok-line', code: 201, verb: 'INFO', data: xml };
}

/** A classified producer argument, or the reason the mock refuses to build one. */
type ProducerVerdict =
  | { ok: true; kind: Exclude<ProducerKind, 'empty'> }
  | { ok: false; code: number; detail: string };

/** `route://<channel>` or `route://<channel>-<layer>`, both 1-based. */
const ROUTE_TARGET = /^(\d+)(?:-(\d+))?$/;
/** Anything that ANNOUNCES itself as a scheme: `<word>://`. */
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;

/**
 * R-015 / D-137 — which producer real CasparCG would build for a `PLAY` /
 * `LOAD` argument.
 *
 * ── WHY THIS IS A CLASSIFIER AND NOT A TWO-WAY TEST ─────────────────────────
 *
 * It used to answer `'html' | 'ffmpeg'` and nothing else, so
 * `PLAY 1-11 "route://1-10"` was recorded as `'ffmpeg'` — indistinguishable
 * from a foreign video layer, which is the exact discriminator the D-137 /
 * C-015 ownership work turns on. Every ownership test would have been asserting
 * against a state the mock could not represent.
 *
 * ── AND WHY AN UNRECOGNISED FORM IS A REFUSAL ───────────────────────────────
 *
 * This module's own doctrine, written for `handleMixer`: _"an unimplemented
 * sub-verb that silently 202s would let a wrong command look correct, which is
 * the one thing a mock must never do."_ `handlePlay` did not obey it — it
 * refused only on ADDRESSING (bad slot, bad channel) and then `202`d ANY
 * producer argument, so `rout://1-1` and `DECKLINK DEVIC 3` both read as
 * success. That never mattered while the bridge only ever emitted `CG ADD`; it
 * starts mattering the moment the bridge emits `PLAY`, which is what phase 6
 * does.
 *
 * The line drawn is: a bare token with **no scheme and no keyword** is a media
 * FILE NAME and stays `'ffmpeg'`, exactly as CasparCG treats it (this is what
 * the existing foreign-layer fixtures like `"program-feed.mov"` rely on). A
 * token that announces a structured form — a `scheme://`, or a `DECKLINK` /
 * `NDI` keyword — and then fails to parse is REFUSED, because there is no
 * reading of it under which the server would have done what was asked.
 *
 * ⭐ **`DECKLINK DEVICE <n>` is MEASURED in BOTH forms** on this plant's DeckLink
 * SDI 4K (2.5.0 `69e8ad5`): the enumeration INDEX (`DEVICE 1`, 2026-08-24) and the
 * PERSISTENT ID (`DEVICE 23487013`, 2026-08-25 — recon walk Q1). What this
 * classifier models is therefore the form the server accepts, not a guess about it,
 * and it is right not to distinguish the two: they are one integer field.
 *
 * ⚠ **Still MODELLED, NOT MEASURED: the NDI spelling** — no NDI source exists on
 * this plant and the module is gated (C-021). When hardware confirms or corrects it,
 * this classifier and the mapping schema change together.
 *
 * 🔴 **WHAT THIS MOCK DOES NOT MODEL, AND MUST NOT BE READ AS EVIDENCE ABOUT: DEVICE
 * CONTENTION.** On real hardware ONE physical input admits ONE producer, `CLEAR`
 * answers `202` BEFORE the old producer is destroyed, and the new producer is
 * constructed before the old one dies — so a `CLEAR`-then-`PLAY` on the same device
 * can fail, and the failure surfaces as `404` + `File not found.` because the
 * producer registry falls through to the FILE producer. Here every `PLAY` succeeds
 * instantly and nothing contends. **B-177.** A green suite against this mock says
 * nothing about that class of failure.
 */
function classifyProducer(args: readonly string[]): ProducerVerdict {
  const first = args[1] ?? '';
  if (first === '') {
    return { ok: false, code: 402, detail: 'MISSING PRODUCER ARGUMENT' };
  }

  // B-038-era fidelity gap, fixed: real CasparCG's keyword is written `[HTML]`
  // in its own documentation and logs, and the old test compared `=== 'HTML'`,
  // so the real spelling never matched and every mock-facing test had to use a
  // non-CasparCG argument order to get an html producer at all.
  const keyword = (a: string): string => a.toUpperCase().replace(/^\[|\]$/g, '');
  if (args.some((a) => keyword(a) === 'HTML') || /^https?:\/\//i.test(first)) {
    return { ok: true, kind: 'html' };
  }

  const upper = first.toUpperCase();
  if (upper === 'DECKLINK') {
    const device = args[2]?.toUpperCase() === 'DEVICE' ? Number(args[3]) : NaN;
    if (!Number.isInteger(device) || device < 1) {
      return { ok: false, code: 404, detail: 'DECKLINK NEEDS DEVICE <n>' };
    }
    return { ok: true, kind: 'decklink' };
  }
  if (upper === 'NDI') {
    const named = args[2]?.toUpperCase() === 'NAME' && (args[3] ?? '') !== '';
    if (!named) return { ok: false, code: 404, detail: 'NDI NEEDS NAME <source>' };
    return { ok: true, kind: 'ndi' };
  }

  const scheme = SCHEME.exec(first);
  if (scheme !== null) {
    if (scheme[1]?.toLowerCase() !== 'route') {
      return { ok: false, code: 404, detail: `UNKNOWN PRODUCER SCHEME ${scheme[1] ?? ''}` };
    }
    const target = ROUTE_TARGET.exec(first.slice(scheme[0].length));
    if (target === null || Number(target[1]) < 1) {
      return { ok: false, code: 404, detail: 'ROUTE NEEDS <channel>[-<layer>]' };
    }
    return { ok: true, kind: 'route' };
  }

  // No scheme, no keyword — a media file name, which is what CasparCG assumes.
  return { ok: true, kind: 'ffmpeg' };
}

/**
 * `PLAY <channel>-<layer> "<url|file|route://…>" [HTML]`
 * `PLAY <channel>-<layer> DECKLINK DEVICE <n>`
 * `PLAY <channel>-<layer> NDI NAME "<source>"`
 */
function handlePlay(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'PLAY' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'PLAY' };
  const verdict = classifyProducer(req.args);
  // The layer is left UNTOUCHED on a refusal — a refused PLAY that had already
  // written the producer would be the "looks acked, renders nothing" gap in
  // reverse: looks refused, layer changed anyway.
  if (!verdict.ok) {
    return { kind: 'err', code: verdict.code, verb: 'PLAY', detail: verdict.detail };
  }
  const url = req.args[1] ?? '';
  // Non-fetching media/producer path — the page state is inertly 'resolved'.
  ctx.setLayer(slot, {
    producer: verdict.kind,
    filePath: url,
    paused: false,
    onAir: true,
    pageResolution: 'resolved',
  });
  return { kind: 'ok', code: 202, verb: 'PLAY' };
}

function handleLoad(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'LOAD' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'LOAD' };
  // ONE classifier for both verbs — `PLAY` and `LOAD` build the same producers,
  // and two copies of the acceptance rule is how they come to disagree about
  // what is a valid form.
  const verdict = classifyProducer(req.args);
  if (!verdict.ok) {
    return { kind: 'err', code: verdict.code, verb: 'LOAD', detail: verdict.detail };
  }
  const url = req.args[1] ?? '';
  // LOAD primes the foreground but pauses immediately — PLAY is required to resume.
  ctx.setLayer(slot, {
    producer: verdict.kind,
    filePath: url,
    paused: true,
    onAir: false,
    pageResolution: 'resolved',
  });
  return { kind: 'ok', code: 202, verb: 'LOAD' };
}

function handleClear(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const target = req.args[0];
  if (!target) {
    return { kind: 'err', code: 402, verb: 'CLEAR' };
  }
  const slot = parseChannelLayer(target);
  if (slot) {
    if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CLEAR' };
    // B-039 — CLEAR DESTROYS the producer (and takes it off air).
    ctx.setLayer(slot, {
      producer: 'empty',
      filePath: '',
      paused: false,
      onAir: false,
      pageResolution: 'resolved',
    });
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  }
  // `CLEAR <channel>` — clear all layers on the channel. Walk known slots.
  const channel = Number(target);
  if (!Number.isInteger(channel) || channel < 1 || channel > ctx.channelCount) {
    return { kind: 'err', code: 401, verb: 'CLEAR' };
  }
  // Without enumerating layers we can't actually clear them — the registry
  // is sparse. CLEAR <channel> is a no-op against an empty channel, which
  // matches the real server semantics ("nothing on, nothing to clear").
  return { kind: 'ok', code: 202, verb: 'CLEAR' };
}

/**
 * `CG <channel>-<layer> ADD <flash-layer> "<template>" <play-on-load> "<data>"`
 * `CG <channel>-<layer> PLAY <flash-layer>`
 * `CG <channel>-<layer> STOP <flash-layer>`
 * `CG <channel>-<layer> UPDATE <flash-layer> "<data>"`
 * `CG <channel>-<layer> INVOKE <flash-layer> "<method>"`
 * `CG <channel>-<layer> REMOVE <flash-layer>`
 *
 * B-038 — the mock STOPS blind-acking `CG ADD`: it **resolves** the template
 * argument so a "looks acked, renders nothing" regression can't hide. A bare id
 * (no URL) or a URL it cannot `GET` → `404` (real CasparCG's `CG ADD FAILED`);
 * only a URL that returns a served page → `202` (+ producer `html`). It also
 * records the `CG ADD` / `CG UPDATE` data payload on the handle so tests can
 * assert it is the real, non-empty field JSON (not `"{}"`).
 *
 * B-041 — the recorded data payload is the SECOND-layer decode verdict
 * (`decodeCgData`): what `window.update` would receive after the html_cg_proxy
 * `update("…")` V8 embed, or a rejection flag for a framing/JSON-breaking
 * argument. Like real CasparCG the command still `202`s — the V8 failure is
 * asynchronous — but the payload assertion in tests now catches it.
 */
function handleCg(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'CG' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CG' };

  const sub = req.args[1]?.toUpperCase();
  switch (sub) {
    case 'ADD': {
      // `CG <slot> ADD <flash-layer> "<template>" <play-on-load> "<data>"`.
      const template = req.args[3] ?? '';
      const playOnLoad = req.args[4] === '1';
      // B-041 — the data arg has passed layer 1 (the tokenizer); run the
      // layer-2 (html_cg_proxy → V8) emulation before recording.
      const token = ctx.recordCgAdd(slot, template, decodeCgData(req.args[5] ?? ''));
      // Reconnect-reconciliation — model REAL CasparCG's acceptance: a bare
      // (non-URL) reference is a template-path lookup → `404 CG ADD FAILED`,
      // while a URL is accepted with NO fetch before the ack (CEF loads it
      // asynchronously — a dead URL still `202`s and produces empty frames).
      // The async fetch verdict is recorded per slot (`lastCgAdd().resolution`)
      // so tests assert delivery through it, never through a synthetic AMCP
      // failure — the "looks acked, renders nothing" tripwire lives on there.
      if (!/^https?:\/\//i.test(template)) {
        ctx.completeCgAdd(slot, token, false);
        return { kind: 'err', code: 404, verb: 'CG', detail: 'CG ADD FAILED' };
      }
      // B-039 — the producer exists immediately (before the page finishes
      // loading); it is on air only if play-on-load is set (`… 1 …`). A load
      // (`… 0 …`) loads it without playing — the operator's `CG PLAY` plays.
      ctx.loadCgPage(slot, token, template, playOnLoad);
      void httpGetOk(template, 2000).then((ok) => {
        ctx.completeCgAdd(slot, token, ok);
      });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'UPDATE': {
      // `CG <slot> UPDATE <flash-layer> "<data>"` — expose the two-layer decode
      // verdict for assertion (B-041). Recorded even when the command fails:
      // the recording observes what was SENT.
      ctx.recordCgUpdate(slot, decodeCgData(req.args[3] ?? ''));
      // Reconnect-reconciliation — real CasparCG 403s an update on a layer with
      // no cg producer (`get_expected_cg_proxy`; the B-038 live log showed
      // exactly this). No more blind 202.
      if (ctx.getLayer(slot).producer !== 'html') {
        return { kind: 'err', code: 403, verb: 'CG', detail: 'CG UPDATE FAILED' };
      }
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'PLAY': {
      // B-039 — `CG PLAY` puts the template on air ONLY when a producer is loaded.
      // PLAY on an empty/destroyed layer is an observable NO-OP (onAir stays false),
      // though it still 202s — matching real CasparCG's blind ack. This is the exact
      // "looks acked, renders nothing" gap the old mock hid.
      // Reconnect-reconciliation — a 'failed' page produces empty frames (the
      // queued play() never flushes): PLAY still 202s but stays off air.
      const layer = ctx.getLayer(slot);
      if (layer.producer === 'html' && layer.pageResolution !== 'failed') {
        ctx.setLayer(slot, { onAir: true });
      }
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'STOP':
      ctx.setLayer(slot, { onAir: false });
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'INVOKE':
    case 'NEXT':
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'REMOVE': {
      ctx.setLayer(slot, {
        producer: 'empty',
        filePath: '',
        paused: false,
        onAir: false,
        pageResolution: 'resolved',
      });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    default:
      return { kind: 'err', code: 400, verb: 'CG' };
  }
}

/** True iff `GET <url>` returns a 2xx within `timeoutMs`. Never throws. */
function httpGetOk(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const lib = url.toLowerCase().startsWith('https:') ? https : http;
      const request = lib.get(url, (res) => {
        const status = res.statusCode ?? 0;
        res.resume(); // drain so the socket can free
        done(status >= 200 && status < 300);
      });
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        done(false);
      });
      request.on('error', () => done(false));
    } catch {
      done(false);
    }
  });
}

/**
 * `<channel>-<layer>` or `<channel>` — returns null on parse failure.
 * (Layer-less form is treated as layer 0, matching CasparCG defaults.)
 */
function parseChannelLayer(token: string | undefined): { channel: number; layer: number } | null {
  if (!token) return null;
  const dash = token.indexOf('-');
  if (dash === -1) {
    const ch = Number(token);
    if (!Number.isInteger(ch) || ch < 1) return null;
    return { channel: ch, layer: 0 };
  }
  const ch = Number(token.slice(0, dash));
  const ly = Number(token.slice(dash + 1));
  if (!Number.isInteger(ch) || ch < 1 || !Number.isInteger(ly) || ly < 0) return null;
  return { channel: ch, layer: ly };
}
