import * as http from 'node:http';
import * as https from 'node:https';
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
  return m;
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
 * `PLAY <channel>-<layer> "<url>" [HTML]`
 *
 * The mock only supports the HTML producer (M4 scope). Other producers
 * are accepted but recorded as `producer: 'html'` so the rest of the
 * pipeline can still test against them.
 */
function handlePlay(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'PLAY' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'PLAY' };
  const url = req.args[1] ?? '';
  ctx.setLayer(slot, { producer: 'html', filePath: url, paused: false, onAir: true });
  return { kind: 'ok', code: 202, verb: 'PLAY' };
}

function handleLoad(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'LOAD' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'LOAD' };
  const url = req.args[1] ?? '';
  // LOAD primes the foreground but pauses immediately — PLAY is required to resume.
  ctx.setLayer(slot, { producer: 'html', filePath: url, paused: true, onAir: false });
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
    ctx.setLayer(slot, { producer: 'empty', filePath: '', paused: false, onAir: false });
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
 */
async function handleCg(req: AmcpRequest, ctx: HandlerContext): Promise<AmcpResponse> {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'CG' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CG' };

  const sub = req.args[1]?.toUpperCase();
  switch (sub) {
    case 'ADD': {
      // `CG <slot> ADD <flash-layer> "<template>" <play-on-load> "<data>"`.
      const template = req.args[3] ?? '';
      const playOnLoad = req.args[4] === '1';
      const data = req.args[5] ?? '';
      ctx.recordCgAdd(slot, template, data);
      // Resolve the template argument instead of blind-acking. A served URL → 202;
      // a bare id / unreachable URL → 404 CG ADD FAILED (matches real CasparCG).
      const resolved = await resolveTemplateRef(template);
      if (!resolved) return { kind: 'err', code: 404, verb: 'CG', detail: 'CG ADD FAILED' };
      // B-039 — the producer is now LOADED; it is on air only if play-on-load is set
      // (`… 1 …`). A load (`… 0 …`) loads it without playing — the operator's
      // `CG PLAY` puts it on air.
      ctx.setLayer(slot, {
        producer: 'html',
        filePath: template,
        paused: false,
        onAir: playOnLoad,
      });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'UPDATE': {
      // `CG <slot> UPDATE <flash-layer> "<data>"` — expose the data for assertion.
      ctx.recordCgUpdate(slot, req.args[3] ?? '');
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'PLAY': {
      // B-039 — `CG PLAY` puts the template on air ONLY when a producer is loaded.
      // PLAY on an empty/destroyed layer is an observable NO-OP (onAir stays false),
      // though it still 202s — matching real CasparCG's blind ack. This is the exact
      // "looks acked, renders nothing" gap the old mock hid.
      if (ctx.getLayer(slot).producer === 'html') ctx.setLayer(slot, { onAir: true });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'STOP':
      ctx.setLayer(slot, { onAir: false });
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'INVOKE':
    case 'NEXT':
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'REMOVE': {
      ctx.setLayer(slot, { producer: 'empty', filePath: '', paused: false, onAir: false });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    default:
      return { kind: 'err', code: 400, verb: 'CG' };
  }
}

/**
 * Resolve a `CG ADD` template argument the way real CasparCG must be able to: a
 * bare id / non-URL is unresolvable here (→ 404); an `http(s)://` URL is fetched
 * and resolves only when it returns a page.
 */
async function resolveTemplateRef(ref: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(ref)) return false;
  return httpGetOk(ref, 2000);
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
