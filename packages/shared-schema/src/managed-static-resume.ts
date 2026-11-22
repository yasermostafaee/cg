import type { Element } from './elements.js';
import { playoutOf, type Composition, type Scene } from './scene.js';

export const CG_MANAGED_STATIC_RESUME_PAGE_MARKER =
  '<meta name="cg-managed-static-resume" content="1" />';

export const CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION = 'cg-managed-static-resume-v1';

/**
 * A managed snapshot contains absolute fields and visibility for one static page.
 * The runtime and exporter share this eligibility check before advertising resume.
 */
export function supportsManagedStaticResume(scene: Scene): boolean {
  if (scene.controlLiveLayout !== undefined) return false;
  const compositions = new Map((scene.compositions ?? []).map((doc) => [doc.id, doc]));
  const ancestors = new Set<string>();

  function isStaticDoc(doc: Scene | Composition): boolean {
    return (
      doc.lifecycle === undefined &&
      playoutOf(doc).mode === 'static' &&
      (doc.lookGroups?.length ?? 0) === 0 &&
      (doc.arrangements?.length ?? 0) === 0 &&
      (doc.bindings ?? []).every(({ target }) => target.kind === 'text') &&
      doc.layers.every(({ children }) => children.every(isStaticElement))
    );
  }

  function isStaticElement(element: Element): boolean {
    if (
      element.lifespan !== undefined ||
      element.valueRules !== undefined ||
      Object.keys(element.animation?.tracks ?? {}).length !== 0
    ) {
      return false;
    }
    switch (element.type) {
      case 'text':
      case 'shape':
      case 'path':
      case 'image':
        return true;
      case 'container':
        return element.children.every(isStaticElement);
      case 'composition': {
        const composition = compositions.get(element.compositionId);
        if (composition === undefined || ancestors.has(composition.id)) return false;
        ancestors.add(composition.id);
        const supported = isStaticDoc(composition);
        ancestors.delete(composition.id);
        return supported;
      }
      default:
        return false;
    }
  }

  return isStaticDoc(scene);
}

/** Advertise resume only when the artifact actually includes the matching runtime. */
export function managedStaticResumePageMarker(scene: Scene, runtimeJs?: string): string {
  return runtimeJs?.includes(CG_MANAGED_STATIC_RESUME_RUNTIME_VERSION) === true &&
    supportsManagedStaticResume(scene)
    ? CG_MANAGED_STATIC_RESUME_PAGE_MARKER
    : '';
}
