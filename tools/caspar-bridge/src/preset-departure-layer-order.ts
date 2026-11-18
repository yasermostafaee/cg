import {
  framePlacementRects,
  lookPlateMasks,
  lookPlateReveals,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import { intersectNormalizedRects, type LiveFramePlacement } from '@cg/shared-schema';
import type { LookBindingPlan } from './live-look-bindings.js';
import type { LiveLayerOrder } from './live-plate-seating.js';

interface OrdinarySeat {
  readonly seatId: string;
  readonly plateId: string;
  readonly routeFrom?: string;
  readonly sharedInputFrom?: string;
  readonly revealOverlay?: true;
}

/**
 * A fresh native stack can put a larger-preset-only picture below pictures retained in
 * every smaller preset. Its departure may then cross behind them instead of falling
 * back to a stationary fade. These are optional preferences, never authored paint order.
 * Ambiguous aliases, fragment groups and masks keep the existing allocation unchanged.
 */
export function presetDepartureLayerOrder(input: {
  readonly carrier: TemplateLiveSources;
  readonly bindings: LookBindingPlan;
  readonly seated: readonly OrdinarySeat[];
  readonly framePlacements?: readonly LiveFramePlacement[] | undefined;
  readonly extrasByPlate: ReadonlyMap<string, readonly string[]>;
  /** Generated Focus looks are not authored preset membership. */
  readonly normalLookIds?: ReadonlySet<string> | undefined;
}): LiveLayerOrder[] {
  const { carrier, bindings, seated, framePlacements, extrasByPlate, normalLookIds } = input;
  const looks = (carrier.looks ?? []).filter(({ id }) => normalLookIds?.has(id) !== false);
  if (looks.length < 2) return [];
  const copiedInputs = new Set(
    [...bindings.seats.values()].flatMap(({ routeFrom }) =>
      routeFrom === undefined ? [] : [routeFrom],
    ),
  );
  const stage = { x: 0, y: 0, ...carrier.resolution };
  const members = seated.map((seat) => {
    const demand = bindings.seats.get(seat.seatId);
    if (
      seat.routeFrom !== undefined ||
      seat.sharedInputFrom !== undefined ||
      seat.revealOverlay === true ||
      copiedInputs.has(seat.seatId) ||
      (extrasByPlate.get(seat.plateId)?.length ?? 0) !== 0 ||
      demand === undefined ||
      new Set(demand.frames.map(({ plateId }) => plateId)).size !== 1
    )
      return undefined;
    const visible = new Set<string>();
    let departure = false;
    for (const look of looks) {
      const frame = demand.frames.find(({ lookId }) => lookId === look.id);
      if (frame === undefined) continue;
      const masks = lookPlateMasks(carrier, look.id);
      const reveals = lookPlateReveals(carrier, look.id);
      if (
        masks[frame.plateId] !== undefined ||
        reveals[frame.plateId] !== undefined ||
        Object.values(reveals).some(({ targetSourceId }) => targetSourceId === frame.plateId)
      )
        return undefined;
      const rect = framePlacementRects(carrier, look.id, framePlacements)[frame.plateId];
      if (rect === undefined || intersectNormalizedRects(rect, stage) === null) continue;
      visible.add(look.id);
      if (
        look.transitionFrames?.[frame.plateId] !== undefined &&
        Object.values(look.transitionDepartureGroups ?? {}).some(
          (routes) => routes.length === 1 && routes[0] === frame.plateId,
        )
      )
        departure = true;
    }
    return { visible, departure };
  });
  const order: LiveLayerOrder[] = [];
  for (const [lower, member] of members.entries()) {
    if (member === undefined || !member.departure || member.visible.size === 0) continue;
    for (const [upper, retained] of members.entries()) {
      if (retained === undefined || member.visible.size >= retained.visible.size) continue;
      if ([...member.visible].every((lookId) => retained.visible.has(lookId)))
        order.push([lower, upper]);
    }
  }
  return order;
}
