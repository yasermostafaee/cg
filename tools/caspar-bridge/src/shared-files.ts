import * as fs from 'node:fs';
import { writeServiceConfig } from './service-config.js';

export interface SharedFilesController {
  readonly getPath: () => string;
  readonly setPath: (path: string) => Promise<{ ok: boolean; path?: string; message?: string }>;
}

function folderReadRefusal(folder: string, error: unknown): string {
  const network = /^(?:[/\\]{2}(?![?.][/\\])|\\\\\?\\UNC\\)/i.test(folder);
  const code = (error as NodeJS.ErrnoException | null)?.code;
  switch (code) {
    case 'ENOENT':
      return network
        ? 'CG Bridge could not find this network folder. Check the server name, share name and folder from the CG Bridge server.'
        : 'CG Bridge could not find this folder. Check that the path exists on the CG Bridge server.';
    case 'ENOTDIR':
      return 'The shared-files path must be an existing folder.';
    case 'EACCES':
    case 'EPERM':
      return network
        ? 'CG Bridge was denied access to this network folder. Check Read access for the CG Bridge service identity in both Sharing and Security (NTFS).'
        : 'CG Bridge was denied access to this folder. Run CG Bridge Setup as administrator to grant the service Read access.';
    default:
      return network
        ? 'CG Bridge could not read this network folder. Check that the share is reachable from the CG Bridge server.'
        : 'CG Bridge could not read this folder. Check the path and the CG Bridge service’s Read access.';
  }
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
        // On Windows fs.access does not check ACLs. Read through the service's directory handle.
        const directory = await fs.promises.opendir(next, { bufferSize: 1 });
        try {
          await directory.read();
        } finally {
          await directory.close();
        }
      } catch (err) {
        return { ok: false, message: folderReadRefusal(next, err) };
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
