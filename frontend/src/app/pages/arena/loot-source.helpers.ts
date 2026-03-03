import type { DropSource } from "../../api/account-api.service";

export function normalizeDropSourceType(value: string): "mob" | "chest" {
  return value.toLowerCase() === "chest" ? "chest" : "mob";
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
  if (mobType === 1) {
    return "melee_brute";
  }

  if (mobType === 2) {
    return "ranged_archer";
  }

  if (mobType === 3) {
    return "melee_demon";
  }

  if (mobType === 4) {
    return "ranged_dragon";
  }

  return null;
}
