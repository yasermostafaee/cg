import * as http from 'node:http';
import * as https from 'node:https';
import { decodeCgData } from './cg-data.js';
import type { AmcpHandler, AmcpRequest, HandlerContext, AmcpResponse } from './types.js';

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
 *
 * Modelled because rehearse depends on it and its failure mode is SILENCE ON
 * AIR: rehearse leaves the producer resident and mutes the layer, so a mute that
 * is never restored is a graphic that airs with no sound. Without a MIXER handler
 * the mock answered `400 ERROR` to the mute, which would have made the bridge's
 * fail-closed refusal fire in every test and hidden the real behaviour behind a
 * plumbing failure.
 *
 * Only the VOLUME sub-verb is implemented. Anything else is `400`, deliberately:
 * an unimplemented sub-verb that silently `202`s would let a wrong command look
 * correct, which is the one thing a mock must never do.
 *
 * The volume is applied to the layer's mixer state and NOT reset by `CLEAR` or
 * `CG REMOVE` (those handlers patch specific fields), which is the real
 * behaviour — mixer state belongs to the channel, not to the producer — and is
 * precisely why the restore has to be explicit.
 */
function handleMixer(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'MIXER' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'MIXER' };
  if ((req.args[1] ?? '').toUpperCase() !== 'VOLUME') {
    return { kind: 'err', code: 400, verb: 'MIXER' };
  }
  const raw = req.args[2];
  if (raw === undefined) return { kind: 'err', code: 402, verb: 'MIXER' };
  const volume = Number(raw);
  // A non-numeric or negative volume is a REFUSAL, not a clamp: silently
  // coercing it would let a malformed mute read as a successful one.
  if (!Number.isFinite(volume) || volume < 0) return { kind: 'err', code: 401, verb: 'MIXER' };
  ctx.setLayer(slot, { volume });
  return { kind: 'ok', code: 202, verb: 'MIXER' };
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
  // INFO <channel>: minimal XML stub — caspar-client parses INFO only loosely.
  const ch = Number(req.args[0]);
  if (!Number.isInteger(ch) || ch < 1 || ch > ctx.channelCount) {
    return { kind: 'err', code: 404, verb: 'INFO' };
  }
  const xml = [
    '<channel>',
    `  <index>${String(ch)}</index>`,
    '  <video-mode>1080i5000</video-mode>',
    '  <stage>',
    '    <layers/>',
    '  </stage>',
    '</channel>',
  ];
  return { kind: 'ok-multi', code: 200, verb: 'INFO', lines: xml };
}

/**
 * R-015 — which producer real CasparCG would build for a `PLAY`/`LOAD`
 * argument: the `[HTML]` keyword or an http(s) URL yields the html producer;
 * anything else is the media path (`ffmpeg`). The kind is load-bearing — the
 * video-layer protection discriminates on exactly this OSC signal — so the
 * mock must not flatten media to `html` (the pre-R-015 M4 shortcut).
 */
function producerFor(args: readonly string[]): 'html' | 'ffmpeg' {
  const url = args[1] ?? '';
  const htmlKeyword = args.some((a) => a.toUpperCase() === 'HTML');
  return htmlKeyword || /^https?:\/\//i.test(url) ? 'html' : 'ffmpeg';
}

/**
 * `PLAY <channel>-<layer> "<url|file>" [HTML]`
 */
function handlePlay(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'PLAY' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'PLAY' };
  const url = req.args[1] ?? '';
  // Non-fetching media/producer path — the page state is inertly 'resolved'.
  ctx.setLayer(slot, {
    producer: producerFor(req.args),
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
  const url = req.args[1] ?? '';
  // LOAD primes the foreground but pauses immediately — PLAY is required to resume.
  ctx.setLayer(slot, {
    producer: producerFor(req.args),
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
