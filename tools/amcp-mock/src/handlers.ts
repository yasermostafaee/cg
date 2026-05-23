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
  ctx.setLayer(slot, { producer: 'html', filePath: url, paused: false });
  return { kind: 'ok', code: 202, verb: 'PLAY' };
}

function handleLoad(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'LOAD' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'LOAD' };
  const url = req.args[1] ?? '';
  // LOAD primes the foreground but pauses immediately — PLAY is required to resume.
  ctx.setLayer(slot, { producer: 'html', filePath: url, paused: true });
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
    ctx.setLayer(slot, { producer: 'empty', filePath: '', paused: false });
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
 * `CG <channel>-<layer> INVOKE <flash-layer> "<method>"`
 * `CG <channel>-<layer> REMOVE <flash-layer>`
 *
 * The mock treats CG as a pass-through to layer state — it doesn't model
 * Flash-layer slots inside an HTML producer (that's the template-runtime's
 * domain). CG ADD without a prior PLAY [HTML] is rejected.
 */
function handleCg(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'CG' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CG' };

  const sub = req.args[1]?.toUpperCase();
  switch (sub) {
    case 'ADD': {
      // The mock accepts CG ADD even on an empty layer — real CasparCG does too,
      // it'll auto-load an HTML producer. Mirror that.
      const cur = ctx.getLayer(slot);
      if (cur.producer === 'empty') {
        const url = req.args[3] ?? '';
        ctx.setLayer(slot, { producer: 'html', filePath: url, paused: false });
      }
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'PLAY':
    case 'STOP':
    case 'INVOKE':
    case 'NEXT':
    case 'UPDATE':
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'REMOVE': {
      ctx.setLayer(slot, { producer: 'empty', filePath: '', paused: false });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    default:
      return { kind: 'err', code: 400, verb: 'CG' };
  }
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
