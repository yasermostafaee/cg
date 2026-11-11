// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RehearsalFrame } from '../src/renderer/features/monitors/RehearsalFrame.js';
import { measureRehearsalBounds } from '../src/renderer/features/monitors/rehearsalBounds.js';

function setRect(doc: Document, selector: string, x: number, y: number, w: number, h: number) {
  vi.spyOn(doc.querySelector(selector)!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(x, y, w, h),
  );
}

describe('PVW template bounds', () => {
  it('uses the union of visual boxes inside the stage and the nested composition clip', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.className = 'cg-pending';
    doc.body.innerHTML = `
      <div class="cg-stage">
        <div class="cg-element" data-cg-element-id="shape"></div>
        <div class="cg-element" data-cg-element-id="container" data-cg-composition-id="nested">
          <div class="cg-element" data-cg-element-id="nested-shape"></div>
        </div>
        <div class="cg-element" data-cg-element-id="hidden" style="display:none"></div>
        <audio data-cg-element-id="sound"></audio>
      </div>`;
    setRect(doc, '.cg-stage', 10, 20, 300, 200);
    setRect(doc, '[data-cg-element-id="shape"]', 0, 130, 50, 100);
    setRect(doc, '[data-cg-composition-id]', 30, 40, 230, 130);
    setRect(doc, '[data-cg-element-id="nested-shape"]', 80, 100, 200, 50);
    setRect(doc, 'audio', 10, 20, 300, 200);

    expect(measureRehearsalBounds(doc)).toEqual({
      stage: { x: 10, y: 20, width: 300, height: 200 },
      content: { x: 10, y: 100, width: 250, height: 120 },
    });
  });

  it('leaves fallback placement to the frame when no visual can be measured', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<div class="cg-stage"><audio data-cg-element-id="sound"></audio></div>';
    setRect(doc, '.cg-stage', 10, 20, 300, 200);
    expect(measureRehearsalBounds(doc)).toEqual({
      stage: { x: 10, y: 20, width: 300, height: 200 },
      content: null,
    });
    doc.body.replaceChildren();
    expect(measureRehearsalBounds(doc)).toBeNull();
  });

  it('outlines a stage-less page and remeasures visuals after changed field values', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onBoundsChange = vi.fn();
    const footprint = { x: 0, y: 0, width: 1920, height: 1080 };
    const render = (headline: string) =>
      act(async () => {
        root.render(
          createElement(RehearsalFrame, {
            itemId: 'row',
            html: '<!doctype html><html><body></body></html>',
            raster: footprint,
            fit: 0.5,
            zIndex: 1,
            fields: { headline },
            position: undefined,
            rowName: 'Row',
            activeLookId: undefined,
            timing: undefined,
            livePlates: [],
            sourceFrames: new Map(),
            onBoundsChange,
          }),
        );
      });

    try {
      await render('Before');
      const frame = container.querySelector('iframe')!;
      const doc = frame.contentDocument!;
      await act(async () => {
        frame.dispatchEvent(new Event('load'));
      });
      expect(onBoundsChange).toHaveBeenLastCalledWith('row', {
        stage: footprint,
        content: footprint,
        canPosition: false,
      });

      doc.body.innerHTML = `<div class="cg-stage">
        <div class="cg-element" data-cg-element-id="title"></div>
      </div>`;
      setRect(doc, '.cg-stage', 0, 0, 1920, 1080);
      const update = vi.fn((value: string) => {
        const { headline } = JSON.parse(value) as { headline: string };
        setRect(doc, '[data-cg-element-id="title"]', 30, 45, headline.length * 10, 20);
      });
      Object.assign(frame.contentWindow!, { update });
      await render('Longer title');
      expect(onBoundsChange).toHaveBeenLastCalledWith('row', {
        stage: footprint,
        content: { x: 30, y: 45, width: 120, height: 20 },
        canPosition: false,
      });
      const changes = onBoundsChange.mock.calls.length;
      await render('Longer title');
      expect(update).toHaveBeenCalledTimes(1);
      expect(onBoundsChange).toHaveBeenCalledTimes(changes);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
