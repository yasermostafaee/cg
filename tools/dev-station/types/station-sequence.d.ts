/** `DEV-STATION-01` — the typed surface of `../src/station-sequence.mjs`. Update both together. */
declare module '*station-sequence.mjs' {
  export interface Seen {
    readonly installed: readonly { readonly name: string; readonly pid: number }[];
    readonly blocked: readonly {
      readonly proto: 'tcp' | 'udp';
      readonly port: number;
      readonly pid: number;
      readonly name: string;
    }[];
  }
  export interface FakePlayout {
    readonly address: string;
    readonly username: string;
    readonly password: string;
    /** `DELTA-MULTI-CHANNEL-01-A` A1 — CasparCG's stand-in, `host:port`, when the station has one. */
    readonly caspar?: string;
    /** The programme feeds that started, by port. */
    readonly feeds?: readonly number[];
    /** One line per part that could not start. */
    readonly notes?: readonly string[];
    stop(): Promise<void>;
  }
  export interface DevStationDeps<R = unknown> {
    probe(): Promise<Seen>;
    /** The operator's answer, or `null` when there is nobody to ask. */
    ask(question: string): Promise<string | null>;
    stop(pids: readonly number[]): Promise<void>;
    /** The build's exit code. */
    build(): Promise<number> | number;
    readPlayoutAddress(): string | null;
    /** Rejects with the bridge's own sentence when the address is refused. */
    setPlayoutAddress(address: string): Promise<void>;
    /** `--fake` only: move the last fake station aside and start from an empty one. */
    freshFakeState(): Promise<void> | void;
    startFake(): Promise<FakePlayout>;
    start(playout: string): Promise<R>;
    open(url: string): void;
    print(line: string): void;
  }
  export type Outcome =
    | { outcome: 'declined' | 'blocked' | 'build-failed' | 'no-address' | 'failed' }
    | { outcome: 'running'; running: unknown; fake: FakePlayout | undefined };

  export function runDevStation(
    options: {
      fake: boolean;
      playout: string | undefined;
      open: boolean;
      stateDir: string;
      /** The bridge's log file, named on the banner. */
      log?: string;
    },
    deps: DevStationDeps,
  ): Promise<Outcome>;
}
