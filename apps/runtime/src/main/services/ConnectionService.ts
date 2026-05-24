import { EventEmitter } from 'node:events';
import {
  RedundancyAdapter,
  ServerSession,
  type FailoverReason,
  type RedundancyStrategy,
  type ServerLabel,
  type ServerSessionState,
} from '@cg/caspar-client';
import type { ConnectionConfig, ConnectionHealth, FailoverInfo } from '@cg/shared-ipc';

/**
 * ConnectionService — owns the two ServerSession instances and the
 * RedundancyAdapter that fronts them. Translates session-level events
 * into a single ConnectionHealth snapshot the UI consumes.
 *
 * Lifecycle: the service is constructed once at boot, given a config,
 * and `start()`ed. The sessions run their own FSM loops; this service
 * just observes and re-publishes.
 */

export interface ConnectionServiceEvents {
  'health-changed': [health: ConnectionHealth];
}

export class ConnectionService extends EventEmitter<ConnectionServiceEvents> {
  readonly sessionA: ServerSession;
  readonly sessionB: ServerSession;
  readonly adapter: RedundancyAdapter;
  private config: ConnectionConfig;
  private lastFailover: FailoverInfo | undefined;

  constructor(config: ConnectionConfig) {
    super();
    this.config = config;
    this.sessionA = new ServerSession({
      name: 'A',
      host: config.servers.A.host,
      port: config.servers.A.amcpPort,
      oscPort: config.servers.A.oscPort,
    });
    this.sessionB = new ServerSession({
      name: 'B',
      host: config.servers.B.host,
      port: config.servers.B.amcpPort,
      oscPort: config.servers.B.oscPort,
    });
    this.adapter = new RedundancyAdapter({
      strategy: config.strategy,
      sessions: { A: this.sessionA, B: this.sessionB },
      autoFailoverEnabled: config.autoFailoverEnabled,
    });

    const onStateChange = (): void => this.emitHealth();
    this.sessionA.on('state-change', onStateChange);
    this.sessionB.on('state-change', onStateChange);
    this.adapter.on('failover-complete', (event) => {
      this.lastFailover = {
        at: new Date(event.at).toISOString(),
        reason: event.reason,
        from: event.from,
        to: event.to,
      };
      this.emitHealth();
    });
  }

  /** Begin connecting both sessions. Returns immediately; status flows through events. */
  start(): void {
    this.sessionA.start();
    this.sessionB.start();
  }

  async stop(): Promise<void> {
    await Promise.all([this.sessionA.stop(), this.sessionB.stop()]);
  }

  getConfig(): ConnectionConfig {
    return this.config;
  }

  /** Synchronous snapshot of current health for `connections.health` requests. */
  getHealth(): ConnectionHealth {
    const health: ConnectionHealth = {
      primary: {
        label: this.adapter.currentPrimary,
        state: this.adapter.primarySession.state,
        amcpAxisOk: this.adapter.primarySession.state === 'healthy',
      },
      backup: {
        label: this.adapter.currentPrimary === 'A' ? 'B' : 'A',
        state: this.adapter.backupSession.state,
        amcpAxisOk: this.adapter.backupSession.state === 'healthy',
      },
      currentPrimary: this.adapter.currentPrimary,
      strategy: this.config.strategy,
    };
    if (this.lastFailover !== undefined) health.lastFailover = this.lastFailover;
    return health;
  }

  /** Operator-driven failover. */
  async failover(reason: FailoverReason = 'manual'): Promise<ServerLabel> {
    await this.adapter.failover(reason);
    return this.adapter.currentPrimary;
  }

  private emitHealth(): void {
    this.emit('health-changed', this.getHealth());
  }

  /** Hot-swap the strategy. Useful for settings UI without a full restart. */
  setStrategy(_strategy: RedundancyStrategy): void {
    // The RedundancyAdapter doesn't yet support strategy hot-swap; treat this
    // as a TODO for M9. For now we just record the desired value so a fresh
    // start picks it up.
    this.config = { ...this.config, strategy: _strategy };
  }

  /** Whether either session has ever reached 'healthy'. */
  isReady(): boolean {
    return this.sessionA.state === 'healthy' || this.sessionB.state === 'healthy';
  }

  /** Snapshot of just one session's lifecycle state (diagnostic). */
  sessionState(label: ServerLabel): ServerSessionState {
    return label === 'A' ? this.sessionA.state : this.sessionB.state;
  }
}
