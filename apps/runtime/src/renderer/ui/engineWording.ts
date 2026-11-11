import { createContext, useContext } from 'react';
import type { AuthCapabilities } from '../../shared/runtime-bridge.js';

export const PLAYOUT_ENGINE_NAME = 'APASAI Playout Engine';

export const EngineNameContext = createContext('CasparCG');

export function useEngineName(): string {
  return useContext(EngineNameContext);
}

export function engineNameForMode(mode: AuthCapabilities['mode'] | undefined): string {
  return mode === 'playout' ? PLAYOUT_ENGINE_NAME : 'CasparCG';
}

/** Translate legacy Bridge diagnostics to the operator's engine terminology. */
export function playoutEngineWording(text: string, engine = PLAYOUT_ENGINE_NAME): string {
  if (engine === 'CasparCG') return text;
  return text
    .replace(/(?<![./\\])\bcasparcg\.config\b/gi, 'the engine configuration')
    .replace(/(?<![./\\])\bcasparcg\.exe\b/gi, engine)
    .replace(/(?<![./\\])\bCasparCG\b(?![\\/]|\.\w)/gi, engine);
}
