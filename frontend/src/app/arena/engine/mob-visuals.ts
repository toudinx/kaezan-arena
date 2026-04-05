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
    idle: "sprite.mob.shaman.idle",
    run: "sprite.mob.shaman.run",
    hit: "sprite.mob.shaman.hit"
  },
  5: {
    idle: "sprite.mob.skeleton.idle",
    run: "sprite.mob.skeleton.run",
    hit: "sprite.mob.skeleton.hit"
  },
  6: {
    idle: "sprite.mob.wogol.idle",
    run: "sprite.mob.wogol.run",
    hit: "sprite.mob.wogol.hit"
  },
  7: {
    idle: "sprite.mob.warrior.idle",
    run: "sprite.mob.warrior.run",
    hit: "sprite.mob.warrior.hit"
  },
  8: {
    idle: "sprite.mob.zombie.idle",
    run: "sprite.mob.zombie.run",
    hit: "sprite.mob.zombie.hit"
  },
  9: {
    idle: "sprite.mob.tiny_zombie.idle",
    run: "sprite.mob.tiny_zombie.run",
    hit: "sprite.mob.tiny_zombie.hit"
  },
  10: {
    idle: "sprite.mob.imp.idle",
    run: "sprite.mob.imp.run",
    hit: "sprite.mob.imp.hit"
  },
  11: {
    idle: "sprite.mob.swampy.idle",
    run: "sprite.mob.swampy.run",
    hit: "sprite.mob.swampy.hit"
  },
  12: {
    idle: "sprite.mob.muddy.idle",
    run: "sprite.mob.muddy.run",
    hit: "sprite.mob.muddy.hit"
  },
  13: {
    idle: "sprite.mob.slug.idle",
    run: "sprite.mob.slug.run",
    hit: "sprite.mob.slug.hit"
  }
};

const MOB_ACCENT_COLORS: Readonly<Record<MobArchetypeValue, string>> = {
  1: "#d97706",
  2: "#22d3ee",
  3: "#ef4444",
  4: "#a855f7",
  5: "#94a3b8",
  6: "#84cc16",
  7: "#f97316",
  8: "#4ade80",
  9: "#86efac",
  10: "#f43f5e",
  11: "#4d7c0f",
  12: "#78716c",
  13: "#a3e635"
};

export function normalizeMobArchetype(value: number | null | undefined): MobArchetypeValue | undefined {
  if (value === 1 || value === 2 || value === 3 || value === 4 ||
      value === 5 || value === 6 || value === 7 || value === 8 || value === 9 ||
      value === 10 || value === 11 || value === 12 || value === 13) {
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
