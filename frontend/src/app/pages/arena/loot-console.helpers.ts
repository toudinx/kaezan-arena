import type { DropEvent, ItemDefinition } from "../../api/account-api.service";

export type LootConsoleRarity = "common" | "rare" | "epic" | "legendary" | "ascendant" | "sigil" | "other";
export type LootConsoleRewardKind = DropEvent["rewardKind"];

export type LootConsoleLineItem = Readonly<{
  itemKey: string;
  itemId: string;
  displayName: string;
  quantity: number;
  rarity: LootConsoleRarity;
  rewardKind: LootConsoleRewardKind;
  species: string | null;
  isInventoryItem: boolean;
}>;

export type LootConsoleLine = Readonly<{
  groupKey: string;
  battleId: string;
  tick: number;
  sourceType: DropEvent["sourceType"];
  sourceId: string;
  items: ReadonlyArray<LootConsoleLineItem>;
}>;

type MutableLootItemTotal = {
  itemKey: string;
  itemId: string;
  quantity: number;
  rewardKind: LootConsoleRewardKind;
  species: string | null;
  sigilLevel: number | null;
  slotIndex: number | null;
};

type MutableLootLineGroup = {
  groupKey: string;
  battleId: string;
  tick: number;
  sourceType: DropEvent["sourceType"];
  sourceId: string;
  awardedAtMs: number | null;
  itemTotals: Record<string, MutableLootItemTotal>;
};

export function groupDropEventsToLootConsoleLines(
  events: ReadonlyArray<DropEvent>,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>
): LootConsoleLine[] {
  if (events.length === 0) {
    return [];
  }

  const byKey = new Map<string, MutableLootLineGroup>();
  for (const event of events) {
    const rewardKind = normalizeRewardKind(event.rewardKind);
    const species = normalizeSpecies(event.species);
    const sigilLevel = normalizeOptionalNumber(event.sigilLevel);
    const slotIndex = normalizeOptionalNumber(event.slotIndex);
    const itemKey = buildLineItemKey(rewardKind, event.itemId, species, sigilLevel, slotIndex);
    const groupKey = buildLootConsoleGroupKey(event);
    const existingGroup = byKey.get(groupKey);
    if (!existingGroup) {
      byKey.set(groupKey, {
        groupKey,
        battleId: event.battleId,
        tick: event.tick,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        awardedAtMs: toEpochMs(event.awardedAtUtc),
        itemTotals: {
          [itemKey]: {
            itemKey,
            itemId: event.itemId,
            quantity: Math.max(1, event.quantity),
            rewardKind,
            species,
            sigilLevel,
            slotIndex
          }
        }
      });
      continue;
    }

    const existingItem = existingGroup.itemTotals[itemKey];
    if (!existingItem) {
      existingGroup.itemTotals[itemKey] = {
        itemKey,
        itemId: event.itemId,
        quantity: Math.max(1, event.quantity),
        rewardKind,
        species,
        sigilLevel,
        slotIndex
      };
    } else {
      existingItem.quantity += Math.max(1, event.quantity);
    }

    const nextEventMs = toEpochMs(event.awardedAtUtc);
    if (nextEventMs !== null) {
      existingGroup.awardedAtMs =
        existingGroup.awardedAtMs === null ? nextEventMs : Math.max(existingGroup.awardedAtMs, nextEventMs);
    }
  }

  const groups = Array.from(byKey.values()).sort(compareLootGroupsOldestFirst);
  return groups.map((group) => ({
    groupKey: group.groupKey,
    battleId: group.battleId,
    tick: group.tick,
    sourceType: group.sourceType,
    sourceId: group.sourceId,
    items: Object.values(group.itemTotals).map((item) => toLineItem(item, itemCatalogById)).sort(compareLineItems)
  }));
}

export function buildLootConsoleGroupKey(event: Pick<DropEvent, "battleId" | "tick" | "sourceType" | "sourceId">): string {
  return `${event.battleId}|${event.tick}|${event.sourceType}|${event.sourceId}`;
}

export function formatLootConsoleLineText(line: LootConsoleLine): string {
  const itemsText = line.items.map((item) => formatLootConsoleItemText(item)).join(", ");
  return `Loot (${line.sourceType}@${line.tick}): ${itemsText}`;
}

export function formatLootConsoleItemText(item: LootConsoleLineItem): string {
  if (item.rewardKind === "item") {
    return `${item.quantity}x ${item.displayName}`;
  }

  return `+${item.quantity} ${item.displayName}`;
}

