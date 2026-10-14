import type { AudioHandle } from './audio-driver.js';
import type { Silenceable } from './look-media.js';

/**
 * 🔴 `D-165` — **THE PAGE'S SOUND: how a sound effect sounds, never when it starts.**
 *
 * One `AudioContext` per document, lazily — a page with no sound never makes one. Each sound runs
 * `<audio>` → its own GAIN (the element's `volumeDb` and its fades) → its PARK gain (silenced while
 * its look is hidden, `look-media.ts`) → the page's MASTER gain → the output. Web Audio, because a
 * media element's `volume` stops at 1.0 and the element's range runs to +6 dB.
 *
 * ⭐ **The master gain is the HOST's mute, and the page's own copy of the runtime owns it.**
 * CG Control's PVW renders the byte-identical page CasparCG plays and must stay SILENT by default;
 * the Designer's preview plays the sound with a mute toggle. Both call {@link setSoundMuted} on the
 * page's own runtime (`CG.setSoundMuted`) — the same seam PVW already uses for placement — so no
 * preview-only variant of the page exists to drift from air.
 *
 * A host without Web Audio (jsdom) gets the media element's own `volume` (capped at 1) and `muted`,
 * and no fades: the timing, which is the driver's, is unchanged.
 */

interface PageSound {
  muted: boolean;
  ctx: AudioContext | null | undefined;
  master: GainNode | null;
  /** Fallback members (no Web Audio): each element's own `muted` reflects page AND park mute. */
  readonly fallbacks: Set<{ refresh(): void }>;
}

const pages = new WeakMap<Document, PageSound>();

function pageOf(doc: Document): PageSound {
  let page = pages.get(doc);
  if (page === undefined) {
    page = { muted: false, ctx: undefined, master: null, fallbacks: new Set() };
    pages.set(doc, page);
  }
  return page;
}

type AudioContextCtor = new () => AudioContext;

/** The page's context, created on first use; null where the host has no Web Audio. */
function contextOf(doc: Document): { ctx: AudioContext; master: GainNode } | null {
  const page = pageOf(doc);
  if (page.ctx === undefined) {
    const win = doc.defaultView as (Window & { webkitAudioContext?: AudioContextCtor }) | null;
    const Ctor: AudioContextCtor | undefined =
      (win as { AudioContext?: AudioContextCtor } | null)?.AudioContext ?? win?.webkitAudioContext;
    if (Ctor === undefined) {
      page.ctx = null;
    } else {
      try {
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = page.muted ? 0 : 1;
        master.connect(ctx.destination);
        page.ctx = ctx;
        page.master = master;
      } catch {
        page.ctx = null;
      }
    }
  }
  return page.ctx !== null && page.ctx !== undefined && page.master !== null
    ? { ctx: page.ctx, master: page.master }
    : null;
}

/**
 * Mute or unmute every sound this page makes — the host's switch (PVW silent, the Designer's
 * toggle). Takes effect at once, on sounds already playing too.
 */
export function setSoundMuted(muted: boolean, doc: Document = document): void {
  const page = pageOf(doc);
  page.muted = muted;
  if (page.master !== null) page.master.gain.value = muted ? 0 : 1;
  for (const f of page.fallbacks) f.refresh();
}

/** Whether this page's sound is muted by its host. */
export function isSoundMuted(doc: Document = document): boolean {
  return pageOf(doc).muted;
}

export interface AudioShape {
  /** Linear gain (the element's `volumeDb`, converted). */
  readonly gain: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly durationMs: number;
}

/**
 * The gain envelope at `posSec` into a sound: its level times the fade-in and fade-out ramps.
 * Pure — the one place the shape of a fade is written, tested on its own.
 */
export function envelopeAt(shape: AudioShape, posSec: number): number {
  const dur = shape.durationMs / 1000;
  const fi = shape.fadeInMs / 1000;
  const fo = shape.fadeOutMs / 1000;
  const rise = fi > 0 ? Math.min(1, Math.max(0, posSec / fi)) : 1;
  const fall = fo > 0 ? Math.min(1, Math.max(0, (dur - posSec) / fo)) : 1;
  return shape.gain * Math.min(rise, fall);
}

