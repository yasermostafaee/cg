import { expect, it } from 'vitest';
import { SPLASH_PHASES } from '../src/renderer/splashTiming.js';

it('names the three real startup steps', () => {
  expect([...SPLASH_PHASES]).toEqual(['INITIALIZING', 'OPENING STORAGE', 'STARTING INTERFACE']);
});
