// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  useProgramMonitorPreferences,
  type ProgramMonitorPreferences,
} from '../src/renderer/features/monitors/useProgramMonitorPreferences.js';
import { installMemoryStorage } from './support/localStorage.js';

it.each([false, true])(
  'shares atomic monitor changes between Settings and the mounted monitor (storage denied: %s)',
  async (denied) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const storage = installMemoryStorage();
    const key = 'cg.runtime.pgm-monitor.v1';
    storage.setItem(
      key,
      JSON.stringify({
        display: 'both',
        audio: 'B',
        meterMode: 'all',
        layout: 'vertical',
        showMeter: false,
      }),
    );
    if (denied)
      vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new Error('Storage is unavailable');
      });
    const host = document.createElement('div');
    const root = createRoot(host);
    let settings: ProgramMonitorPreferences | undefined;
    let monitor: ProgramMonitorPreferences | undefined;
    function Settings(): null {
      const preferences = useProgramMonitorPreferences(null);
      useEffect(() => {
        settings = preferences;
      }, [preferences]);
      return null;
    }
    function Monitor(): null {
      const preferences = useProgramMonitorPreferences('B');
      useEffect(() => {
        monitor = preferences;
      }, [preferences]);
      return null;
    }
    try {
      await act(async () =>
        root.render(createElement(Fragment, null, createElement(Settings), createElement(Monitor))),
      );
      expect(monitor).toMatchObject({
        display: 'both',
        audio: 'B',
        meterMode: 'all',
        layout: 'vertical',
        showMeter: false,
      });
      await act(async () => {
        settings?.setDisplay('A');
        settings?.setAudio('A');
        settings?.setMeterMode('selected');
      });
      const expected = {
        display: 'A',
        audio: 'A',
        audioEngine: 'A',
        meterMode: 'selected',
        layout: 'vertical',
        showMeter: false,
      };
      expect(settings).toMatchObject(expected);
      expect(monitor).toMatchObject(expected);
      if (!denied) {
        const { audioEngine: _audioEngine, ...persisted } = expected;
        expect(JSON.parse(storage.getItem(key) ?? '{}')).toMatchObject(persisted);
      }
    } finally {
      await act(async () => root.unmount());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);
