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
      return {
        kind: 'osc.layer.foreground.producer',
        channel,
        layer,
        producer: oscProducerKind(producer),
      };
    }
    if (tail === 'foreground/file/path') {
      const path = stringArg(msg.args[0]);
      if (path === null) return null;
      /*
        🔴 `PLAYOUT-SOURCES-01` §1.E — contract v1.3 §3.3: the core sends every AMCP client the
        full state, input ADDRESSES WITH CREDENTIALS included. So the path is DROPPED here, at the
        one door every OSC value passes, and only the fact that a file event arrived survives.
        Nothing downstream read the value (the reconciler reads the producer, never the file).
      */
      return { kind: 'osc.layer.foreground.file', channel, layer, path: '' };
    }
    if (tail === 'foreground/paused') {
      const paused = booleanArg(msg.args[0]);
      if (paused === null) return null;
      return { kind: 'osc.layer.foreground.paused', channel, layer, paused };
    }
    if (tail === 'background/producer') {
      const producer = stringArg(msg.args[0]);
      if (producer === null) return null;
      return {
        kind: 'osc.layer.background.producer',
        channel,
        layer,
        producer: oscProducerKind(producer),
      };
    }
  }

  return null;
}

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.E — **AN OSC PRODUCER VALUE AS ITS KIND, never where it reads from.**
 * CasparCG reports kind names (`html`, `ffmpeg`, `route`, `empty` — measured), and every place that
 * shows one needs only that: "a producer is there, and what sort". Anything carrying a scheme, a
 * path, whitespace or an `@` is reduced to its leading word, so a URL with credentials can never be
 * logged, published or shown from here.
 */
export function oscProducerKind(value: string): string {
  const trimmed = value.trim();
  if (!/[:/\\\s@"'[\]]/.test(trimmed)) return trimmed;
  return /^[A-Za-z][A-Za-z0-9_-]*/.exec(trimmed)?.[0] ?? 'producer';
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
