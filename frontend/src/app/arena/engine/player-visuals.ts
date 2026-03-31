import { ActorAnimationMode } from "./arena-engine.types";

type PlayerSpriteSet = Readonly<{
  idle: string;
  run: string;
  hit: string;
}>;

const DEFAULT_PLAYER_SPRITE_SET: PlayerSpriteSet = {
  idle: "sprite.player.idle",
  run: "sprite.player.run",
  hit: "sprite.player.hit"
};

const PLAYER_SPRITE_SET_BY_CHARACTER_ID: Readonly<Record<string, PlayerSpriteSet>> = {
  "character:kina": {
    idle: "sprite.player.kina.idle",
    run: "sprite.player.kina.run",
    hit: "sprite.player.kina.hit"
  },
  "character:ranged_prototype": {
    idle: "sprite.player.ranged_prototype.idle",
    run: "sprite.player.ranged_prototype.run",
    hit: "sprite.player.ranged_prototype.hit"
  },
  // Legacy persisted IDs kept for backward compatibility with pre-migration accounts.
  kaelis_01: {
    idle: "sprite.player.kaelis_dawn.idle",
    run: "sprite.player.kaelis_dawn.run",
    hit: "sprite.player.kaelis_dawn.hit"
  },
  kaelis_02: {
    idle: "sprite.player.kaelis_ember.idle",
    run: "sprite.player.kaelis_ember.run",
    hit: "sprite.player.kaelis_ember.hit"
  }
};

const PLAYER_SPRITE_ASSET_IDS_FOR_PRELOAD = Array.from(new Set<string>([
  DEFAULT_PLAYER_SPRITE_SET.idle,
  DEFAULT_PLAYER_SPRITE_SET.run,
  DEFAULT_PLAYER_SPRITE_SET.hit,
  ...Object.values(PLAYER_SPRITE_SET_BY_CHARACTER_ID).flatMap((set) => [set.idle, set.run, set.hit])
]));

export function resolvePlayerSpriteSemanticId(
  characterId: string | null | undefined,
  mode: ActorAnimationMode
): string {
  const spriteSet = resolvePlayerSpriteSet(characterId);
  if (mode === "run") {
    return spriteSet.run;
  }

  if (mode === "hit") {
    return spriteSet.hit;
  }

  return spriteSet.idle;
}

export function getPlayerSpriteAssetIdsForPreload(): ReadonlyArray<string> {
  return PLAYER_SPRITE_ASSET_IDS_FOR_PRELOAD;
}

function resolvePlayerSpriteSet(characterId: string | null | undefined): PlayerSpriteSet {
  const normalized = characterId?.trim() ?? "";
  if (!normalized) {
    return DEFAULT_PLAYER_SPRITE_SET;
  }

  return PLAYER_SPRITE_SET_BY_CHARACTER_ID[normalized] ?? DEFAULT_PLAYER_SPRITE_SET;
}

