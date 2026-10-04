/**
 * `DEV-STATION-01` — the typed surface of `../src/station-plan.mjs` (plain zero-dep ESM, no build).
 * The wildcard specifier lets the tests import the .mjs by relative path while `tsc` checks every
 * call against this contract; if the module's API drifts, update BOTH files in the same change.
 */
declare module '*station-plan.mjs' {
  export type Proto = 'tcp' | 'udp';
  export interface StationPort {
    readonly proto: Proto;
    readonly port: number;
  }
  export interface ProcessRow {
    readonly name: string;
    readonly pid: number;
  }
  export interface Listener {
    readonly proto: Proto;
    readonly port: number;
    readonly pid: number;
  }
  export interface Blocked extends StationPort {
    readonly pid: number;
    readonly name: string;
  }
  export interface StationPaths {
    readonly stateDir: string;
    readonly connection: string;
    readonly fixedLayers: string;
    readonly reservedLayers: string;
    readonly templates: string;
    readonly sourceCatalog: string;
    readonly sourceAssignments: string;
    readonly playoutInputs: string;
    readonly boundMedia: string;
    readonly liveLayers: string;
    readonly stack: string;
    readonly bridgeSession: string;
    readonly audit: string;
    readonly playoutConfig: string;
    readonly consoleDir: string;
    readonly bridgeLog: string;
    readonly amcpLog: string;
  }
  export interface FakeModulePaths {
    readonly playout: string;
    readonly pgmFeed: string;
    readonly station: string;
    /** `DEV-LOCAL-CASPAR-01` — the composition `--fake --caspar` runs. */
    readonly localCaspar: string;
    readonly caspar: string;
  }
  /** `DEV-LOCAL-CASPAR-01` — what the start read from this machine's own CasparCG. */
  export interface LocalCasparBanner {
    readonly version: string;
    readonly channels: readonly { readonly channel: number; readonly format: string }[];
    readonly mediaFolder: string | null;
    readonly clips: number;
    readonly stills: number;
  }
  export interface StationPortOverrides {
    readonly bridge?: number;
    readonly templates?: number;
    readonly bridgeConsole?: number;
    readonly console?: number;
  }

  export const CONSOLE_HOST: '127.0.0.1';
  export const CONSOLE_PORT: 5174;
  export const CONSOLE_URL: string;
  export const BRIDGE_PORT: 5280;
  export const TEMPLATE_PORT: 7911;
  export const OSC_PORT: 6251;
  export const BRIDGE_CONSOLE_PORT: 5175;
  export const STATION_PORTS: readonly StationPort[];
  /** `RELEASE-0112-01` — `--pair`'s server B: the bridge's OSC port for it, and its stand-in's AMCP. */
  export const BACKUP_OSC_PORT: 6252;
  export const BACKUP_AMCP_PORT: 5251;
  /** The ports this run binds — with `--pair`, server B's OSC port too. */
  export function stationPorts(options: { readonly pair?: boolean }): readonly StationPort[];
  /** `RELEASE-0112-01` (`R-085`) — `--pair`'s backup engine, as the bridge is told it. */
  export interface BackupEngineArgs {
    readonly address: string;
    /** Its CasparCG stand-in, `host:port`. */
    readonly caspar: string;
  }

  /** CG Control's own folder — `%APPDATA%\CG Control` on Windows. */
  export function installedStateDir(
    env: Record<string, string | undefined>,
    platform: string,
    home: string,
  ): string;
  /** `CENTRAL-BRIDGE-01` — CG Bridge's own folder, `%ProgramData%\CG Bridge`; `null` off Windows. */
  export function bridgeStateDir(
    env: Record<string, string | undefined>,
    platform: string,
  ): string | null;
  export function devStateDir(
    env: Record<string, string | undefined>,
    platform: string,
    home: string,
  ): string;
  export function isInside(child: string, parent: string, platform: string): boolean;
  /** The launcher's refusal when the dev state overlaps CG Control's or CG Bridge's folder, or `null`. */
  export function stateOverlap(
    root: string,
    env: Record<string, string | undefined>,
    platform: string,
    home: string,
  ): string | null;
  export function stationPaths(stateDir: string, platform: string): StationPaths;
  export function fakeModulePaths(repo: string): FakeModulePaths;
  /** `DEV-LOCAL-CASPAR-01` — `fake`, or `fake-local` with `--caspar`; `fake-pair` with `--pair`. */
  export function fakeStateName(options: {
    readonly caspar: string | undefined;
    readonly pair?: boolean;
  }): string;
  export function previousStateDir(stateDir: string): string;
  export function bridgeArgs(
    paths: StationPaths,
    playoutAddress: string,
    ports?: StationPortOverrides,
    backup?: BackupEngineArgs,
  ): string[];
  export function setAddressArgs(paths: StationPaths, address: string): string[];
  export function viteArgs(ports?: StationPortOverrides): string[];
  /** `FIELD-FIXES-01` H — the console server's environment: no HOST or PORT; the relay and the one host. */
  export function viteEnv(
    env: Readonly<Record<string, string | undefined>>,
    bridgeConsole: string,
  ): Record<string, string | undefined>;
  export function buildArgs(): string[];
  export function parseTasklist(text: string): ProcessRow[];
  export function parseNetstat(text: string): Listener[];
  /** Every program on a station port, named — never stopped. */
  export function assess(
    processes: readonly ProcessRow[],
    listeners: readonly Listener[],
    ports?: readonly StationPort[],
  ): { blocked: Blocked[] };
  export function blockedLine(b: Blocked): string;
  export function banner(input: {
    stateDir: string;
    playout: string;
    fake?:
      | {
          username: string;
          password: string;
          caspar?: string;
          feeds?: readonly number[];
          /** `DEV-LOCAL-CASPAR-01` — present when `caspar` is this machine's own CasparCG. */
          local?: LocalCasparBanner;
          notes?: readonly string[];
          /** `RELEASE-0112-01` — `--pair`'s backup engine. */
          backup?: BackupEngineArgs & { username: string; password: string };
        }
      | undefined;
    log?: string | undefined;
  }): string[];
  export function parseArgs(argv: readonly string[]):
    | {
        playout: string | undefined;
        fake: boolean;
        /** `RELEASE-0112-01` (`R-085`) — `--fake --pair`: two fake engines. */
        pair: boolean;
        open: boolean;
        caspar: string | undefined;
        /** `CENTRAL-BRIDGE-01` — the fake Playout alone, for an installed CG Bridge. */
        playoutOnly: boolean;
        playoutPort: number | undefined;
      }
    | { error: string };
  /** `CENTRAL-BRIDGE-01` — where `--playout-only` listens unless told: CG Bridge's default Playout. */
  export const PLAYOUT_ONLY_PORT: number;
  export function playoutOnlyLines(fake: {
    address: string;
    username: string;
    password: string;
    caspar: string;
    local: LocalCasparBanner;
  }): string[];
}
