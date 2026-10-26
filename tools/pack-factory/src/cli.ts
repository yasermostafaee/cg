import { preparePack } from './build.js';
import { writeDelivery } from './delivery.js';
import { PackFactoryError } from './errors.js';
import { runStudioUntilSignal } from './studio-server.js';

export interface ParsedArgs {
  command: 'build' | 'validate' | 'studio' | 'help';
  brandKit?: string;
  recipe?: string;
  out?: string;
  exportedAt?: string;
  workspace?: string;
  port?: number;
  noPreview: boolean;
  force: boolean;
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.command === 'help') {
      print(USAGE);
      return 0;
    }
    if (args.command === 'studio') {
      await runStudioUntilSignal({
        ...(args.workspace === undefined ? {} : { workspace: args.workspace }),
        ...(args.port === undefined ? {} : { port: args.port }),
      });
      return 0;
    }
    if (args.brandKit === undefined || args.recipe === undefined) {
      throw new PackFactoryError('missing-option', '--brand-kit and --recipe are required');
    }
    const pack = await preparePack({
      brandKitPath: args.brandKit,
      recipePath: args.recipe,
      ...(args.exportedAt === undefined ? {} : { exportedAt: args.exportedAt }),
    });
    if (args.command === 'validate') {
      print(
        `VALID — ${String(pack.templates.length)} template(s) for ${pack.inputs.brandKit.name}`,
      );
      for (const template of pack.templates) {
        print(`  ${template.key}  ${template.manifest.id}  ${template.sha256}`);
      }
      return 0;
    }
    if (args.out === undefined) {
      throw new PackFactoryError('missing-option', 'build requires --out');
    }
    const delivery = await writeDelivery(pack, {
      outputDirectory: args.out,
      preview: !args.noPreview,
      force: args.force,
    });
    print(
      `${delivery.report.status === 'complete' ? 'COMPLETE' : 'INCOMPLETE'} — ${String(pack.templates.length)} template(s) -> ${delivery.outputDirectory}`,
    );
    if (args.noPreview) print('Visual QC was skipped; this is not a completed customer delivery.');
    return 0;
  } catch (error) {
    const code = error instanceof PackFactoryError ? error.code : 'unexpected-error';
    process.stderr.write(
      `cg-pack-factory [${code}]: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = argv[1] === '--' ? [argv[0], ...argv.slice(2)] : argv;
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { command: 'help', noPreview: false, force: false };
  }
  const command = args[0];
  if (command !== 'build' && command !== 'validate' && command !== 'studio') {
    throw new PackFactoryError('unknown-command', `Unknown command: ${command ?? ''}\n\n${USAGE}`);
  }
  const parsed: ParsedArgs = { command, noPreview: false, force: false };
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--no-preview') {
      parsed.noPreview = true;
      continue;
    }
    if (flag === '--force') {
      parsed.force = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new PackFactoryError('missing-option-value', `${flag ?? '<option>'} needs a value`);
    }
    switch (flag) {
      case '--brand-kit':
        parsed.brandKit = value;
        break;
      case '--recipe':
        parsed.recipe = value;
        break;
      case '--out':
        parsed.out = value;
        break;
      case '--exported-at':
        parsed.exportedAt = value;
        break;
      case '--workspace':
        parsed.workspace = value;
        break;
      case '--port': {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65_535) {
          throw new PackFactoryError('invalid-port', '--port must be an integer from 1 to 65535');
        }
        parsed.port = port;
        break;
      }
      default:
        throw new PackFactoryError('unknown-option', `Unknown option: ${flag ?? ''}`);
    }
    index += 1;
  }
  return parsed;
}

const USAGE = `Brand Pack Factory v1

Start the private local browser Studio (loopback only):
  cg-pack-factory studio --workspace <directory> --port 4319

Validate without writing:
  cg-pack-factory validate --brand-kit <brandkit.json> --recipe <pack.json>

Build a completed delivery with Chromium visual QC:
  cg-pack-factory build --brand-kit <brandkit.json> --recipe <pack.json> --out <directory>

Options:
  --workspace <path>  Studio customer workspace (defaults below the current user's home)
  --port <number>     Studio loopback port (default: 4319)
  --exported-at <ISO>  Pin the export time (reproducible/test builds)
  --force              Replace an existing delivery atomically
  --no-preview         Skip Chromium (result is marked INCOMPLETE)
`;

function print(value: string): void {
  process.stdout.write(`${value}\n`);
}
