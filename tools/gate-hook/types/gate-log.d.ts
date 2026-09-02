/**
 * P-040 — the typed surface of `../src/gate-log.mjs` (plain ESM, no build step). Same
 * convention as `gate-lock.d.ts` (P-013) and `test-concurrency.d.ts` (B-098): the tests
 * import the .mjs by relative path while `tsc` checks every call against this contract;
 * if the module's API drifts, update BOTH files in the same change.
 */
declare module '*gate-log.mjs' {
  export const GATE_LOG_DIR: string;
  export const GATE_LOG_KEEP: number;

  export interface GateLogFs {
    mkdirSync: (dir: string, opts: { recursive: boolean }) => unknown;
    appendFileSync: (file: string, data: string | Uint8Array) => void;
    readdirSync: (dir: string) => string[];
    unlinkSync: (file: string) => void;
  }

  export interface GateLogHandle {
    path: string;
    write: (chunk: string | Uint8Array) => void;
    close: (result: { code: number | null; signal: string | null; endedAt: Date }) => void;
  }

  export function gateLogStamp(at: Date): string;
  export function gateLogFileName(startedAt: Date, pid: number): string;
  export function gateLogPath(root: string, startedAt: Date, pid: number): string;
  export function gateLogHeader(args: { command: string; cwd: string; startedAt: Date }): string;
  export function gateLogFooter(args: {
    code: number | null;
    signal: string | null;
    startedAt: Date;
    endedAt: Date;
  }): string;
  export function logsToPrune(names: readonly string[], keep?: number): string[];
  export function openGateLog(args: {
    root: string;
    command: string;
    cwd: string;
    startedAt: Date;
    pid: number;
    fs: GateLogFs;
    warn?: (message: string) => void;
    keep?: number;
  }): GateLogHandle;
}
