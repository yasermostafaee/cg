export type CanvasPlayoutCommand = 'next' | 'stop' | 'restore-authoring';

type Receiver = (command: CanvasPlayoutCommand) => boolean;

let receiver: Receiver | null = null;

/**
 * D-199 — connect the bottom transport to the one mounted Canvas preview document without
 * persisting a command or routing it through project state. The returned cleanup only removes the
 * receiver it installed, so a late unmount cannot detach a newer Canvas.
 */
export function registerCanvasPlayoutCommandReceiver(next: Receiver): () => void {
  receiver = next;
  return () => {
    if (receiver === next) receiver = null;
  };
}

/** Deliver one momentary lifecycle command to the mounted Canvas preview, when it is ready. */
export function sendCanvasPlayoutCommand(command: CanvasPlayoutCommand): boolean {
  return receiver?.(command) ?? false;
}
