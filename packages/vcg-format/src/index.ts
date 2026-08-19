// Public surface of @cg/vcg-format.

export { pack } from './pack.js';
export type { PackInput } from './pack.js';

export { unpack } from './unpack.js';
export type { UnpackResult } from './unpack.js';

export { verify } from './verify.js';
export type { VerifyOptions, VerifyResult } from './verify.js';

export {
  sha256Hex,
  sha256HexOfChunks,
  computeIntegrity,
  computeIntegrityRoot,
} from './integrity.js';
export type { IntegrityFile } from './integrity.js';

export { signEd25519, verifyEd25519, generateEd25519KeyPair } from './sign.js';
export type { Ed25519KeyInput } from './sign.js';

export { buildGddSchema, gddExporter } from './gdd.js';
export type { GddSchema, GddProperty, SchemaExporter } from './gdd.js';

export { buildPlayoutMetadata } from './playout-metadata.js';
export type { PlayoutMetadata } from './playout-metadata.js';

export {
  buildTemplateLiveSources,
  collectArrangements,
  collectLiveSources,
} from './live-sources.js';

// D-150 / B-104 — the Designer's own working document. Same zip + hashing
// primitives as the .vcg exporter above; a DIFFERENT document (it keeps the
// authoring scene whole, carries no runtime bundle, and is never signed).
export {
  packProject,
  unpackProject,
  readProjectDocument,
  looksLikeZip,
} from './project-package.js';
export type { PackProjectInput, ProjectDocument } from './project-package.js';
