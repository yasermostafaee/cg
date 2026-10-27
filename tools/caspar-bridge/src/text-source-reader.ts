import * as fs from 'node:fs';
import * as path from 'node:path';
import { BridgeTextSourcePathSchema } from '@cg/shared-schema';

/** Large enough for newsroom copy; small enough to keep a control frame predictable. */
export const MAX_TEXT_SOURCE_BYTES = 1024 * 1024;

export interface TextSourceReadResult {
  readonly name: string;
  /** Canonical Windows/UNC path for operator verification; never persisted in a template. */
  readonly sourcePath: string;
  readonly content: string;
}

/**
 * R-102 — read current UTF-8 bytes below one configured root. Both lexical and
 * canonical containment are checked: the latter is what closes symlink/junction escape.
 */
export async function readTextSource(
  root: string | undefined,
  requested: string,
): Promise<TextSourceReadResult> {
  const parsed = BridgeTextSourcePathSchema.safeParse(requested);
  if (!parsed.success) throw new Error(`Text source “${requested}” is not a safe relative path.`);
  if (root === undefined || root.trim() === '') {
    throw new Error(
      `Text source “${requested}” cannot be read: no text-source root is configured.`,
    );
  }

  const rootPath = path.resolve(root);
  const lexicalTarget = path.resolve(rootPath, ...parsed.data.replaceAll('\\', '/').split('/'));
  if (!isInside(rootPath, lexicalTarget)) {
    throw new Error(`Text source “${requested}” is outside the configured root.`);
  }

  let realRoot: string;
  let realTarget: string;
  try {
    [realRoot, realTarget] = await Promise.all([
      fs.promises.realpath(rootPath),
      fs.promises.realpath(lexicalTarget),
    ]);
  } catch (err) {
    throw new Error(`Text source “${requested}” cannot be found or read. (${describe(err)})`);
  }
  if (!isInside(realRoot, realTarget)) {
    throw new Error(`Text source “${requested}” resolves outside the configured root.`);
  }

  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(realTarget, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('the target is not a regular file');
    if (stat.size > MAX_TEXT_SOURCE_BYTES) {
      throw new Error(`the file is larger than ${String(MAX_TEXT_SOURCE_BYTES)} bytes`);
    }
    // Read at most limit+1 even if the file grows after stat; never allocate from an unchecked size.
    const bytes = Buffer.alloc(MAX_TEXT_SOURCE_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await handle.read(bytes, used, bytes.length - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > MAX_TEXT_SOURCE_BYTES) {
      throw new Error(`the file is larger than ${String(MAX_TEXT_SOURCE_BYTES)} bytes`);
    }
    // WHATWG UTF-8 decoding matches `File.text()` and removes a UTF-8 BOM,
    // preventing an invisible first character from reaching a crawl/headline.
    const content = new TextDecoder('utf-8').decode(bytes.subarray(0, used));
    return { name: parsed.data, sourcePath: realTarget, content };
  } catch (err) {
    throw new Error(`Text source “${requested}” cannot be read. (${describe(err)})`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
