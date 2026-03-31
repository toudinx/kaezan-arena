export type CharacterPortraitTone = "amber" | "teal" | "violet" | "emerald" | "slate";

export type CharacterPortraitVisual = Readonly<{
  tone: CharacterPortraitTone;
  imageUrl: string | null;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  sigil: string;
  monogram: string;
}>;

type CharacterPortraitSpec = Readonly<{
  tone: CharacterPortraitTone;
  imageUrl: string | null;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  sigil: string;
}>;

const CHARACTER_PORTRAIT_BY_ID: Readonly<Record<string, CharacterPortraitSpec>> = {
  "character:kina": {
    tone: "amber",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/knight_f_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/knight_f_run_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/knight_f_hit_anim_f0.png",
    sigil: "K"
  },
  "character:ranged_prototype": {
    tone: "teal",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/elf_m_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/elf_m_run_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/elf_m_hit_anim_f0.png",
    sigil: "R"
  },
  "kaelis_01": {
    tone: "violet",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_run_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_f_hit_anim_f0.png",
    sigil: "D"
  },
  "kaelis_02": {
    tone: "emerald",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_m_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_m_run_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wizzard_m_hit_anim_f0.png",
    sigil: "E"
  }
} as const;

const DEFAULT_PORTRAIT: CharacterPortraitSpec = {
  tone: "slate",
  imageUrl: null,
  runImageUrl: null,
  hitImageUrl: null,
  sigil: "?"
};

export function resolveCharacterPortraitVisual(input: Readonly<{
  characterId?: string | null;
  displayName?: string | null;
}>): CharacterPortraitVisual {
  const mapped = (input.characterId && CHARACTER_PORTRAIT_BY_ID[input.characterId]) || DEFAULT_PORTRAIT;
  return {
    tone: mapped.tone,
    imageUrl: mapped.imageUrl,
    runImageUrl: mapped.runImageUrl,
    hitImageUrl: mapped.hitImageUrl,
    sigil: mapped.sigil,
    monogram: buildMonogram(input.displayName)
  };
}

function buildMonogram(displayName: string | null | undefined): string {
  if (typeof displayName !== "string") {
    return "?";
  }

  const trimmed = displayName.trim();
  if (!trimmed) {
    return "?";
  }

  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  const first = parts[0];
  if (!first) {
    return "?";
  }

  return first.slice(0, 1).toUpperCase();
}
