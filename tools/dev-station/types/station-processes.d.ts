/** `DEV-STATION-01` — the typed surface of `../src/station-processes.mjs`. Update both together. */
declare module '*station-processes.mjs' {
  export function probeStation(
    platform?: string,
    ports?: readonly { proto: 'tcp' | 'udp'; port: number }[],
  ): Promise<{
    installed: { name: string; pid: number }[];
    blocked: { proto: 'tcp' | 'udp'; port: number; pid: number; name: string }[];
  }>;
  export function writeConsoleStub(consoleDir: string): void;
  export function isAlive(pid: number): boolean;
  export function stopProcesses(
    pids: readonly number[],
    options?: { platform?: string; graceMs?: number },
  ): Promise<void>;
}
