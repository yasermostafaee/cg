import type { FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import { operatorRowName, type NameableRef, type OperatorRowName } from '../ui/operatorNaming.js';
import { useFixedBank } from './useFixedLayers.js';
import { useTemplateIndex } from './useTemplateIndex.js';

/**
 * `B-232` — the two snapshots an operator-facing surface needs before it can name a row,
 * joined once so a strip does not have to know that naming takes two.
 *
 * A row's name comes from the declared BANK (its alias, else `Layer N` / `Bed N`) and what
 * it was showing comes from the template REGISTRY. Both are ordinary `useBridgeSnapshot`
 * pulls, so a surface that opens before either arrives simply names what it has and
 * re-renders when the rest lands — never a blank line and never a placeholder that could
 * be mistaken for a real name.
 *
 * ⚠ **The rule itself is NOT here.** It is `ui/operatorNaming.ts`, which is React-free and
 * unit-tested; this hook only feeds it. A surface that already holds the bank and the
 * template index — `LayersPanel` does, for the table it renders — calls `operatorRowName`
 * directly rather than taking a second copy of both snapshots through here.
 */
export function useOperatorNames(
  refs: readonly NameableRef[],
): (ref: NameableRef) => OperatorRowName {
  const bank: FixedLayerBank | null = useFixedBank();
  const templates: ReadonlyMap<string, TemplateInfo> = useTemplateIndex(
    refs.map((r) => r.templateId ?? '').filter((id) => id !== ''),
  );
  return (ref) => operatorRowName(ref, bank, templates);
}
