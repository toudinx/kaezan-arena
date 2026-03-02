import { CombatFxKindValue, TilePos } from "./arena-engine.types";

export const COMBAT_FX_MELEE_SWING: CombatFxKindValue = 1;
export const COMBAT_FX_RANGED_PROJECTILE: CombatFxKindValue = 2;
export const COMBAT_FX_SKILL_CAST: CombatFxKindValue = 3;
export const COMBAT_FX_HIT_IMPACT: CombatFxKindValue = 4;
export const COMBAT_FX_DEATH_BURST: CombatFxKindValue = 5;

export function normalizeCombatFxKind(value: number | undefined): CombatFxKindValue {
  if (
    value === COMBAT_FX_MELEE_SWING ||
    value === COMBAT_FX_RANGED_PROJECTILE ||
    value === COMBAT_FX_SKILL_CAST ||
    value === COMBAT_FX_HIT_IMPACT ||
    value === COMBAT_FX_DEATH_BURST
  ) {
    return value;
  }

  return COMBAT_FX_HIT_IMPACT;
}

export function computeDirectionAngleRad(fromPos: TilePos, toPos: TilePos): number {
  const deltaX = toPos.x - fromPos.x;
  const deltaY = toPos.y - fromPos.y;
  if (deltaX === 0 && deltaY === 0) {
    return 0;
  }

  return Math.atan2(deltaY, deltaX);
}

export function computeNormalizedProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 1;
  }

  const progress = elapsedMs / durationMs;
  if (progress <= 0) {
    return 0;
  }

  if (progress >= 1) {
    return 1;
  }

  return progress;
}

export function interpolateLinear(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
