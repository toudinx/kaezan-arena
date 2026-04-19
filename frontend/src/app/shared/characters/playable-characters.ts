export const CHARACTER_ID_MIRAI = "character:mirai";
export const CHARACTER_ID_SYLWEN = "character:sylwen";
export const CHARACTER_ID_VELVET = "character:velvet";

export const PLAYABLE_CHARACTER_IDS = [
  CHARACTER_ID_MIRAI,
  CHARACTER_ID_SYLWEN,
  CHARACTER_ID_VELVET
] as const;

export type PlayableCharacterId = typeof PLAYABLE_CHARACTER_IDS[number];

export const DEFAULT_PLAYABLE_CHARACTER_ID: PlayableCharacterId = CHARACTER_ID_MIRAI;

export type PlayableCharacterOverview = Readonly<{
  kitLabel: string;
  passiveName: string;
  passiveDescription: string;
}>;

export const PLAYABLE_CHARACTER_OVERVIEW_BY_ID: Readonly<Record<PlayableCharacterId, PlayableCharacterOverview>> = {
  [CHARACTER_ID_MIRAI]: {
    kitLabel: "Melee AoE Kit",
    passiveName: "Bleeding Mark",
    passiveDescription: "Each hit stacks Bleeding Mark - +1 flat damage per stack on target. Resets on death."
  },
  [CHARACTER_ID_SYLWEN]: {
    kitLabel: "Cadence Archer Kit",
    passiveName: "Deadeye Grace",
    passiveDescription: "Whisper Shot builds Focus on locked target. Every 3rd hit triggers Headshot - double damage and 1s stun."
  },
  [CHARACTER_ID_VELVET]: {
    kitLabel: "Chaos Mage Kit",
    passiveName: "Arcane Decay",
    passiveDescription: "Every skill hit applies Corrosion - +5% damage taken per stack. Storm Collapse detonates stacks only inside its target-centered diamond."
  }
};

export function isPlayableCharacterId(characterId: string | null | undefined): characterId is PlayableCharacterId {
  const normalized = characterId?.trim();
  if (!normalized) {
    return false;
  }

  return PLAYABLE_CHARACTER_IDS.includes(normalized as PlayableCharacterId);
}

export function normalizeCharacterIdForPlayableRoster(characterId: string | null | undefined): string | null {
  const normalized = characterId?.trim() ?? "";
  if (normalized.length === 0) {
    return null;
  }

  if (isPlayableCharacterId(normalized)) {
    return normalized;
  }

  const isLegacyKaelisId = /^kaelis_\d+$/i.test(normalized);
  const isDeprecatedCharacterId = normalized.startsWith("character:") && !isPlayableCharacterId(normalized);
  if (isLegacyKaelisId || isDeprecatedCharacterId) {
    return DEFAULT_PLAYABLE_CHARACTER_ID;
  }

  return normalized;
}

