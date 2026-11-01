import * as fs from 'node:fs';
import { writeServiceConfig } from './service-config.js';

export interface SharedFilesController {
  readonly getPath: () => string;
  readonly setPath: (path: string) => Promise<{ ok: boolean; path?: string; message?: string }>;
}

/**
 * The station-wide shared-files boundary, owned by the Bridge process so a remote CG Control never
 * validates its own disk. A refused candidate cannot move the live path or touch persisted config.
 */
export function createSharedFilesController(options: {
  initialPath: string;
  serviceConfigFile?: string | undefined;
}): SharedFilesController {
  let current = options.initialPath;

  return {
    getPath: () => current,
    setPath: async (candidate) => {
      const next = candidate.trim();
      try {
        const stat = await fs.promises.stat(next);
        if (!stat.isDirectory()) {
          return { ok: false, message: 'The shared-files path must be an existing folder.' };
        }
        await fs.promises.access(next, fs.constants.R_OK);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          message:
            'CG Control cannot read this folder. For a local folder, run Setup as administrator; ' +
            'for a network path, grant this CG Control server computer account Read in ' +
            `both Sharing and Security (NTFS). ${detail}`,
        };
      }

      try {
        if (options.serviceConfigFile !== undefined) {
          writeServiceConfig(options.serviceConfigFile, { textSourceRoot: next });
        }
        current = next;
        return {
          ok: true,
          path: next,
          ...(options.serviceConfigFile === undefined
            ? { message: 'Path changed for this development session; it will reset on restart.' }
            : {}),
        };
      } catch (err) {
        return {
          ok: false,
          message: `CG Control could not save the shared-files path: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
