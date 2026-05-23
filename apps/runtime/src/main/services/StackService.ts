import { EventEmitter } from 'node:events';
import {
  LayerManager,
  Reconciler,
  type LayerSlot as ClientLayerSlot,
  type ParsedAmcpResponse,
} from '@cg/caspar-client';
import type { FieldValues, Intent, LayerSlot, StackItemState } from '@cg/shared-schema';
import type { ConnectionService } from './ConnectionService.js';
import type { TemplateRegistry } from './TemplateRegistry.js';
import {
  buildClear,
  buildPlay,
  buildStop,
  buildUpdate,
  type BuiltCommand,
} from '../core/command-builder.js';

/**
 * StackService — the runtime's intent dispatcher. Owns the Reconciler
 * and LayerManager; routes operator intents through the RedundancyAdapter
 * and feeds OSC events from the active sessions back to the Reconciler.
 *
 * Intent → AMCP mapping:
 *
 *   load    → no AMCP (Reconciler-only metadata; slot allocated here)
 *   take    → PLAY [HTML] using the template URL from the registry
 *   update  → CG INVOKE update (per ADR 0006 — JSON arg ack-only for now)
 *   out     → CG STOP + CLEAR
 *   remove  → CG STOP + CLEAR (if on-air) + drop from Reconciler
 *
 * Each command's ack is correlated back to its originating intent via
 * the seq number the Reconciler assigns at applyIntent time.
 */
export interface StackServiceEvents {
  'state-changed': [snapshot: readonly StackItemState[]];
}

export interface StackServiceOptions {
  connections: ConnectionService;
  templates: TemplateRegistry;
  reconciler?: Reconciler;
  layerManager?: LayerManager;
  /** Channel slot to allocate on by default. CasparCG channels are 1-based. */
  defaultChannel?: number;
}

export class StackService extends EventEmitter<StackServiceEvents> {
  readonly reconciler: Reconciler;
  readonly layerManager: LayerManager;
  private readonly connections: ConnectionService;
  private readonly templates: TemplateRegistry;
  private readonly defaultChannel: number;
  private nextSeq = 1;

  constructor(options: StackServiceOptions) {
    super();
    this.connections = options.connections;
    this.templates = options.templates;
    this.reconciler = options.reconciler ?? new Reconciler();
    this.layerManager = options.layerManager ?? new LayerManager();
    this.defaultChannel = options.defaultChannel ?? 1;

    // Forward Reconciler changes to whoever is listening — IPC handlers
    // re-publish via `stack.state-changed`.
    this.reconciler.on('item-changed', () => this.emitSnapshot());
    this.reconciler.on('item-removed', () => this.emitSnapshot());

    // OSC events from both sessions feed the Reconciler. The Reconciler
    // discriminates by `assignSlot` mapping — only events for owned slots
    // contribute to truthStatus.
    this.connections.sessionA.osc.on('events', (events) => {
      for (const e of events) this.reconciler.applyOsc(e);
    });
    this.connections.sessionB.osc.on('events', (events) => {
      for (const e of events) this.reconciler.applyOsc(e);
    });
  }

