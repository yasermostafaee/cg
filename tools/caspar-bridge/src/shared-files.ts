import * as fs from 'node:fs';
import { writeServiceConfig } from './service-config.js';

export interface SharedFilesController {
  readonly getPath: () => string;
  readonly setPath: (path: string) => Promise<{ ok: boolean; path?: string; message?: string }>;
}

export function folderReadRefusal(
  folder: string,
  error: unknown,
  child?: 'subfolder' | 'package',
): string {
  const network = /^(?:[/\\]{2}(?![?.][/\\])|\\\\\?\\UNC\\)/i.test(folder);
  const code = (error as NodeJS.ErrnoException | null)?.code;
  switch (code) {
    case 'ENOENT':
      if (child === 'package')
        return 'CG Bridge could not find the selected package. Refresh the Shared files folder.';
      if (child === 'subfolder')
        return 'CG Bridge could not find the selected subfolder. Use Up to return to its parent.';
      return network
        ? 'CG Bridge could not find this network folder. Check the server name, share name and folder from the CG Bridge server.'
        : 'CG Bridge could not find this folder. Check that the path exists on the CG Bridge server.';
    case 'ENOTDIR':
      return 'CG Bridge needs an existing folder for the shared-files path.';
    case 'EACCES':
    case 'EPERM':
      return network
        ? 'CG Bridge was denied access to this network folder. Check Read access for the CG Bridge service identity in both Sharing and Security (NTFS).'
        : 'CG Bridge was denied access to this folder. Grant the CG Bridge service Read and execute access in Security (NTFS).';
    default:
      return network
        ? 'CG Bridge could not read this network folder. Check the share name and the Windows credentials used by the CG Bridge service.'
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
        // Browsing requires a canonical path to fence package reads to the shared root.
        await fs.promises.realpath(next);
      } catch (err) {
        return { ok: false, message: folderReadRefusal(next, err) };
      }

      try {
        if (next === current) return { ok: true, path: next };
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
