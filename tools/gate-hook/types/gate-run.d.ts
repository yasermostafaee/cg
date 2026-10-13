/**
 * P-045 — the typed surface of `../src/gate-run.mjs` (plain ESM, no build step). Same
 * convention as `gate-log.d.ts` (P-040): the tests import the .mjs by relative path while
 * `tsc` checks every call against this contract; if the module's API drifts, update BOTH
 * files in the same change.
 */
declare module '*gate-run.mjs' {
  export const TAIL_READ_BYTES: number;
  export const FALLBACK_MAX_BUFFER: number;

  export function readTailFromFd(fd: number, from: number, maxBytes?: number): string;

  export interface GateRunResult {
    status: number | null;
    signal: NodeJS.Signals | null;
    /** The end of THIS command's output, bounded by `tailBytes`. */
    tail: string;
    /** False only when the log could not be opened and the piped fallback ran. */
    streamed: boolean;
    /** How much this command wrote to the log (0 under the fallback). */
    bytes: number;
  }

  export function runGateCommand(args: {
    command: string;
    cwd: string;
    logFile: string;
    env?: NodeJS.ProcessEnv;
    tailBytes?: number;
  }): GateRunResult;
}
