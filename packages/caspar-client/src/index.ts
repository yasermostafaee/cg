export { AmcpTransport } from './amcp/transport.js';
export type { AmcpTransportEvents, ParsedAmcpResponse } from './amcp/transport.js';
export { AmcpResponseParser } from './amcp/response-parser.js';
export { escape, quote } from './amcp/escape.js';

export { OscTransport } from './osc/transport.js';
export type { OscTransportEvents, OscTransportOptions } from './osc/transport.js';
export { OscInterestFilter } from './osc/interest.js';
export { OscRateLimiter } from './osc/rate-limiter.js';
export { OscChangeTracker } from './osc/change-tracker.js';
export { parsePacket, flatten } from './osc/parser.js';
export type { OscPacket, OscBundle, OscMessage, OscArgValue } from './osc/parser.js';
export { messageToEvent } from './osc/event-mapper.js';

export { CommandQueue } from './queue/command-queue.js';
export type {
  CommandQueueEvents,
  CommandQueueOptions,
  EnqueueOptions,
  Priority,
  QueueResult,
} from './queue/command-queue.js';
export { AmcpAbortedError, AmcpDisconnectedError, AmcpTimeoutError } from './queue/errors.js';

export { ServerSession } from './session/server-session.js';
export type {
  ServerSessionEvents,
  ServerSessionOptions,
  ServerSessionState,
} from './session/server-session.js';
export { Backoff } from './session/backoff.js';
export { HeartbeatService } from './session/heartbeat.js';
export type { HeartbeatEvents, HeartbeatOptions, HeartbeatStatus } from './session/heartbeat.js';

export {
  LayerManager,
  DEFAULT_LAYER_POLICY,
  OutOfLayersError,
  UnknownTemplateTypeError,
} from './layers/layer-manager.js';
export type {
  LayerManagerEvents,
  LayerManagerOptions,
  LayerPolicy,
  LayerSlot,
  PinnedSlot,
} from './layers/layer-manager.js';

export { RedundancyAdapter } from './redundancy/redundancy-adapter.js';
export type {
  RedundancyAdapterEvents,
  RedundancyAdapterOptions,
  RedundancyStrategy,
  HealthSnapshot,
} from './redundancy/redundancy-adapter.js';
export type {
  FailoverEvent,
  FailoverReason,
  PairedSessions,
  RedundancySendResult,
  SendOptions,
  SendTarget,
  ServerLabel,
} from './redundancy/types.js';
export { InMemoryJournal } from './redundancy/journal.js';
export type { CommandJournal, JournalEntry, JournalOutcome } from './redundancy/journal.js';

export { Reconciler } from './reconciler/reconciler.js';
export type { ReconcilerEvents, ReconcilerOptions } from './reconciler/reconciler.js';
