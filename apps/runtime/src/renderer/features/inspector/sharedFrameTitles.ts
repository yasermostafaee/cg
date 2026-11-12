import {
  flattenElements,
  liveForegroundKeys,
  lookGroupOf,
  type CompositionFieldGroup,
  type Scene,
} from '@cg/shared-schema';

/** The wire paths remain instance-scoped. Each group is one title edited as a unit. */
export type SharedFrameTitles = readonly (readonly (readonly string[])[])[];
export type SharedFrameTitleIndex = ReadonlyMap<string, readonly (readonly string[])[]>;

/** Index only addresses that still exist in the selected catalogue record. */
export function indexSharedFrameTitles(
  titles: SharedFrameTitles,
  fields: readonly CompositionFieldGroup[],
): SharedFrameTitleIndex {
  const fieldIdentity = (path: readonly string[]): string | undefined => {
    let groups = fields;
    let owner: CompositionFieldGroup | undefined;
    for (const name of path.slice(0, -1)) {
      const matches = groups.filter((group) => group.name === name);
      owner = matches[0];
      if (matches.length !== 1 || owner === undefined || owner.sequence !== undefined) {
        return undefined;
      }
      groups = owner.aggregate.groups;
    }
    const field = owner?.aggregate.fields.find(
      (field) => field.id === path.at(-1) && (field.type === 'text' || field.type === 'multiline'),
    );
    return field === undefined ? undefined : JSON.stringify([owner?.compositionId, field.id]);
  };

  const index = new Map<string, readonly (readonly string[])[]>();
  for (const title of titles) {
    const identities = title.map(fieldIdentity);
    if (identities.includes(undefined) || new Set(identities).size !== 1) continue;
    for (const path of title) index.set(JSON.stringify(path), title);
  }
  return index;
}

export function sharedFrameTitlesOf(scene: Scene): string[][][] {
  const presets = new Set(lookGroupOf(scene)?.looks.map((look) => look.instanceId));
  if (presets.size < 2) return [];

  const flattened = flattenElements(scene);
  const byKey = new Map(flattened.map((entry) => [entry.key, entry.element]));
  const compositions = new Map(
    scene.compositions?.map((composition) => [composition.id, composition]),
  );
  const platesByAncestor = new Map<string, number>();
  for (const { element, ancestorKeys } of flattened) {
    if (element.type !== 'video-placeholder') continue;
    for (const key of ancestorKeys) {
      platesByAncestor.set(key, (platesByAncestor.get(key) ?? 0) + 1);
    }
  }

  const foreground = liveForegroundKeys(scene);
  const groups = new Map<string, Map<string, { preset: string; path: string[] }>>();
  for (const { element, key, ancestorKeys } of flattened) {
    if (element.type !== 'text' || !foreground.has(key)) continue;
    const preset = ancestorKeys.find((ancestor) => presets.has(ancestor));
    const owner = ancestorKeys.at(-1);
    if (preset === undefined || owner === undefined || preset === owner) continue;
    if (platesByAncestor.get(owner) !== 1) continue;

    // The field runtime traverses composition instances by their namespace names.
    const instances = ancestorKeys.map((ancestor) => byKey.get(ancestor));
    if (!instances.every((instance) => instance?.type === 'composition')) continue;
    const compositionId = instances.at(-1)?.compositionId;
    const composition = compositionId === undefined ? undefined : compositions.get(compositionId);
    if (composition === undefined) continue;

    for (const binding of composition.bindings ?? []) {
      if (binding.target.kind !== 'text' || binding.target.elementId !== element.id) continue;
      const field = composition.fields?.find((field) => field.id === binding.fieldId);
      if (field?.type !== 'text' && field?.type !== 'multiline') continue;
      const identity = JSON.stringify([composition.id, field.id]);
      const path = [...instances.map((instance) => instance.name), field.id];
      const group = groups.get(identity) ?? new Map<string, { preset: string; path: string[] }>();
      group.set(owner, { preset, path });
      groups.set(identity, group);
    }
  }

  const titles: string[][][] = [];
  for (const group of groups.values()) {
    const copies = [...group.values()];
    // An instance repeated within a single preset can intentionally carry distinct values.
    if (
      copies.length > 1 &&
      new Set(copies.map(({ preset }) => preset)).size === copies.length &&
      new Set(copies.map(({ path }) => JSON.stringify(path))).size === copies.length
    ) {
      titles.push(copies.map(({ path }) => path));
    }
  }
  return titles;
}
