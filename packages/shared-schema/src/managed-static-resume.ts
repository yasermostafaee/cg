import { sequenceStepsByOperator, type Element } from './elements.js';
import { playoutOf, type Composition, type Scene } from './scene.js';

export const CG_MANAGED_STATIC_RESUME_PAGE_MARKER =
  '<meta name="cg-managed-static-resume" content="1" />';
export const CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION = 'cg-managed-static-resume-v1';

export const CG_MANAGED_SEQUENCE_RESUME_PAGE_MARKER_NAME = 'cg-managed-sequence-resume';
export const CG_MANAGED_SEQUENCE_RESUME_RUNTIME_VERSION = 'cg-managed-sequence-resume-v1';

// The External CG v2 contract accepts absolute indexes 0 through 1,000,000.
const MAX_MANAGED_PAGE_COUNT = 1_000_001;
const SEQUENCE_MARKER_PREFIX = `<meta name="${CG_MANAGED_SEQUENCE_RESUME_PAGE_MARKER_NAME}" content="`;
const SEQUENCE_MARKER_SUFFIX = '" />';

interface ManagedResumePlan {
  readonly scene: Scene;
  readonly pageCount: number;
}

/**
 * Exporters normally flatten the selected project composition into the scene root.
 * A retained entry wrapper also needs the entry's actual layers, fields and timing.
 */
function effectiveSceneOf(scene: Scene): Scene | undefined {
  if (scene.layers.length !== 0 || scene.entryCompositionId === undefined) return scene;
  const entry = scene.compositions?.find(({ id }) => id === scene.entryCompositionId);
  if (entry === undefined) return undefined;
  return {
    ...scene,
    resolution: entry.resolution,
    defaultPosition: entry.defaultPosition ?? scene.defaultPosition,
    frameRange: entry.frameRange,
    activeRange: entry.activeRange,
    lifecycle: entry.lifecycle,
    playout: entry.playout,
    layers: entry.layers,
    fields: entry.fields ?? [],
    bindings: entry.bindings ?? [],
    lookGroups: entry.lookGroups ?? [],
    arrangements: entry.arrangements ?? [],
  };
}

/**
 * A managed snapshot contains absolute fields, visibility and a zero-based page.
 * Its one optional authored sequence is immutable and cuts between pages on request.
 */
export function managedResumePlan(scene: Scene): ManagedResumePlan | undefined {
  if (scene.controlLiveLayout !== undefined) return undefined;
  const effectiveScene = effectiveSceneOf(scene);
  if (effectiveScene === undefined) return undefined;

  const compositions = new Map((effectiveScene.compositions ?? []).map((doc) => [doc.id, doc]));
  const ancestors = new Set<string>();
  let sequencePageCount: number | undefined;

  function isStaticDoc(doc: Scene | Composition, allowSequence: boolean): boolean {
    return (
      doc.lifecycle === undefined &&
      playoutOf(doc).mode === 'static' &&
      (doc.lookGroups?.length ?? 0) === 0 &&
      (doc.arrangements?.length ?? 0) === 0 &&
      (doc.bindings ?? []).every(({ target }) => target.kind === 'text') &&
      doc.layers.every(({ children, visible }) =>
        children.every((child) => isStaticElement(child, visible, allowSequence)),
      )
    );
  }

  function isStaticElement(
    element: Element,
    parentVisible: boolean,
    allowSequence: boolean,
  ): boolean {
    if (
      element.lifespan !== undefined ||
      element.valueRules !== undefined ||
      Object.keys(element.animation?.tracks ?? {}).length !== 0
    ) {
      return false;
    }
    const visible = parentVisible && element.visible;
    switch (element.type) {
      case 'text':
      case 'shape':
      case 'path':
      case 'image':
        return true;
      case 'container':
        return element.children.every((child) => isStaticElement(child, visible, allowSequence));
      case 'composition': {
        const composition = compositions.get(element.compositionId);
        if (composition === undefined || ancestors.has(composition.id)) return false;
        ancestors.add(composition.id);
        const supported = isStaticDoc(composition, false);
        ancestors.delete(composition.id);
        return supported;
      }
      case 'sequence': {
        if (
          !allowSequence ||
          !visible ||
          sequencePageCount !== undefined ||
          !sequenceStepsByOperator(element) ||
          element.advance !== 'manual' ||
          element.repeat !== 1 ||
          element.transitionIn !== 'none' ||
          element.transitionOut !== 'none' ||
          element.items.length < 2 ||
          element.items.length > MAX_MANAGED_PAGE_COUNT ||
          !element.items.every(
            (item) =>
              item.kind !== 'composition' && (item.kind !== 'image' || item.assetId !== undefined),
          )
        ) {
          return false;
        }
        sequencePageCount = element.items.length;
        return true;
      }
      default:
        return false;
    }
  }

  return isStaticDoc(effectiveScene, true)
    ? { scene: effectiveScene, pageCount: sequencePageCount ?? 1 }
    : undefined;
}

