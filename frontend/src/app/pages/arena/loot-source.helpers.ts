import type { DropSource } from "../../api/account-api.service";

export function normalizeDropSourceType(value: string): "mob" | "chest" | "mimic" {
  const lower = value.toLowerCase();
  if (lower === "chest") return "chest";
  if (lower === "mimic") return "mimic";
  return "mob";
}

export function buildDropSourceKey(battleId: string, source: Pick<DropSource, "tick" | "sourceType" | "sourceId">): string {
  return `${battleId}:${source.tick}:${normalizeDropSourceType(source.sourceType)}:${source.sourceId}`;
}

export function dedupeDropSources(
  battleId: string,
  sources: ReadonlyArray<DropSource>,
  sentSourceKeys: Set<string>
): DropSource[] {
  const unique: DropSource[] = [];

  for (const source of sources) {
    const key = buildDropSourceKey(battleId, source);
    if (sentSourceKeys.has(key)) {
      continue;
    }

    sentSourceKeys.add(key);
    unique.push({
      ...source,
      sourceType: normalizeDropSourceType(source.sourceType)
    });
  }

  return unique;
}

export function mapMobTypeToSpecies(mobType: unknown): string | null {
  switch (mobType) {
    case 1:
      return "melee_brute";
    case 2:
      return "ranged_archer";
    case 3:
      return "melee_demon";
    case 4:
      return "ranged_shaman";
    case 5:
      return "melee_skeleton";
    case 6:
      return "melee_wogol";
    case 7:
      return "melee_warrior";
    case 8:
      return "melee_zombie";
    case 9:
      return "melee_tiny_zombie";
    case 10:
      return "ranged_imp";
    case 11:
      return "ranged_swampy";
    case 12:
      return "ranged_muddy";
    case 13:
      return "melee_slug";
    case 14:
      return "elite_masked_orc";
    case 15:
      return "elite_pumpkin_dude";
    case 16:
      return "elite_doc";
    case 17:
      return "elite_ice_zombie";
    default:
      return null;
  }
}
