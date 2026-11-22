import { AmcpTransport } from '@cg/caspar-client';
import type { ManagedCgCommands } from './managed-cg-commands.js';

/** An isolated process dedicated to one opted-in CG channel. */
export interface ManagedCgPilot {
  readonly channel: number;
  readonly commands: Pick<
    ManagedCgCommands,
    'editLayout' | 'prepareTemplate' | 'readAppliedLayout' | 'reconcilePending'
  >;
}

// The pilot can observe CasparCG while only Playout can change its stage.
// The guard belongs to each socket generation, below the queues and recovery.
const observation =
  /^(?:VERSION(?: SERVER)?|INFO(?: (?:CONFIG|SYSTEM|[1-9][0-9]*))?|OSC SUBSCRIBE [1-9][0-9]*)$/i;

export class ManagedObservationTransport extends AmcpTransport {
  override async send(line: string): Promise<void> {
    if (!observation.test(line.trim())) {
      throw new Error('Managed CG requires sending layout commands through Playout.');
    }
    await super.send(line);
  }
}
