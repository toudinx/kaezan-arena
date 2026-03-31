export type SpeciesPortraitTone = "amber" | "teal" | "crimson" | "violet" | "slate";

export type SpeciesVisual = Readonly<{
  tone: SpeciesPortraitTone;
  imageUrl: string | null;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  sigil: string;
  monogram: string;
}>;

type SpeciesPortraitSpec = Readonly<{
  tone: SpeciesPortraitTone;
  imageUrl: string | null;
  runImageUrl: string | null;
  hitImageUrl: string | null;
  sigil: string;
}>;

const SPECIES_PORTRAIT_BY_ID: Readonly<Record<string, SpeciesPortraitSpec>> = {
  melee_brute: {
    tone: "amber",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/ogre_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/ogre_run_anim_f1.png",
    hitImageUrl: null,
    sigil: "BR"
  },
  ranged_archer: {
    tone: "teal",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/goblin_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/goblin_run_anim_f1.png",
    hitImageUrl: null,
    sigil: "AR"
  },
  melee_demon: {
    tone: "crimson",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_demon_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_demon_run_anim_f1.png",
    hitImageUrl: null,
    sigil: "DM"
  },
  ranged_dragon: {
    tone: "violet",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_run_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/lizard_m_hit_anim_f0.png",
    sigil: "DG"
  }
} as const;

const DEFAULT_SPECIES_PORTRAIT: SpeciesPortraitSpec = {
  tone: "slate",
  imageUrl: null,
  runImageUrl: null,
  hitImageUrl: null,
  sigil: "??"
};

export function resolveSpeciesVisual(input: Readonly<{
  speciesId?: string | null;
  displayName?: string | null;
}>): SpeciesVisual {
  const normalizedSpeciesId = normalizeSpeciesId(input.speciesId);
  const mapped = normalizedSpeciesId
    ? SPECIES_PORTRAIT_BY_ID[normalizedSpeciesId] ?? DEFAULT_SPECIES_PORTRAIT
    : DEFAULT_SPECIES_PORTRAIT;

  return {
    tone: mapped.tone,
    imageUrl: mapped.imageUrl,
    runImageUrl: mapped.runImageUrl,
    hitImageUrl: mapped.hitImageUrl,
    sigil: mapped.sigil,
    monogram: buildMonogram(input.displayName)
  };
}

function normalizeSpeciesId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
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

  return first.slice(0, 2).toUpperCase();
}
