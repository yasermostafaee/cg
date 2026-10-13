/** `DEV-STATION-01` — the typed surface of `../src/station-sequence.mjs`. Update both together. */
declare module '*station-sequence.mjs' {
  /** Every program on a station port — named, never stopped. */
  export interface Seen {
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
    /** `DEV-LOCAL-CASPAR-01` — what the start read from this machine's own CasparCG (`--caspar`). */
    readonly local?: {
      readonly version: string;
      readonly channels: readonly { readonly channel: number; readonly format: string }[];
      readonly mediaFolder: string | null;
      readonly clips: number;
      readonly stills: number;
    };
    /** One line per part that could not start. */
    readonly notes?: readonly string[];
    /** `RELEASE-0112-01` (`R-085`) — `--pair`: the backup engine, and its CasparCG `host:port`. */
    readonly backup?: FakeBackupEngine;
    stop(): Promise<void>;
  }
  export interface FakeBackupEngine {
    readonly address: string;
    readonly username: string;
    readonly password: string;
    readonly caspar: string;
  }
  /**
   * 🔴 `CENTRAL-BRIDGE-01` — there is no `stop`: the sequence is given no way to end a process, so a
   * CG Bridge service on the station's ports is named and refused, and never stopped.
   */
  export interface DevStationDeps<R = unknown> {
    probe(): Promise<Seen>;
    /** The Playout address typed at the prompt, or `null` when there is nobody to ask. */
    ask(question: string): Promise<string | null>;
    /** The build's exit code. */
    build(): Promise<number> | number;
    readPlayoutAddress(): string | null;
    /** Rejects with the bridge's own sentence when the address is refused. */
    setPlayoutAddress(address: string): Promise<void>;
    /** `--fake` only: move the last fake station aside and start from an empty one. */
    freshFakeState(): Promise<void> | void;
    startFake(): Promise<FakePlayout>;
    /** `RELEASE-0112-01` — the fake too (`undefined` without `--fake`), so `--pair` declares server B. */
    start(playout: string, fake?: FakePlayout): Promise<R>;
    open(url: string): void;
    print(line: string): void;
  }
  export type Outcome =
    | { outcome: 'blocked' | 'build-failed' | 'no-address' | 'failed' }
    | { outcome: 'running'; running: unknown; fake: FakePlayout | undefined };

  export function runDevStation(
    options: {
      fake: boolean;
      /** `RELEASE-0112-01` — `--fake --pair`: two engines. */
      pair?: boolean;
      playout: string | undefined;
      open: boolean;
      stateDir: string;
      /** The bridge's log file, named on the banner. */
      log?: string;
    },
    deps: DevStationDeps,
  ): Promise<Outcome>;
}
