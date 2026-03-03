import type { DropEvent, ItemDefinition } from "../../api/account-api.service";

export type LootConsoleRarity = "common" | "rare" | "epic" | "other";

export type LootConsoleLineItem = Readonly<{
  itemId: string;
  displayName: string;
  quantity: number;
  rarity: LootConsoleRarity;
}>;

export type LootConsoleLine = Readonly<{
  groupKey: string;
  battleId: string;
  tick: number;
  sourceType: DropEvent["sourceType"];
  sourceId: string;
  items: ReadonlyArray<LootConsoleLineItem>;
}>;

type MutableLootLineGroup = {
  groupKey: string;
  battleId: string;
  tick: number;
  sourceType: DropEvent["sourceType"];
  sourceId: string;
  awardedAtMs: number | null;
  itemTotals: Record<string, number>;
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
    const groupKey = buildLootConsoleGroupKey(event);
    const existing = byKey.get(groupKey);
    if (!existing) {
      byKey.set(groupKey, {
        groupKey,
        battleId: event.battleId,
        tick: event.tick,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        awardedAtMs: toEpochMs(event.awardedAtUtc),
        itemTotals: {
          [event.itemId]: Math.max(1, event.quantity)
        }
      });
      continue;
    }

    existing.itemTotals[event.itemId] = (existing.itemTotals[event.itemId] ?? 0) + Math.max(1, event.quantity);
    const nextEventMs = toEpochMs(event.awardedAtUtc);
    if (nextEventMs !== null) {
      existing.awardedAtMs = existing.awardedAtMs === null ? nextEventMs : Math.max(existing.awardedAtMs, nextEventMs);
    }
  }

  const groups = Array.from(byKey.values()).sort(compareLootGroupsOldestFirst);
  return groups.map((group) => ({
    groupKey: group.groupKey,
    battleId: group.battleId,
    tick: group.tick,
    sourceType: group.sourceType,
    sourceId: group.sourceId,
    items: Object.entries(group.itemTotals)
      .map(([itemId, quantity]) => ({
        itemId,
        quantity,
        displayName: itemCatalogById[itemId]?.displayName ?? itemId,
        rarity: normalizeLootRarity(itemCatalogById[itemId]?.rarity)
      }))
      .sort(compareLineItems)
  }));
}

export function buildLootConsoleGroupKey(event: Pick<DropEvent, "battleId" | "tick" | "sourceType" | "sourceId">): string {
  return `${event.battleId}|${event.tick}|${event.sourceType}|${event.sourceId}`;
}

export function formatLootConsoleLineText(line: LootConsoleLine): string {
  const itemsText = line.items.map((item) => `${item.quantity}x ${item.displayName}`).join(", ");
  return `Loot (${line.sourceType}@${line.tick}): ${itemsText}`;
}

export function lootItemRarityClass(item: Pick<LootConsoleLineItem, "rarity">): string {
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

  return left.itemId.localeCompare(right.itemId, undefined, { sensitivity: "base" });
}

function normalizeLootRarity(value: ItemDefinition["rarity"] | undefined): LootConsoleRarity {
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
