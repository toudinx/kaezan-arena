import { ActorAnimationMode, MobArchetypeValue } from "./arena-engine.types";

type SpriteSet = Readonly<{
  idle: string;
  run: string;
  hit: string;
}>;

const DEFAULT_MOB_SPRITES: SpriteSet = {
  idle: "sprite.mob.slime.idle",
  run: "sprite.mob.slime.run",
  hit: "sprite.mob.slime.hit"
};

const MOB_SPRITE_SETS: Readonly<Record<MobArchetypeValue, SpriteSet>> = {
  1: {
    idle: "sprite.mob.brute.idle",
    run: "sprite.mob.brute.run",
    hit: "sprite.mob.brute.hit"
  },
  2: {
    idle: "sprite.mob.archer.idle",
    run: "sprite.mob.archer.run",
    hit: "sprite.mob.archer.hit"
  },
  3: {
    idle: "sprite.mob.demon.idle",
    run: "sprite.mob.demon.run",
    hit: "sprite.mob.demon.hit"
  },
  4: {
    idle: "sprite.mob.dragon.idle",
    run: "sprite.mob.dragon.run",
    hit: "sprite.mob.dragon.hit"
  }
};

const MOB_ACCENT_COLORS: Readonly<Record<MobArchetypeValue, string>> = {
  1: "#d97706",
  2: "#22d3ee",
  3: "#ef4444",
  4: "#a855f7"
};

export function normalizeMobArchetype(value: number | null | undefined): MobArchetypeValue | undefined {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  return undefined;
}

export function resolveMobSpriteSemanticId(
  mobType: number | null | undefined,
  mode: ActorAnimationMode
): string {
  const normalized = normalizeMobArchetype(mobType);
  const spriteSet = normalized ? MOB_SPRITE_SETS[normalized] : DEFAULT_MOB_SPRITES;
  if (mode === "run") {
    return spriteSet.run;
  }

  if (mode === "hit") {
    return spriteSet.hit;
  }

  return spriteSet.idle;
}

export function getMobArchetypeAccentColor(mobType: number | null | undefined): string {
  const normalized = normalizeMobArchetype(mobType);
  if (!normalized) {
    return "#334155";
  }

  return MOB_ACCENT_COLORS[normalized];
}
