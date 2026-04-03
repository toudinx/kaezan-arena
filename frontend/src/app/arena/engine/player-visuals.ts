import { ActorAnimationMode } from "./arena-engine.types";
import { listCharacterGameplaySpriteSets, resolveCharacterVisualSpec } from "../../shared/characters/character-visuals.catalog";

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

const PLAYER_SPRITE_ASSET_IDS_FOR_PRELOAD = Array.from(new Set<string>([
  DEFAULT_PLAYER_SPRITE_SET.idle,
  DEFAULT_PLAYER_SPRITE_SET.run,
  DEFAULT_PLAYER_SPRITE_SET.hit,
  ...listCharacterGameplaySpriteSets().flatMap((set) => [set.idle, set.run, set.hit])
]));

export function resolvePlayerSpriteSemanticId(
  characterId: string | null | undefined,
  mode: ActorAnimationMode,
  skinId?: string | number | null
): string {
  const spriteSet = resolvePlayerSpriteSet(characterId, skinId);
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

function resolvePlayerSpriteSet(characterId: string | null | undefined, skinId?: string | number | null): PlayerSpriteSet {
  const visualSpec = resolveCharacterVisualSpec({ characterId, skinId });
  return visualSpec?.gameplay ?? DEFAULT_PLAYER_SPRITE_SET;
}
