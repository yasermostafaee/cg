export { createMock } from './mock.js';
// `B-221` — the built-in handlers, so a test can WRAP one (count, then drop the socket,
// then delegate) instead of re-implementing the verb it is injecting a fault around.
export { defaultHandlers } from './handlers.js';
export type {
  AmcpHandler,
  AmcpRequest,
  AmcpResponse,
  CgAddResolution,
  CgDataRejection,
  CgDataResult,
  HandlerContext,
  LayerSlot,
  LayerState,
  MixerRect,
  MockHandle,
  MockOptions,
  OscArgValue,
  ProducerKind,
} from './types.js';
export { FULL_FRAME } from './types.js';
export { renderedRect } from './mixer-rect.js';
export { decodeCgData } from './cg-data.js';
export { encodeBundle, encodeMessage } from './osc-encode.js';
export type { OscMessage } from './osc-encode.js';
export { parseAmcpLine } from './amcp-parser.js';
export { serializeAmcpResponse } from './amcp-response.js';
