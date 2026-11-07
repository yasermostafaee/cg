/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { ListItemField } from '@cg/shared-schema';
import { StructuredCellValue } from '../src/renderer/features/inspector/StructuredRowsDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('structured row picture cells', () => {
  it('shows the packaged thumbnail instead of its filename', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const field: ListItemField = {
      id: 'logo',
      label: 'Team logo',
      required: false,
      type: 'image',
      accept: ['png'],
      assetOptions: [{ assetId: 'persepolis', label: 'پرسپولیس.png' }],
    };

    act(() =>
      root.render(
        createElement(StructuredCellValue, {
          field,
          value: { assetId: 'persepolis' },
          pictureUrls: { persepolis: 'data:image/png;base64,cGljdHVyZQ==' },
        }),
      ),
    );

    expect(host.querySelector<HTMLImageElement>('img')?.src).toContain('data:image/png;base64');
    expect(host.textContent).not.toContain('پرسپولیس.png');
    act(() => root.unmount());
    host.remove();
  });
});