/**
 * ONE sound's handle for its `AudioDriver`, plus the `Silenceable` the look park mutes. The
 * Web Audio graph is built on the first `play()`, so building a scene costs nothing.
 */
export function createAudioHandle(
  node: HTMLAudioElement,
  shape: AudioShape,
  onPlayRejected?: (reason: unknown) => void,
): { handle: AudioHandle; silence: Silenceable } {
  const doc = node.ownerDocument;
  let parkMuted = false;
  let graph: { ctx: AudioContext; gain: GainNode; park: GainNode } | null | undefined;
  let fallback: { refresh(): void } | null = null;

  const build = (): void => {
    if (graph !== undefined) return;
    const page = contextOf(doc);
    if (page === null) {
      graph = null;
      // No Web Audio: the element's own volume (≤ 1) and muted carry the page and park mutes.
      node.volume = Math.min(1, Math.max(0, shape.gain));
      fallback = {
        refresh: () => {
          node.muted = parkMuted || pageOf(doc).muted;
        },
      };
      pageOf(doc).fallbacks.add(fallback);
      fallback.refresh();
      return;
    }
    try {
      const source = page.ctx.createMediaElementSource(node);
      const gain = page.ctx.createGain();
      const park = page.ctx.createGain();
      park.gain.value = parkMuted ? 0 : 1;
      source.connect(gain);
      gain.connect(park);
      park.connect(page.master);
      graph = { ctx: page.ctx, gain, park };
    } catch {
      graph = null;
    }
  };

  /** Schedule the envelope from the media position `posSec`, on the context's clock. */
  const schedule = (posSec: number): void => {
    if (graph === null || graph === undefined) return;
    const { ctx, gain } = graph;
    const t = ctx.currentTime;
    const dur = shape.durationMs / 1000;
    const p = gain.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(envelopeAt(shape, posSec), t);
    const fiEnd = shape.fadeInMs / 1000;
    if (posSec < fiEnd) p.linearRampToValueAtTime(envelopeAt(shape, fiEnd), t + (fiEnd - posSec));
    if (shape.fadeOutMs > 0) {
      const foStart = Math.max(posSec, dur - shape.fadeOutMs / 1000);
      if (foStart > posSec) p.setValueAtTime(envelopeAt(shape, foStart), t + (foStart - posSec));
      p.linearRampToValueAtTime(0, t + Math.max(0, dur - posSec));
    }
  };

  const startMedia = (): void => {
    if (graph !== null && graph !== undefined && graph.ctx.state === 'suspended') {
      void graph.ctx.resume().catch(() => undefined);
    }
    try {
      const p = node.play();
      if (p !== undefined && typeof p.catch === 'function') {
        void p.catch((reason: unknown) => onPlayRejected?.(reason));
      }
    } catch (reason) {
      onPlayRejected?.(reason);
    }
  };

  const handle: AudioHandle = {
    play: () => {
      build();
      try {
        node.currentTime = 0;
      } catch {
        /* not loaded yet — it starts from 0 anyway */
      }
      schedule(0);
      startMedia();
    },
    pause: () => {
      node.pause();
      if (graph !== null && graph !== undefined) {
        const p = graph.gain.gain;
        const t = graph.ctx.currentTime;
        p.cancelScheduledValues(t);
        p.setValueAtTime(envelopeAt(shape, node.currentTime), t);
      }
    },
    resume: () => {
      schedule(node.currentTime);
      startMedia();
    },
    halt: () => {
      node.pause();
      try {
        node.currentTime = 0;
      } catch {
        /* nothing loaded */
      }
      if (graph !== null && graph !== undefined) {
        const t = graph.ctx.currentTime;
        graph.gain.gain.cancelScheduledValues(t);
        graph.gain.gain.setValueAtTime(0, t);
      }
    },
    playing: () => !node.paused && !node.ended,
  };

  const silence: Silenceable = {
    get muted(): boolean {
      return parkMuted;
    },
    set muted(value: boolean) {
      parkMuted = value;
      if (graph !== null && graph !== undefined) graph.park.gain.value = value ? 0 : 1;
      fallback?.refresh();
    },
  };

  return { handle, silence };
}