export function managedResumePageCount(scene: Scene): number | undefined {
  return managedResumePlan(scene)?.pageCount;
}

export function supportsManagedStaticResume(scene: Scene): boolean {
  return managedResumePageCount(scene) === 1;
}

/** Bridge reads the capability from a retained artifact before pinning its exact HTML. */
export function managedResumePageCountFromHtml(html: string): number | undefined {
  const prefix = html.slice(0, 1024).replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  const openingHead =
    /^\s*(?:<!doctype\s+html\s*>\s*)?(?:<html(?:\s[^>]*)?>\s*)?<head(?:\s[^>]*)?>/i.exec(prefix);
  if (openingHead === null) return undefined;
  const head =
    prefix
      .slice(openingHead[0].length)
      .replace(/<(script|style|title)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
      .split(/<\/head\s*>|<body(?:\s|>)/i, 1)[0] ?? '';
  const sequenceMarkerAt = head.indexOf(SEQUENCE_MARKER_PREFIX);
  if (sequenceMarkerAt !== -1) {
    const valueStart = sequenceMarkerAt + SEQUENCE_MARKER_PREFIX.length;
    const valueEnd = head.indexOf(SEQUENCE_MARKER_SUFFIX, valueStart);
    if (
      valueEnd === -1 ||
      head.includes(SEQUENCE_MARKER_PREFIX, valueStart) ||
      head.includes(CG_MANAGED_STATIC_RESUME_PAGE_MARKER)
    ) {
      return undefined;
    }
    const value = head.slice(valueStart, valueEnd);
    if (!/^[1-9][0-9]{0,6}$/.test(value)) return undefined;
    const count = Number(value);
    return count >= 2 && count <= MAX_MANAGED_PAGE_COUNT ? count : undefined;
  }
  return head.includes(CG_MANAGED_STATIC_RESUME_PAGE_MARKER) ? 1 : undefined;
}

/** Advertise resume only when the artifact actually includes the matching runtime. */
export function managedStaticResumePageMarker(scene: Scene, runtimeJs?: string): string {
  const hasSequenceRuntime =
    runtimeJs?.includes(CG_MANAGED_SEQUENCE_RESUME_RUNTIME_VERSION) === true;
  const hasStaticRuntime = runtimeJs?.includes(CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION) === true;
  if (!hasSequenceRuntime && !hasStaticRuntime) return '';

  const plan = managedResumePlan(scene);
  if (plan === undefined) return '';
  if (plan.pageCount > 1) {
    return hasSequenceRuntime
      ? SEQUENCE_MARKER_PREFIX + String(plan.pageCount) + SEQUENCE_MARKER_SUFFIX
      : '';
  }
  return hasSequenceRuntime || (plan.scene === scene && hasStaticRuntime)
    ? CG_MANAGED_STATIC_RESUME_PAGE_MARKER
    : '';
}
