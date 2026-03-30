export type ItemIconTone = "weapon" | "armor" | "relic" | "unknown";

export type ItemVisual = Readonly<{
  iconImageUrl: string | null;
  iconGlyph: string;
  tone: ItemIconTone;
}>;

type WeaponVisualSpec = Readonly<{
  glyph: string;
  imageUrl: string;
}>;

const WEAPON_VISUALS: Readonly<Record<string, WeaponVisualSpec>> = {
  sword: { glyph: "SW", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_knight_sword.png" },
  axe: { glyph: "AX", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_axe.png" },
  bow: { glyph: "BW", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_bow.png" },
  staff: { glyph: "ST", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_green_magic_staff.png" },
  mace: { glyph: "MC", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_mace.png" },
  hammer: { glyph: "HM", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_hammer.png" },
  spear: { glyph: "SP", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_spear.png" },
  dagger: { glyph: "DG", imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_knife.png" }
};

const DEFAULT_WEAPON_VISUAL: WeaponVisualSpec = {
  glyph: "WP",
  imageUrl: "/assets/packs/arena_v1_0x72_bdragon/sprites/weapon_regular_sword.png"
};

export function resolveItemVisual(input: Readonly<{
  slot?: string | null;
  weaponClass?: string | null;
  displayName?: string | null;
  definitionId?: string | null;
}>): ItemVisual {
  const slot = normalizeToken(input.slot);
  if (slot === "armor") {
    return { iconImageUrl: null, iconGlyph: "AR", tone: "armor" };
  }

  if (slot === "relic") {
    return { iconImageUrl: null, iconGlyph: "RL", tone: "relic" };
  }

  if (slot === "weapon") {
    const weaponClass = resolveWeaponClass(input.weaponClass, input.displayName, input.definitionId);
    const spec = WEAPON_VISUALS[weaponClass] ?? DEFAULT_WEAPON_VISUAL;
    return { iconImageUrl: spec.imageUrl, iconGlyph: spec.glyph, tone: "weapon" };
  }

  return { iconImageUrl: null, iconGlyph: "IT", tone: "unknown" };
}

function resolveWeaponClass(
  weaponClass: string | null | undefined,
  displayName: string | null | undefined,
  definitionId: string | null | undefined
): string {
  const normalizedClass = normalizeToken(weaponClass);
  if (normalizedClass && WEAPON_VISUALS[normalizedClass]) {
    return normalizedClass;
  }

  const mergedLabel = `${displayName ?? ""} ${definitionId ?? ""}`.toLowerCase();
  if (mergedLabel.includes("sword")) return "sword";
  if (mergedLabel.includes("axe")) return "axe";
  if (mergedLabel.includes("bow")) return "bow";
  if (mergedLabel.includes("staff")) return "staff";
  if (mergedLabel.includes("mace")) return "mace";
  if (mergedLabel.includes("hammer")) return "hammer";
  if (mergedLabel.includes("spear")) return "spear";
  if (mergedLabel.includes("knife") || mergedLabel.includes("dagger")) return "dagger";
  return "weapon";
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
