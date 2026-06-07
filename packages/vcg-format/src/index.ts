// Public surface of @cg/vcg-format.

export { pack } from './pack.js';
export type { PackInput } from './pack.js';

export { unpack } from './unpack.js';
export type { UnpackResult } from './unpack.js';

export { verify } from './verify.js';
export type { VerifyOptions, VerifyResult } from './verify.js';

export { sha256Hex, computeIntegrity, computeIntegrityRoot } from './integrity.js';
export type { IntegrityFile } from './integrity.js';

export { signEd25519, verifyEd25519, generateEd25519KeyPair } from './sign.js';
export type { Ed25519KeyInput } from './sign.js';

export { buildGddSchema, gddExporter } from './gdd.js';
export type { GddSchema, GddProperty, SchemaExporter } from './gdd.js';
