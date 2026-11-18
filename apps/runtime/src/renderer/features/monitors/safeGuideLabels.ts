import type { BroadcastGuideFrameSetting } from '@cg/ui';

export const GUIDE_BORDER_LABELS: Record<
  BroadcastGuideFrameSetting['borders'][number]['percent'],
  string
> = {
  100: '100% Full frame',
  93: '93% Action',
  90: '90% Graphics',
  80: '80% Additional',
};

export function guideFrameLabel(
  frame: Pick<BroadcastGuideFrameSetting, 'aspect' | 'customAspect'>,
): string {
  if (frame.aspect === 'auto') return 'Auto';
  if (frame.aspect !== 'custom') return frame.aspect;
  const ratio = frame.customAspect;
  return ratio === undefined ? 'Custom' : `Custom ${String(ratio.width)}:${String(ratio.height)}`;
}
