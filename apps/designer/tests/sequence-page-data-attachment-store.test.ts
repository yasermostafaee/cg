import { afterEach, describe, expect, it } from 'vitest';
import {
  getSequencePageDataAttachment,
  resetSequencePageDataAttachments,
  sequencePageDataAttachmentCount,
  sequencePageDataAttachmentNeedsUpdate,
  setSequencePageDataAttachment,
} from '../src/renderer/features/fields/sequencePageDataAttachmentStore.js';

afterEach(resetSequencePageDataAttachments);

describe('Sequence page-data file attachment', () => {
  it('keeps the selected source available after the Inspector control remounts', () => {
    setSequencePageDataAttachment('scene', 'weather', {
      bridgePath: 'weather.csv',
      sourcePath: '\\\\FRONTEND-01\\share-files\\weather.csv',
      name: 'weather.csv',
      format: 'csv',
    });
    expect(getSequencePageDataAttachment('scene', 'weather')).toEqual({
      bridgePath: 'weather.csv',
      sourcePath: '\\\\FRONTEND-01\\share-files\\weather.csv',
      name: 'weather.csv',
      format: 'csv',
    });
    expect(getSequencePageDataAttachment('scene', 'another')).toBeNull();
  });

  it('tracks connected files and marks legacy or changed schemas for replacement', () => {
    const attachment = {
      bridgePath: 'weather.xlsx',
      sourcePath: '\\\\FRONTEND-01\\share-files\\weather.xlsx',
      name: 'weather.xlsx',
      format: 'xlsx' as const,
      schemaSignature: 'schema-a',
    };
    setSequencePageDataAttachment('scene', 'weather', attachment);

    expect(sequencePageDataAttachmentCount('scene')).toBe(1);
    expect(sequencePageDataAttachmentNeedsUpdate(attachment, 'schema-a')).toBe(false);
    expect(sequencePageDataAttachmentNeedsUpdate(attachment, 'schema-b')).toBe(true);
    expect(
      sequencePageDataAttachmentNeedsUpdate(
        {
          bridgePath: attachment.bridgePath,
          sourcePath: attachment.sourcePath,
          name: attachment.name,
          format: attachment.format,
        },
        'schema-a',
      ),
    ).toBe(true);
  });
});