  /** Current stack snapshot. */
  snapshot(): readonly StackItemState[] {
    return this.reconciler.snapshot();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Operator intents
  // ──────────────────────────────────────────────────────────────────────

  /**
   * `load(itemId, templateId, fields)` — register the item with the
   * Reconciler and allocate a layer slot. No AMCP issued; the PLAY
   * happens on `take`.
   *
   * Returns false if the templateId isn't registered.
   */
  load(intent: { itemId: string; templateId: string; fields: FieldValues }): boolean {
    const tpl = this.templates.get(intent.templateId);
    if (tpl === null) return false;
    const seq = this.nextSeq++;
    this.reconciler.applyIntent(
      { kind: 'load', itemId: intent.itemId, templateId: intent.templateId, fields: intent.fields },
      seq,
    );
    const slot = this.layerManager.allocate(tpl.templateType, this.defaultChannel);
    this.reconciler.assignSlot(
      intent.itemId,
      toSchemaSlot(slot, this.connections.adapter.currentPrimary),
    );
    return true;
  }

  /** `take(itemId)` — issue PLAY [HTML] and correlate the ack. */
  async take(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    const state = this.reconciler.get(itemId);
    if (state === null) return { accepted: false, errorCode: 'unknown-item' };
    if (state.slot === undefined) return { accepted: false, errorCode: 'no-slot' };
    const tpl = this.templates.get(state.templateId);
    if (tpl === null) return { accepted: false, errorCode: 'unknown-template' };

    const seq = this.nextSeq++;
    this.reconciler.applyIntent({ kind: 'take', itemId }, seq);
    const cmd = buildPlay(toClientSlot(state.slot), tpl.url);
    return this.dispatchAndAck(seq, cmd);
  }

  /** `update(itemId, fields, mergeMode)` — push field changes. */
  async update(
    itemId: string,
    fields: FieldValues,
    mergeMode: 'merge' | 'replace' = 'merge',
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    const state = this.reconciler.get(itemId);
    if (state === null) return { accepted: false, errorCode: 'unknown-item' };
    if (state.slot === undefined) return { accepted: false, errorCode: 'no-slot' };

    const seq = this.nextSeq++;
    this.reconciler.applyIntent({ kind: 'update', itemId, fields, mergeMode }, seq);
    const merged = mergeMode === 'replace' ? fields : { ...state.fields, ...fields };
    const cmd = buildUpdate(toClientSlot(state.slot), JSON.stringify(merged));
    return this.dispatchAndAck(seq, cmd);
  }

  /** `out(itemId, immediate?)` — CG STOP, then CLEAR if immediate. */
  async out(itemId: string, immediate = false): Promise<{ accepted: boolean; errorCode?: string }> {
    const state = this.reconciler.get(itemId);
    if (state === null) return { accepted: false, errorCode: 'unknown-item' };
    if (state.slot === undefined) return { accepted: false, errorCode: 'no-slot' };

    const seq = this.nextSeq++;
    this.reconciler.applyIntent({ kind: 'out', itemId, immediate }, seq);
    const clientSlot = toClientSlot(state.slot);
    const cmd = immediate ? buildClear(clientSlot) : buildStop(clientSlot);
    return this.dispatchAndAck(seq, cmd);
  }

  /** `remove(itemId)` — clean exit + remove from Reconciler. */
  async remove(itemId: string): Promise<{ accepted: boolean; errorCode?: string }> {
    const state = this.reconciler.get(itemId);
    if (state === null) return { accepted: false, errorCode: 'unknown-item' };
    if (state.slot !== undefined) {
      const cmd = buildClear(toClientSlot(state.slot));
      try {
        await this.connections.adapter.send(cmd.line, {
          priority: cmd.priority,
          timeoutMs: cmd.timeoutMs,
          retries: cmd.retries,
        });
      } catch {
        // Best-effort — even if CLEAR fails we still drop the item locally.
      }
      this.layerManager.deallocate(toClientSlot(state.slot));
    }
    const seq = this.nextSeq++;
    this.reconciler.applyIntent({ kind: 'remove', itemId }, seq);
    return { accepted: true };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────

  private async dispatchAndAck(
    seq: number,
    cmd: BuiltCommand,
  ): Promise<{ accepted: boolean; errorCode?: string }> {
    try {
      const result = await this.connections.adapter.send(cmd.line, {
        priority: cmd.priority,
        timeoutMs: cmd.timeoutMs,
        retries: cmd.retries,
      });
      const ok = isOk(result.response);
      this.reconciler.applyAck(seq, ok, ok ? undefined : `amcp-${String(result.response.code)}`);
      return ok
        ? { accepted: true }
        : { accepted: false, errorCode: `amcp-${String(result.response.code)}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.reconciler.applyAck(seq, false, msg);
      return { accepted: false, errorCode: msg };
    }
  }

  private emitSnapshot(): void {
    this.emit('state-changed', this.snapshot());
  }
}

function isOk(resp: ParsedAmcpResponse): boolean {
  return resp.kind !== 'err';
}

/** caspar-client uses `LayerSlot` without a `server` field; convert. */
function toClientSlot(slot: LayerSlot): ClientLayerSlot {
  return { channel: slot.channel, layer: slot.layer };
}

function toSchemaSlot(slot: ClientLayerSlot, primary: 'A' | 'B'): LayerSlot {
  return {
    channel: slot.channel,
    layer: slot.layer,
    server: primary === 'A' ? 'primary' : 'backup',
  };
}

// Suppress unused-export false positive on type-only import for Intent;
// keeping the import group cohesive simplifies reads above.
export type _RuntimeIntent = Intent;
