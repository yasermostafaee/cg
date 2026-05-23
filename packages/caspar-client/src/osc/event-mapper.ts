import type { OscEvent } from '@cg/shared-schema';
import type { OscMessage } from './parser.js';

/**
 * Translate a raw OSC message into a typed `OscEvent` per ADR 0004.
 *
 * Returns null when the address isn't one we care about — the caller drops
 * it (and increments the out-of-interest counter).
 *
 * The mapper is deliberately strict about arg shape: malformed messages
 * are returned as null rather than partial events. CasparCG's emission
 * is consistent in observed traces, so anything off-shape is suspicious.
 */
export function messageToEvent(msg: OscMessage): OscEvent | null {
  if (msg.malformed !== undefined) return null;

  // /channel/N/framerate  i:num  i:den
  const fr = /^\/channel\/(\d+)\/framerate$/.exec(msg.address);
  if (fr !== null) {
    const channel = Number(fr[1]);
    const num = numericArg(msg.args[0]);
    const den = numericArg(msg.args[1]);
    if (num === null || den === null || num <= 0 || den <= 0) return null;
    return { kind: 'osc.framerate', channel, num, den };
  }

  const layerMatch = /^\/channel\/(\d+)\/stage\/layer\/(\d+)\/(.+)$/.exec(msg.address);
  if (layerMatch !== null) {
    const channel = Number(layerMatch[1]);
    const layer = Number(layerMatch[2]);
    const tail = layerMatch[3] ?? '';

    if (tail === 'foreground/producer') {
      const producer = stringArg(msg.args[0]);
      if (producer === null) return null;
      return { kind: 'osc.layer.foreground.producer', channel, layer, producer };
    }
    if (tail === 'foreground/file/path') {
      const path = stringArg(msg.args[0]);
      if (path === null) return null;
      return { kind: 'osc.layer.foreground.file', channel, layer, path };
    }
    if (tail === 'foreground/paused') {
      const paused = booleanArg(msg.args[0]);
      if (paused === null) return null;
      return { kind: 'osc.layer.foreground.paused', channel, layer, paused };
    }
    if (tail === 'background/producer') {
      const producer = stringArg(msg.args[0]);
      if (producer === null) return null;
      return { kind: 'osc.layer.background.producer', channel, layer, producer };
    }
  }

  return null;
}

function numericArg(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function stringArg(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function booleanArg(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  // CasparCG sometimes emits paused as 0/1; allow numeric truthiness.
  if (v === 0) return false;
  if (v === 1) return true;
  return null;
}
