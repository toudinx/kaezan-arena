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
  ranged_shaman: {
    tone: "violet",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/orc_shaman_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/orc_shaman_run_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/orc_shaman_idle_anim_f0.png",
    sigil: "SH"
  },
  melee_skeleton: {
    tone: "slate",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/skelet_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/skelet_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/skelet_idle_anim_f0.png",
    sigil: "SK"
  },
  melee_wogol: {
    tone: "amber",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wogol_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wogol_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/wogol_idle_anim_f0.png",
    sigil: "WO"
  },
  melee_warrior: {
    tone: "amber",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/orc_warrior_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/orc_warrior_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/orc_warrior_idle_anim_f0.png",
    sigil: "WR"
  },
  melee_zombie: {
    tone: "slate",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/zombie_anim_f1.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/zombie_anim_f1.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/zombie_anim_f1.png",
    sigil: "ZM"
  },
  melee_tiny_zombie: {
    tone: "slate",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/tiny_zombie_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/tiny_zombie_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/tiny_zombie_idle_anim_f0.png",
    sigil: "TZ"
  },
  ranged_imp: {
    tone: "crimson",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/imp_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/imp_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/imp_idle_anim_f0.png",
    sigil: "IM"
  },
  ranged_swampy: {
    tone: "teal",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/swampy_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/swampy_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/swampy_anim_f0.png",
    sigil: "SW"
  },
  ranged_muddy: {
    tone: "teal",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/muddy_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/muddy_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/muddy_anim_f0.png",
    sigil: "MU"
  },
  melee_slug: {
    tone: "teal",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/tiny_slug_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/tiny_slug_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/tiny_slug_anim_f0.png",
    sigil: "SL"
  },
  elite_masked_orc: {
    tone: "amber",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/masked_orc_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/masked_orc_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/masked_orc_idle_anim_f0.png",
    sigil: "MW"
  },
  elite_pumpkin_dude: {
    tone: "crimson",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/pumpkin_dude_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/pumpkin_dude_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/pumpkin_dude_idle_anim_f0.png",
    sigil: "PH"
  },
  elite_doc: {
    tone: "teal",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/doc_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/doc_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/doc_idle_anim_f0.png",
    sigil: "DC"
  },
  elite_ice_zombie: {
    tone: "violet",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/ice_zombie_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/ice_zombie_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/ice_zombie_anim_f0.png",
    sigil: "IZ"
  },
  "boss:big_demon": {
    tone: "crimson",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_demon_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_demon_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_demon_idle_anim_f0.png",
    sigil: "DL"
  },
  "boss:big_zombie": {
    tone: "amber",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_zombie_idle_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_zombie_run_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/big_zombie_idle_anim_f0.png",
    sigil: "PT"
  },
  "boss:necromancer": {
    tone: "violet",
    imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/necromancer_anim_f0.png",
    runImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/necromancer_anim_f0.png",
    hitImageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/necromancer_anim_f0.png",
    sigil: "AS"
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
