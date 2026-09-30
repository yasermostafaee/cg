import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { DEFAULT_OSC_PORT, RESERVED_OSC_PORT, RESERVED_OSC_PORT_REASON } from '@cg/shared-ipc';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D2) — **CG BRIDGE'S CONFIGURATION FILE**, `%ProgramData%\CG Bridge\cg-bridge.json`.
 *
 * Written by the installer from its arguments (`/PLAYOUT=`, `/AMCPHOST=`, `/AMCPPORT=`, `/OSCPORT=`,
 * `/CONTROLPORT=`, `/TEMPLATEPORT=`, `/BRIDGEADDRESS=`) and read at every start by `--service-config`.
 * It fills in the command-line flags the service did not give — every flag still wins over it — so
 * each value is checked by the one reader that already checks that flag, and the file adds no
 * second path through the bridge.
 *
 * The directory holding the file is the service's state home: its stores in `.cg-runtime\`, its logs
 * in `logs\`. A service NEVER falls back to `~/.cg-runtime` — on a developer's machine that names a
 * real plant — so a missing or unusable file is a start failure that names the file and why.
 */

const port = z.number().int().min(1).max(65535);

export const ServiceConfigSchema = z
  .object({
    /** The Playout this bridge belongs to — every console signs in there, and so does the bridge. */
    playoutAddress: z.string().min(1),
    /** The CasparCG core's AMCP host. `127.0.0.1` for the core on this machine (rule 4: IPv4, never `::1`). */
    amcpHost: z.string().min(1).optional(),
    amcpPort: port.optional(),
    /** The bridge's own OSC port (rule 7). Never `6250`: that is the Playout engine's. */
    oscPort: port.refine((p) => p !== RESERVED_OSC_PORT, RESERVED_OSC_PORT_REASON).optional(),
    /** Consoles connect here (and `/health` answers here). */
    controlPort: port.optional(),
    /** CasparCG fetches template pages here. */
    templatePort: port.optional(),
    /**
     * The address CasparCG reaches this bridge at, for template pages — only for a bridge on a
     * separate server; on the Playout machine the core fetches from `127.0.0.1`.
     */
    bridgeAddress: z.string().min(1).optional(),
  })
  .strict();

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

/** The defaults a service config leaves to the bridge (D2). */
export const SERVICE_DEFAULTS = {
  amcpHost: '127.0.0.1',
  amcpPort: 5250,
  oscPort: DEFAULT_OSC_PORT,
  controlPort: 5280,
  templatePort: 7911,
} as const;

/** A configuration file CG Bridge cannot start from — the message names the file and why. */
export class ServiceConfigError extends Error {
  override readonly name = 'ServiceConfigError';
}

export interface LoadedServiceConfig {
  readonly file: string;
  readonly config: ServiceConfig;
  /** The directory that holds the file: the service's state home. */
  readonly stateHome: string;
}

/** Read and check the file. Throws {@link ServiceConfigError} with the sentence to log. */
export function loadServiceConfig(file: string): LoadedServiceConfig {
  const absolute = path.resolve(file);
  let text: string;
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch (err) {
    const reason =
      (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'it does not exist' : describe(err);
    throw new ServiceConfigError(
      `CG Bridge cannot start: its configuration file ${absolute} cannot be read (${reason}). ` +
        'Reinstall CG Bridge, or write the file with at least {"playoutAddress": "http://<playout>:8080"}.',
    );
  }
  let raw: unknown;
  try {
    // A BOM (Notepad's UTF-8) is not the file's content.
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    throw new ServiceConfigError(
      `CG Bridge cannot start: its configuration file ${absolute} is not JSON (${describe(err)}).`,
    );
  }
  const parsed = ServiceConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue === undefined || issue.path.length === 0 ? '' : ` "${issue.path.join('.')}"`;
    throw new ServiceConfigError(
      `CG Bridge cannot start: its configuration file ${absolute} has a wrong value${where}: ` +
        `${issue?.message ?? 'invalid'}.`,
    );
  }
  return { file: absolute, config: parsed.data, stateHome: path.dirname(absolute) };
}

/**
 * The command-line flags the file stands for, as the CLI spells them — with the service's fixed
 * choices: auth always on against the Playout (D3), the control socket on the network (consoles are
 * on other machines), and the bridge's own Playout session in the state home (rule 8).
 */
export function serviceFlags(loaded: LoadedServiceConfig): Record<string, string | true> {
  const c = loaded.config;
  return {
    'state-home': loaded.stateHome,
    auth: 'playout',
    'playout-address': c.playoutAddress,
    'caspar-host': c.amcpHost ?? SERVICE_DEFAULTS.amcpHost,
    'amcp-port': String(c.amcpPort ?? SERVICE_DEFAULTS.amcpPort),
    'osc-port': String(c.oscPort ?? SERVICE_DEFAULTS.oscPort),
    host: '0.0.0.0',
    port: String(c.controlPort ?? SERVICE_DEFAULTS.controlPort),
    'template-serve-port': String(c.templatePort ?? SERVICE_DEFAULTS.templatePort),
    ...(c.bridgeAddress !== undefined ? { 'template-serve-host': c.bridgeAddress } : {}),
    'bridge-session-path': path.join(loaded.stateHome, '.cg-runtime', 'bridge-session.json'),
    // A fresh CG Bridge declares no channel until a station admin picks them from a console.
    'first-run': true,
  };
}

/**
 * `CENTRAL-BRIDGE-01` (D2) — **THE INSTALLER NEVER WRITES THE JSON ITSELF.** It runs the bridge's
 * `--write-service-config <file>` one-shot with the values it was given, so the file is checked by
 * the same schema every start reads it with (`6250` refused, a port a port) before it is written. An
 * upgrade gives only what it was asked to change: every other value already in the file is kept.
 * Written to a temp file and renamed over the old one, so a failed write leaves the old file whole.
 */
export function writeServiceConfig(file: string, updates: Partial<ServiceConfig>): ServiceConfig {
  const absolute = path.resolve(file);
  let existing: Partial<ServiceConfig> = {};
  if (fs.existsSync(absolute)) existing = loadServiceConfig(absolute).config;
  const merged: unknown = { ...existing, ...updates };
  const parsed = ServiceConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue === undefined || issue.path.length === 0 ? '' : ` "${issue.path.join('.')}"`;
    throw new ServiceConfigError(
      `CG Bridge's configuration was not written: a wrong value${where}: ${issue?.message ?? 'invalid'}.`,
    );
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const tmp = `${absolute}.${String(process.pid)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(parsed.data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, absolute);
  return parsed.data;
}

/** Fill every flag the command line did not give from the file. The command line always wins. */
export function withServiceFlags(
  args: Readonly<Record<string, string | true | undefined>>,
  loaded: LoadedServiceConfig,
): Record<string, string | true | undefined> {
  const merged: Record<string, string | true | undefined> = { ...args };
  for (const [flag, value] of Object.entries(serviceFlags(loaded))) {
    if (merged[flag] === undefined) merged[flag] = value;
  }
  return merged;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
