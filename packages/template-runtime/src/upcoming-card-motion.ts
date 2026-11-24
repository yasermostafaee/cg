import type { UpcomingProgramsResolvedSceneEffect } from '@cg/shared-schema';
import type { SequenceBoundaryKind, SequenceBoundaryMotion } from './sequence-driver.js';
import { sampleTransition, type MotionBox, type MotionPose } from './sequence-motion.js';

const REST: MotionPose = { offset: { x: 0, y: 0 }, visible: true, opacity: 1 };
const HIDDEN: MotionPose = { offset: { x: 0, y: 0 }, visible: false, opacity: 0 };
export const UPCOMING_BOUNDARY_HIDDEN = '[data-cg-upcoming-boundary-hidden]';

export interface UpcomingCardMotion {
  card: HTMLElement;
  box: MotionBox;
  pose: MotionPose;
}

export function upcomingCardMotion(card: HTMLElement, box: MotionBox): UpcomingCardMotion {
  card.dataset['cgUpcomingCardMotion'] = '';
  return { card, box, pose: REST };
}

export function upcomingPageMotion(page: HTMLElement, box: MotionBox): UpcomingCardMotion {
  return { card: page, box, pose: REST };
}

function isInsideClip(pose: MotionPose, box: MotionBox): boolean {
  return (
    pose.visible &&
    pose.opacity > 0 &&
    Math.abs(pose.offset.x) < box.width &&
    Math.abs(pose.offset.y) < box.height
  );
}

function paintCard(motion: UpcomingCardMotion, pose: MotionPose): void {
  const { card, box } = motion;
  motion.pose = pose;
  const visible = isInsideClip(pose, box);
  card.toggleAttribute('data-cg-upcoming-boundary-hidden', !visible);
  card.style.visibility = visible ? '' : 'hidden';
  card.style.opacity = visible && pose.opacity === 1 ? '' : String(visible ? pose.opacity : 0);
  card.style.transform =
    pose.offset.x === 0 && pose.offset.y === 0
      ? ''
      : `translate(${String(pose.offset.x)}px, ${String(pose.offset.y)}px)`;
}

export function createUpcomingCardBoundary(
  cards: readonly UpcomingCardMotion[],
  kind: SequenceBoundaryKind,
  effect: UpcomingProgramsResolvedSceneEffect,
): SequenceBoundaryMotion | undefined {
  const { edge, durationMs, stagger } = effect;
  if (edge === 'none' || stagger === undefined) return undefined;
  const entering = kind === 'entrance';
  const visible: UpcomingCardMotion[] = [];
  for (const card of cards) {
    if (entering || isInsideClip(card.pose, card.box)) visible.push(card);
    else paintCard(card, HIDDEN);
  }
  if (stagger.order === 'last-to-first') visible.reverse();
  const starts = visible.map((card) => card.pose);
  const total = visible.length === 0 ? 0 : (visible.length - 1) * stagger.delayMs + durationMs;
  return {
    durationMs: total,
    paint(elapsedMs) {
      visible.forEach((card, index) => {
        const start = starts[index] ?? REST;
        const time = elapsedMs - index * stagger.delayMs;
        if (time < 0) {
          paintCard(card, entering ? HIDDEN : start);
          return;
        }
        if (time >= durationMs) {
          paintCard(card, entering ? REST : HIDDEN);
          return;
        }
        const frame = sampleTransition(
          {
            // The virtual fade supplies the eased progress used to leave an interrupted pose.
            inEdge: entering ? edge : 'fade',
            outEdge: entering ? 'none' : edge,
            timing: 'simultaneous',
            transitionMs: durationMs,
            box: card.box,
          },
          time,
        );
        if (entering) {
          paintCard(card, frame.in);
        } else {
          const remaining = 1 - frame.in.opacity;
          paintCard(card, {
            visible: frame.out.visible,
            opacity: start.opacity * frame.out.opacity,
            offset: {
              x: start.offset.x * remaining + frame.out.offset.x,
              y: start.offset.y * remaining + frame.out.offset.y,
            },
          });
        }
      });
    },
  };
}

export function createUpcomingPageBoundary(
  page: UpcomingCardMotion,
  kind: SequenceBoundaryKind,
  effect: UpcomingProgramsResolvedSceneEffect,
): SequenceBoundaryMotion {
  return (
    createUpcomingCardBoundary([page], kind, {
      ...effect,
      stagger: { delayMs: 0, order: 'first-to-last' },
    }) ?? { durationMs: 0, paint: () => undefined }
  );
}
