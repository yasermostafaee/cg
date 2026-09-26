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
    readonly liveLayers: string;
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
    readonly caspar: string;
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
  export const OSC_PORT: 6250;
  export const BRIDGE_CONSOLE_PORT: 5175;
  export const STATION_PORTS: readonly StationPort[];
  export const INSTALLED_IMAGES: readonly string[];
  export const ASK: string;
  export const DECLINED: string;

  export function installedStateDir(
    env: Record<string, string | undefined>,
    platform: string,
    home: string,
  ): string;
  export function devStateDir(
    env: Record<string, string | undefined>,
    platform: string,
    home: string,
  ): string;
  export function isInside(child: string, parent: string, platform: string): boolean;
  export function stationPaths(stateDir: string, platform: string): StationPaths;
  export function fakeModulePaths(repo: string): FakeModulePaths;
  export function previousStateDir(stateDir: string): string;
  export function bridgeArgs(
    paths: StationPaths,
    playoutAddress: string,
    ports?: StationPortOverrides,
  ): string[];
  export function setAddressArgs(paths: StationPaths, address: string): string[];
  export function viteArgs(ports?: StationPortOverrides): string[];
  /** `FIELD-FIXES-01` H — the console server's environment: no HOST or PORT; the relay and the one host. */
  export function viteEnv(
    env: Readonly<Record<string, string | undefined>>,
    bridgeConsole: string,
  ): Record<string, string | undefined>;
  export function buildArgs(): string[];
  export function answerIsYes(answer: string | null | undefined): boolean;
  export function parseTasklist(text: string): ProcessRow[];
  export function parseNetstat(text: string): Listener[];
  export function assess(
    processes: readonly ProcessRow[],
    listeners: readonly Listener[],
    ports?: readonly StationPort[],
  ): { installed: ProcessRow[]; blocked: Blocked[] };
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
          notes?: readonly string[];
        }
      | undefined;
    log?: string | undefined;
  }): string[];
  export function parseArgs(
    argv: readonly string[],
  ): { playout: string | undefined; fake: boolean; open: boolean } | { error: string };
}
