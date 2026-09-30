/** `DEV-STATION-01` — the typed surface of `../src/station-processes.mjs`. Update both together. */
declare module '*station-processes.mjs' {
  /** Every program on one of the station's ports, named — never stopped. */
  export function probeStation(
    platform?: string,
    ports?: readonly { proto: 'tcp' | 'udp'; port: number }[],
  ): Promise<{
    blocked: { proto: 'tcp' | 'udp'; port: number; pid: number; name: string }[];
  }>;
  export function writeConsoleStub(consoleDir: string): void;
}
