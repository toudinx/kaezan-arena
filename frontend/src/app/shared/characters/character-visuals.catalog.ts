export type CharacterPortraitTone = "amber" | "teal" | "violet" | "emerald" | "slate";

export type CharacterPortraitContext = "homepage" | "prerun" | "kaelis" | "roster";

export type CharacterGameplaySpriteSet = Readonly<{
  idle: string;
  run: string;
  hit: string;
}>;

type CharacterPortraitAssetSet = Readonly<Record<CharacterPortraitContext, string | null>>;

type CharacterSkinVisualSpec = Readonly<{
  portraits: CharacterPortraitAssetSet;
  gameplay: CharacterGameplaySpriteSet;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  tone?: CharacterPortraitTone;
  sigil?: string;
}>;

type CharacterVisualSpec = Readonly<{
  aliases?: ReadonlyArray<string>;
  displayName: string;
  defaultSkinId: string;
  tone: CharacterPortraitTone;
  sigil: string;
  skins: Readonly<Record<string, CharacterSkinVisualSpec>>;
}>;

export type CharacterResolvedVisualSpec = Readonly<{
  canonicalCharacterId: string;
  resolvedSkinId: string;
  tone: CharacterPortraitTone;
  sigil: string;
  portraits: CharacterPortraitAssetSet;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  gameplay: CharacterGameplaySpriteSet;
}>;

const CHARACTER_VISUALS_BY_ID: Readonly<Record<string, CharacterVisualSpec>> = {
  "character:mirai": {
    displayName: "Mirai",
    defaultSkinId: "m",
    tone: "teal",
    sigil: "M",
    skins: {
      m: {
        portraits: {
          homepage: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_idle_anim_f0.png",
          prerun: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_run_anim_f1.png",
          kaelis: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_idle_anim_f0.png",
          roster: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_idle_anim_f0.png"
        },
        gameplay: {
          idle: "sprite.player.lizard_m.idle",
          run: "sprite.player.lizard_m.run",
          hit: "sprite.player.lizard_m.hit"
        },
        runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_run_anim_f1.png",
        hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_hit_anim_f0.png"
      }
    }
  },
  "character:sylwen": {
    displayName: "Sylwen",
    defaultSkinId: "1",
    tone: "teal",
    sigil: "S",
    skins: {
      "1": {
        portraits: {
          homepage: "/assets/packs/arena_v1_0x72_bdragon/sprites/sylwen_homepage_1.jpg",
          prerun: "/assets/packs/arena_v1_0x72_bdragon/sprites/sylwen_prerun_1.png",
          kaelis: "/assets/packs/arena_v1_0x72_bdragon/sprites/sylwen_kaelis_1.png",
          roster: "/assets/packs/arena_v1_0x72_bdragon/sprites/sylwen_gameplay_1_idle_f0.png"
        },
        gameplay: {
          idle: "sprite.player.sylwen.1.idle",
          run: "sprite.player.sylwen.1.run",
          hit: "sprite.player.sylwen.1.hit"
        },
        runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/sylwen_gameplay_1_run_f1.png",
        hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/sylwen_gameplay_1_hit_f0.png"
      }
    }
  },
  "character:velvet": {
    displayName: "Velvet",
    defaultSkinId: "1",
    tone: "violet",
    sigil: "V",
    skins: {
      "1": {
        portraits: {
          homepage: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_idle_anim_f0.png",
          prerun: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_run_anim_f1.png",
          kaelis: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_idle_anim_f0.png",
          roster: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_idle_anim_f0.png"
        },
        gameplay: {
          idle: "sprite.player.kaelis_dawn.idle",
          run: "sprite.player.kaelis_dawn.run",
          hit: "sprite.player.kaelis_dawn.hit"
        },
        runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_run_anim_f1.png",
        hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_hit_anim_f0.png"
      }
    }
  }
} as const;

const CHARACTER_ID_ALIAS_TO_CANONICAL = buildAliasMap(CHARACTER_VISUALS_BY_ID);

