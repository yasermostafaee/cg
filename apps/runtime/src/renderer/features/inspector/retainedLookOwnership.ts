import { TEMPLATE_PAGE_ALLOWANCE_BYTES, type TemplateInfo } from '@cg/shared-ipc';
import { LookGroupsSchema } from '@cg/shared-schema';
import { z } from 'zod';

const sceneOwnership = z.object({
  lookGroups: LookGroupsSchema.length(1),
  layers: z.array(
    z.object({
      children: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          name: z.string().optional(),
          compositionId: z.string().optional(),
        }),
      ),
    }),
  ),
});

/** The generated last script embeds the scene as one JSON line, escaped for HTML. */
function sceneFromPage(html: string): unknown {
  const script = html.lastIndexOf('<script>');
  if (script < 0) return null;
  const boot = /^<script>\r?\n[ \t]*\(function \(\) \{\r?\n[ \t]*var scene = /.exec(
    html.slice(script, script + 100),
  );
  if (boot === null) return null;
  const start = script + boot[0].length;
  const end = html.indexOf('\n', start);
  if (end < 0 || end - start > TEMPLATE_PAGE_ALLOWANCE_BYTES) return null;
  if (!/^\r?\n[ \t]*try \{/.test(html.slice(end, end + 32))) return null;
  const literal = html.slice(start, end).trimEnd();
  if (!literal.startsWith('{') || !literal.endsWith('};')) return null;
  try {
    return JSON.parse(literal.slice(0, -1)) as unknown;
  } catch {
    return null;
  }
}

/** Recover only the missing ownership from the retained page of the same channel listing. */
export function retainedLookOwnership(
  info: TemplateInfo,
  html: string,
): ReadonlyMap<string, string> | null {
  const carrier = info.liveSources;
  if (carrier?.looks === undefined || carrier.looks.length < 2) return null;
  const looks = carrier.looks;
  const parsed = sceneOwnership.safeParse(sceneFromPage(html));
  if (!parsed.success) return null;
  const group = parsed.data.lookGroups[0];
  if (
    group === undefined ||
    group.looks.length !== looks.length ||
    group.defaultLookId !== carrier.defaultLookId
  )
    return null;

  const authored = new Map(group.looks.map((look) => [look.id, look.instanceId]));
  const children = parsed.data.layers.flatMap((layer) => layer.children);
  const resolved = new Map<string, string>();
  for (const look of looks) {
    const instanceId = authored.get(look.id);
    if (
      instanceId === undefined ||
      resolved.has(look.id) ||
      (look.instanceId !== undefined && look.instanceId !== instanceId)
    )
      return null;

    const matches = children.filter((element) => element.id === instanceId);
    const instance = matches[0];
    if (matches.length !== 1 || instance?.type !== 'composition' || !instance.compositionId)
      return null;
    const fields = info.groups?.find((fields) => fields.instanceId === instanceId);
    if (
      fields !== undefined &&
      (fields.sequence !== undefined ||
        fields.name !== instance.name ||
        fields.compositionId !== instance.compositionId)
    )
      return null;
    resolved.set(look.id, instanceId);
  }
  return resolved;
}