export function lootItemRarityClass(item: Pick<LootConsoleLineItem, "rarity">): string {
  if (item.rarity === "sigil") {
    return "loot-console__item-link--sigil";
  }

  if (item.rarity === "ascendant") {
    return "loot-console__item-link--ascendant";
  }

  if (item.rarity === "legendary") {
    return "loot-console__item-link--legendary";
  }

  if (item.rarity === "rare") {
    return "loot-console__item-link--rare";
  }

  if (item.rarity === "epic") {
    return "loot-console__item-link--epic";
  }

  if (item.rarity === "common") {
    return "loot-console__item-link--common";
  }

  return "loot-console__item-link--other";
}

export function shouldAutoScrollConsole(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  thresholdPx = 24
): boolean {
  if (scrollHeight <= 0 || clientHeight <= 0) {
    return true;
  }

  const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
  return distanceFromBottom <= thresholdPx;
}

function compareLootGroupsOldestFirst(left: MutableLootLineGroup, right: MutableLootLineGroup): number {
  if (left.awardedAtMs !== null || right.awardedAtMs !== null) {
    const leftMs = left.awardedAtMs ?? Number.MIN_SAFE_INTEGER;
    const rightMs = right.awardedAtMs ?? Number.MIN_SAFE_INTEGER;
    if (leftMs !== rightMs) {
      return leftMs - rightMs;
    }
  }

  if (left.tick !== right.tick) {
    return left.tick - right.tick;
  }

  const byBattleId = left.battleId.localeCompare(right.battleId);
  if (byBattleId !== 0) {
    return byBattleId;
  }

  const bySourceType = left.sourceType.localeCompare(right.sourceType);
  if (bySourceType !== 0) {
    return bySourceType;
  }

  return left.sourceId.localeCompare(right.sourceId);
}

function compareLineItems(left: LootConsoleLineItem, right: LootConsoleLineItem): number {
  const byName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }

  return left.itemKey.localeCompare(right.itemKey, undefined, { sensitivity: "base" });
}

function normalizeLootRarity(value: ItemDefinition["rarity"] | undefined): LootConsoleRarity {
  if (value === "ascendant") {
    return "ascendant";
  }

  if (value === "legendary") {
    return "legendary";
  }

  if (value === "rare") {
    return "rare";
  }

  if (value === "epic") {
    return "epic";
  }

  if (value === "common") {
    return "common";
  }

  return "other";
}

function toEpochMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRewardKind(value: DropEvent["rewardKind"] | undefined): LootConsoleRewardKind {
  if (value === "echo_fragments" || value === "primal_core" || value === "sigil") {
    return value;
  }

  return "item";
}

function normalizeSpecies(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildLineItemKey(
  rewardKind: LootConsoleRewardKind,
  itemId: string,
  species: string | null,
  sigilLevel: number | null,
  slotIndex: number | null
): string {
  return `${rewardKind}|${itemId}|${species ?? ""}|${sigilLevel ?? ""}|${slotIndex ?? ""}`;
}

function toLineItem(
  item: MutableLootItemTotal,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>
): LootConsoleLineItem {
  if (item.rewardKind === "echo_fragments") {
    return {
      itemKey: item.itemKey,
      itemId: item.itemId,
      displayName: "Echo Fragments",
      quantity: item.quantity,
      rarity: "other",
      rewardKind: item.rewardKind,
      species: item.species,
      isInventoryItem: false
    };
  }

  if (item.rewardKind === "primal_core") {
    const species = item.species ?? "unknown_species";
    return {
      itemKey: item.itemKey,
      itemId: item.itemId,
      displayName: `Primal Core (${formatSpeciesLabel(species)})`,
      quantity: item.quantity,
      rarity: "other",
      rewardKind: item.rewardKind,
      species: item.species,
      isInventoryItem: false
    };
  }

  if (item.rewardKind === "sigil") {
    const species = item.species ?? "unknown_species";
    const safeLevel = Math.max(1, item.sigilLevel ?? 1);
    const safeSlotIndex = Math.max(1, item.slotIndex ?? 1);
    return {
      itemKey: item.itemKey,
      itemId: item.itemId,
      displayName: `Sigil - ${formatSpeciesLabel(species)} Lv.${safeLevel} (Slot ${safeSlotIndex})`,
      quantity: item.quantity,
      rarity: "sigil",
      rewardKind: item.rewardKind,
      species: item.species,
      isInventoryItem: false
    };
  }

  const definition = itemCatalogById[item.itemId];
  return {
    itemKey: item.itemKey,
    itemId: item.itemId,
    displayName: definition?.displayName ?? item.itemId,
    quantity: item.quantity,
    rarity: normalizeLootRarity(definition?.rarity),
    rewardKind: item.rewardKind,
    species: item.species,
    isInventoryItem: true
  };
}

function normalizeOptionalNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.floor(value);
}

function formatSpeciesLabel(species: string): string {
  return species
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
