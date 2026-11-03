export interface SequencePageDataAttachment {
  bridgePath: string;
  sourcePath: string;
  name: string;
  format: 'json' | 'csv' | 'xlsx';
  /** Schema used when this generated file was saved; absent on legacy session attachments. */
  schemaSignature?: string;
}

const attachments = new Map<string, SequencePageDataAttachment>();
const listeners = new Set<() => void>();
let version = 0;

function key(sceneId: string, sequenceId: string): string {
  return `${sceneId}\0${sequenceId}`;
}

export function sequencePageDataAttachmentsVersion(): number {
  return version;
}

export function subscribeSequencePageDataAttachments(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSequencePageDataAttachment(
  sceneId: string,
  sequenceId: string,
): SequencePageDataAttachment | null {
  return attachments.get(key(sceneId, sequenceId)) ?? null;
}

export function sequencePageDataAttachmentCount(sceneId: string): number {
  const prefix = `${sceneId}\0`;
  return [...attachments.keys()].filter((attachmentKey) => attachmentKey.startsWith(prefix)).length;
}

export function sequencePageDataAttachmentNeedsUpdate(
  attachment: SequencePageDataAttachment,
  currentSchemaSignature: string,
): boolean {
  return attachment.schemaSignature !== currentSchemaSignature;
}

export function setSequencePageDataAttachment(
  sceneId: string,
  sequenceId: string,
  attachment: SequencePageDataAttachment | null,
): void {
  const attachmentKey = key(sceneId, sequenceId);
  if (attachment === null) attachments.delete(attachmentKey);
  else attachments.set(attachmentKey, attachment);
  version += 1;
  for (const listener of listeners) listener();
}

/** Test-only reset; selected OS handles are intentionally session-scoped in production. */
export function resetSequencePageDataAttachments(): void {
  attachments.clear();
  version += 1;
  for (const listener of listeners) listener();
}