export function resolveCharacterVisualSpec(input: Readonly<{
  characterId?: string | null;
  skinId?: string | number | null;
}>): CharacterResolvedVisualSpec | null {
  const canonicalCharacterId = resolveCanonicalCharacterId(input.characterId);
  if (!canonicalCharacterId) {
    return null;
  }

  const characterSpec = CHARACTER_VISUALS_BY_ID[canonicalCharacterId];
  if (!characterSpec) {
    return null;
  }

  const resolvedSkinId = resolveSkinId(characterSpec, input.skinId);
  const skinSpec = characterSpec.skins[resolvedSkinId];
  if (!skinSpec) {
    return null;
  }

  return {
    canonicalCharacterId,
    resolvedSkinId,
    tone: skinSpec.tone ?? characterSpec.tone,
    sigil: skinSpec.sigil ?? characterSpec.sigil,
    portraits: skinSpec.portraits,
    runImageUrl: skinSpec.runImageUrl,
    hitImageUrl: skinSpec.hitImageUrl,
    gameplay: skinSpec.gameplay
  };
}

export function resolveCharacterDisplayName(input: Readonly<{
  characterId?: string | null;
  preferredName?: string | null;
}>): string {
  const preferredName = input.preferredName?.trim() ?? "";
  const canonicalCharacterId = resolveCanonicalCharacterId(input.characterId);
  if (!canonicalCharacterId) {
    return preferredName;
  }

  const characterSpec = CHARACTER_VISUALS_BY_ID[canonicalCharacterId];
  if (!characterSpec) {
    return preferredName;
  }

  if (!preferredName) {
    return characterSpec.displayName;
  }

  return preferredName;
}

export function listCharacterGameplaySpriteSets(): ReadonlyArray<CharacterGameplaySpriteSet> {
  const uniqueByKey = new Map<string, CharacterGameplaySpriteSet>();
  for (const characterSpec of Object.values(CHARACTER_VISUALS_BY_ID)) {
    for (const skinSpec of Object.values(characterSpec.skins)) {
      const gameplay = skinSpec.gameplay;
      const key = `${gameplay.idle}|${gameplay.run}|${gameplay.hit}`;
      if (!uniqueByKey.has(key)) {
        uniqueByKey.set(key, gameplay);
      }
    }
  }

  return Array.from(uniqueByKey.values());
}

function resolveCanonicalCharacterId(characterId: string | null | undefined): string | null {
  const normalized = characterId?.trim();
  if (!normalized) {
    return null;
  }

  return CHARACTER_ID_ALIAS_TO_CANONICAL[normalized] ?? normalized;
}

function resolveSkinId(characterSpec: CharacterVisualSpec, requestedSkinId: string | number | null | undefined): string {
  const normalizedRequestedSkinId = normalizeSkinId(requestedSkinId);
  if (normalizedRequestedSkinId && characterSpec.skins[normalizedRequestedSkinId]) {
    return normalizedRequestedSkinId;
  }

  if (characterSpec.skins[characterSpec.defaultSkinId]) {
    return characterSpec.defaultSkinId;
  }

  const firstAvailableSkinId = Object.keys(characterSpec.skins)[0];
  return firstAvailableSkinId ?? "1";
}

function normalizeSkinId(skinId: string | number | null | undefined): string | null {
  if (skinId === null || skinId === undefined) {
    return null;
  }

  const normalized = String(skinId).trim();
  return normalized.length > 0 ? normalized : null;
}

function buildAliasMap(
  characterVisualsById: Readonly<Record<string, CharacterVisualSpec>>
): Readonly<Record<string, string>> {
  const aliasMap: Record<string, string> = {};
  for (const [characterId, characterSpec] of Object.entries(characterVisualsById)) {
    aliasMap[characterId] = characterId;
    for (const alias of characterSpec.aliases ?? []) {
      aliasMap[alias] = characterId;
    }
  }

  return aliasMap;
}
