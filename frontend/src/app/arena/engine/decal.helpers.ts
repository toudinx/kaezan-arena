import { DecalInstance, DecalKindValue, MobArchetypeValue } from "./arena-engine.types";
import { resolveMobSpriteSemanticId } from "./mob-visuals";

export const DECAL_KIND_CORPSE: DecalKindValue = 1;

export function normalizeDecalKind(value: number | undefined): DecalKindValue {
  if (value === DECAL_KIND_CORPSE) {
    return value;
  }

  return DECAL_KIND_CORPSE;
}

export function resolveDecalSemanticId(entityType: string, mobType: MobArchetypeValue | undefined, spriteKey?: string): string {
  if (spriteKey && spriteKey.length > 0) {
    return spriteKey;
  }

  if (entityType === "mob") {
    return resolveMobSpriteSemanticId(mobType, "hit");
  }

  if (entityType === "player") {
    return "sprite.player.hit";
  }

  return "fx.hit.small";
}

export function computeDecalFadeAlpha(remainingMs: number, totalMs: number): number {
  const safeTotal = Math.max(1, totalMs);
  const ratio = clamp01(remainingMs / safeTotal);
  return 0.15 + ratio * 0.85;
}

export function toDecalKey(decal: Pick<DecalInstance, "entityId" | "createdTick">): string {
  return `${decal.entityId}:${decal.createdTick}`;
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}
