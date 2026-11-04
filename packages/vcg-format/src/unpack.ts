import { ManifestSchema, SceneSchema, type Manifest, type Scene } from '@cg/shared-schema';
import { readZip, readZipEntry } from './zip.js';

export interface UnpackResult {
  scene: Scene;
  manifest: Manifest;
  /** All zip entries by relative path. Includes manifest.json + template.json. */
  files: Map<string, Uint8Array>;
}

/**
 * 🔴 `BOOK-EXPORT-01` (`B-350`) — **THE BYTES ARE NOT A READABLE ZIP**: empty, cut short, or not a
 * zip at all. Told apart from a template that parses wrong, which may be one from a newer build, so
 * a console can say "damaged" only about a file that is.
 */
export class VcgUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VcgUnreadableError';
  }
}

/** `B-350` — a readable zip that is not a CG template: no manifest or template, or not JSON. */
export class VcgNotATemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VcgNotATemplateError';
  }
}

const decoder = new TextDecoder();
function decodeUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/**
 * The deliberately small, forward-compatible part of `manifest.json` needed
 * before a strict manifest/scene parse.
 *
 * Do not replace this with `ManifestSchema`: an older Runtime's strict schema
 * is precisely what may reject a newer scene value (for example 30 fps) before
 * it can explain that the station is behind.
 */
export interface ManifestCompatibilityHeader {
  readonly name?: string;
  readonly minRuntimeVersion: string;
}

/**
 * Read only the compatibility header from `manifest.json`.
 *
 * This is a preflight, not package verification. A missing/malformed header is
 * still classified by the existing `verify()`/`unpack()` path; callers may
 * catch this error and defer to that authoritative validation.
 */
export async function readManifestCompatibility(
  buf: Uint8Array,
): Promise<ManifestCompatibilityHeader> {
  let manifestBuf: Uint8Array | undefined;
  try {
    manifestBuf = await readZipEntry(buf, 'manifest.json');
  } catch (e) {
    throw new VcgUnreadableError(e instanceof Error ? e.message : String(e));
  }
  if (manifestBuf === undefined) {
    throw new VcgNotATemplateError('Missing manifest.json in .vcg');
  }

  const raw = jsonOf(manifestBuf, 'manifest.json');
  if (!isRecord(raw) || !isRecord(raw.compatibility)) {
    throw new Error('manifest.json has no readable compatibility block');
  }
  const minRuntimeVersion = raw.compatibility.minRuntimeVersion;
  if (typeof minRuntimeVersion !== 'string' || minRuntimeVersion.length === 0) {
    throw new Error('manifest.json has no readable compatibility.minRuntimeVersion');
  }
  return {
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    minRuntimeVersion,
  };
}

/**
 * Read a `.vcg` archive, validate the manifest and the embedded Scene, and
 * return both alongside the raw file map. Throws if either is missing,
 * malformed, or version-incompatible at the schema level. Integrity
 * verification is a separate step — see `verify()`.
 */
export async function unpack(buf: Uint8Array): Promise<UnpackResult> {
  let files: Map<string, Uint8Array>;
  try {
    files = await readZip(buf);
  } catch (e) {
    throw new VcgUnreadableError(e instanceof Error ? e.message : String(e));
  }

  const manifestBuf = files.get('manifest.json');
  if (!manifestBuf) {
    throw new VcgNotATemplateError('Missing manifest.json in .vcg');
  }
  const manifest = ManifestSchema.parse(jsonOf(manifestBuf, 'manifest.json'));

  const sceneBuf = files.get('template.json');
  if (!sceneBuf) {
    throw new VcgNotATemplateError('Missing template.json in .vcg');
  }
  const scene = SceneSchema.parse(jsonOf(sceneBuf, 'template.json'));

  return { scene, manifest, files };
}

function jsonOf(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes)) as unknown;
  } catch (e) {
    throw new VcgNotATemplateError(
      `${name} is not JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
