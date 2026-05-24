import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ElementAnimation,
  EntryPreset,
  ExitPreset,
  LoopPreset,
  Scene,
  TextElement,
} from '@cg/shared-schema';
import { SceneSchema } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * Phase 8 §10 M7.4 exit criterion:
 *   "Every preset combination from Phase 3 §5 has at least one fixture
 *    template. Each unpacks via @cg/template-runtime in happy-dom and
 *    runs without errors."
 *
 * Generates one scene per (entry × loop × exit) combo — 5 × 4 × 5 = 100
 * — and exercises createRuntime + play(). The animation engine itself
 * is M3.2-β work; this gate ensures the runtime doesn't *trip* on any
 * legal preset value (e.g. an unhandled discriminant in a switch).
 *
 * Schema validation runs against every generated scene so any factory
 * drift surfaces here before it ships in an export.
 */

const ENTRY_KINDS = ['none', 'fade', 'slide', 'scale', 'blur'] as const;
const LOOP_KINDS = ['none', 'ticker', 'pulse', 'breathing'] as const;
const EXIT_KINDS = ['none', 'fade-out', 'slide-out', 'scale-down', 'blur-out'] as const;

const DEFAULT_EASING = 'power2.out' as const;
const DEFAULT_DURATION = 15;

function defaultEntry(kind: EntryPreset['kind']): EntryPreset {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'fade':
      return { kind: 'fade', duration: DEFAULT_DURATION, delay: 0, easing: DEFAULT_EASING };
    case 'slide':
      return {
        kind: 'slide',
        duration: DEFAULT_DURATION,
        delay: 0,
        easing: DEFAULT_EASING,
        direction: 'left',
        distance: 300,
      };
    case 'scale':
      return {
        kind: 'scale',
        duration: DEFAULT_DURATION,
        delay: 0,
        easing: DEFAULT_EASING,
        from: 0.6,
      };
    case 'blur':
      return {
        kind: 'blur',
        duration: DEFAULT_DURATION,
        delay: 0,
        easing: DEFAULT_EASING,
        from: 12,
      };
  }
}

function defaultExit(kind: ExitPreset['kind']): ExitPreset {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'fade-out':
      return { kind: 'fade-out', duration: DEFAULT_DURATION, delay: 0, easing: DEFAULT_EASING };
    case 'slide-out':
      return {
        kind: 'slide-out',
        duration: DEFAULT_DURATION,
        delay: 0,
        easing: DEFAULT_EASING,
        direction: 'right',
        distance: 300,
      };
    case 'scale-down':
      return {
        kind: 'scale-down',
        duration: DEFAULT_DURATION,
        delay: 0,
        easing: DEFAULT_EASING,
        to: 0.6,
      };
    case 'blur-out':
      return {
        kind: 'blur-out',
        duration: DEFAULT_DURATION,
        delay: 0,
        easing: DEFAULT_EASING,
        to: 12,
      };
  }
}

function defaultLoop(kind: LoopPreset['kind']): LoopPreset {
  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'ticker':
      return { kind: 'ticker', speed: 120, direction: 'rtl' };
    case 'pulse':
      return { kind: 'pulse', duration: 60, minOpacity: 0.5, maxOpacity: 1 };
    case 'breathing':
      return { kind: 'breathing', duration: 90, scaleMin: 0.95, scaleMax: 1.05 };
  }
}

function buildScene(animation: ElementAnimation, id: string): Scene {
  const textEl: TextElement = {
    id: 'title',
    name: 'title',
    type: 'text',
    transform: {
      position: { x: 100, y: 800 },
      size: { w: 1200, h: 80 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    text: 'preset combo',
    font: {
      family: 'Inter',
      weight: 700,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    align: 'start',
    direction: 'auto',
    fitMode: 'fixed',
    overflow: 'clip',
    animation,
  };

  return {
    schemaVersion: 1,
    id,
    name: id,
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [textEl],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: {
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z',
    },
  };
}

describe('M7.4 — every Phase 3 §5 preset combination', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  // Pre-generate combinations so vitest reports a clear table.
  const combinations: {
    entry: EntryPreset['kind'];
    loop: LoopPreset['kind'];
    exit: ExitPreset['kind'];
  }[] = [];
  for (const entry of ENTRY_KINDS) {
    for (const loop of LOOP_KINDS) {
      for (const exit of EXIT_KINDS) {
        combinations.push({ entry, loop, exit });
      }
    }
  }

  it('covers exactly 100 (entry × loop × exit) combinations', () => {
    expect(combinations).toHaveLength(5 * 4 * 5);
  });

  it.each(combinations)(
    'plays $entry / $loop / $exit without errors',
    async ({ entry, loop, exit }) => {
      const animation: ElementAnimation = {
        entry: defaultEntry(entry),
        loop: defaultLoop(loop),
        exit: defaultExit(exit),
      };
      const scene = buildScene(animation, `combo-${entry}-${loop}-${exit}`);

      // Schema-valid → ensures each defaulter is in lockstep with shared-schema.
      expect(() => SceneSchema.parse(scene)).not.toThrow();

      const runtime = createRuntime(scene, { skipFontLoad: true });
      await runtime.play({});
      expect(document.body.classList.contains('cg-pending')).toBe(false);
      expect(document.querySelector('[data-cg-element-id="title"]')).toBeTruthy();
      runtime.remove();
    },
  );
});
