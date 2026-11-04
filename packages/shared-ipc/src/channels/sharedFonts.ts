import { z } from 'zod';
import { AssetMetaSchema } from './assets.js';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/** D-126 — project-independent font library channels. */
export const SharedFontsImportChannel = defineChannel(
  'sharedFonts.import',
  z.void(),
  z.object({ font: AssetMetaSchema }),
);

export const SharedFontsListChannel = defineChannel(
  'sharedFonts.list',
  z.void(),
  z.array(AssetMetaSchema),
);

export const SharedFontsRemoveChannel = defineChannel(
  'sharedFonts.remove',
  z.object({ assetId: z.string().min(1) }),
  z.object({ ok: z.boolean() }),
);

export const SharedFontsImportedChannel = definePublishChannel(
  'sharedFonts.imported',
  AssetMetaSchema,
);
