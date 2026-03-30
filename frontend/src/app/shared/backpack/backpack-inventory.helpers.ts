import type {
  CharacterState,
  EquipmentDefinition,
  ItemDefinition,
  OwnedEquipmentInstance
} from "../../api/account-api.service";

export type BackpackFilter = "all" | "weapons" | "armor" | "relics";

type BackpackEquipmentSlot = "weapon" | "armor" | "relic" | "unknown";

export type BackpackSlot = Readonly<{
  slotId: string;
  kind: "equipment";
  slot: BackpackEquipmentSlot;
  itemId: string;
  definitionId: string;
  displayName: string;
  rarity: string;
  quantity: number;
  instanceId: string;
  originSpeciesId: string | null;
  weaponClass: string | null;
  weaponElement: string | null;
  slotLabel: string;
  rarityLabel: string;
  typeLabel: string;
  impactBadges: ReadonlyArray<string>;
  shortStatSummary: string;
  detailStatLines: ReadonlyArray<string>;
  isWeapon: boolean;
  isEquipped: boolean;
  inspectLabel: string;
}>;

type NamedEquipmentInstance = Readonly<{
  instanceId: string;
  definitionId: string;
  displayName: string;
  rarity: string;
  originSpeciesId: string | null;
  slot: BackpackEquipmentSlot;
  weaponClass: string | null;
  weaponElement: string | null;
  gameplayModifiers: Readonly<Record<string, string>>;
  isWeapon: boolean;
  isEquipped: boolean;
}>;

const SLOT_LABELS: Readonly<Record<BackpackEquipmentSlot, string>> = {
  weapon: "Weapon",
  armor: "Armor",
  relic: "Relic",
  unknown: "Equipment"
};

const SLOT_SORT_ORDER: Readonly<Record<BackpackEquipmentSlot, number>> = {
  weapon: 0,
  armor: 1,
  relic: 2,
  unknown: 3
};

const RARITY_SORT_ORDER: Readonly<Record<string, number>> = {
  ascendant: 5,
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1
};

export function mapInventoryToBackpackSlots(
  character: CharacterState | null,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>,
  equipmentCatalogByItemId: Readonly<Record<string, EquipmentDefinition>>
): BackpackSlot[] {
  if (!character) {
    return [];
  }

  const equippedInstanceIds = new Set<string>(
    [
      character.equipment.weaponInstanceId,
      character.equipment.armorInstanceId,
      character.equipment.relicInstanceId
    ].filter((value): value is string => !!value)
  );

  return Object.values(character.inventory.equipmentInstances)
    .map((instance) =>
      toNamedEquipmentInstance(
        instance,
        equippedInstanceIds,
        itemCatalogById,
        equipmentCatalogByItemId
      )
    )
    .sort(compareNamedEquipments)
    .map((entry) => createEquipmentSlot(entry));
}

export function filterBackpackSlots(slots: ReadonlyArray<BackpackSlot>, filter: BackpackFilter): BackpackSlot[] {
  if (filter === "all") {
    return [...slots];
  }

  if (filter === "weapons") {
    return slots.filter((slot) => slot.slot === "weapon");
  }

  if (filter === "armor") {
    return slots.filter((slot) => slot.slot === "armor");
  }

  return slots.filter((slot) => slot.slot === "relic");
}

function toNamedEquipmentInstance(
  instance: OwnedEquipmentInstance,
  equippedInstanceIds: ReadonlySet<string>,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>,
  equipmentCatalogByItemId: Readonly<Record<string, EquipmentDefinition>>
): NamedEquipmentInstance {
  const itemDefinition = itemCatalogById[instance.definitionId];
  const equipmentDefinition = equipmentCatalogByItemId[instance.definitionId];
  const slot = normalizeSlot(instance.slot ?? equipmentDefinition?.slot ?? null);
  const weaponClass = equipmentDefinition?.weaponClass ?? null;
  const weaponElement = equipmentDefinition?.weaponElement ?? null;
  const isWeapon = slot === "weapon";

  return {
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    displayName: itemDefinition?.displayName ?? instance.definitionId,
    rarity: resolveRarity(instance.rarity, itemDefinition?.rarity),
    originSpeciesId: instance.originSpeciesId ?? null,
    slot,
    weaponClass,
    weaponElement,
    gameplayModifiers: equipmentDefinition?.gameplayModifiers ?? {},
    isWeapon,
    isEquipped: equippedInstanceIds.has(instance.instanceId)
  };
}

function createEquipmentSlot(entry: NamedEquipmentInstance): BackpackSlot {
  const slotLabel = SLOT_LABELS[entry.slot];
  const rarityLabel = toTitleLabel(entry.rarity);
  const typeLabel = resolveTypeLabel(entry.slot, entry.weaponClass, entry.weaponElement);
  const impactBadges = buildImpactBadges(entry.gameplayModifiers);
  const detailStatLines = buildDetailStatLines(entry.gameplayModifiers);
  const shortStatSummary =
    impactBadges.length > 0
      ? impactBadges.slice(0, 2).join(" • ")
      : detailStatLines[0] ?? "No combat modifiers";

  return {
    slotId: `equipment:${entry.instanceId}`,
    kind: "equipment",
    slot: entry.slot,
    itemId: entry.definitionId,
    definitionId: entry.definitionId,
    displayName: entry.displayName,
    rarity: entry.rarity,
    quantity: 1,
    instanceId: entry.instanceId,
    originSpeciesId: entry.originSpeciesId,
    weaponClass: entry.weaponClass,
    weaponElement: entry.weaponElement,
    slotLabel,
    rarityLabel,
    typeLabel,
    impactBadges,
    shortStatSummary,
    detailStatLines,
    isWeapon: entry.isWeapon,
    isEquipped: entry.isEquipped,
    inspectLabel: `definitionId=${entry.definitionId}; slot=${entry.slot}; rarity=${entry.rarity}; weaponClass=${entry.weaponClass ?? "unknown"}; weaponElement=${entry.weaponElement ?? "none"}`
  };
}

function normalizeSlot(value: string | null): BackpackEquipmentSlot {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "weapon") {
    return "weapon";
  }

  if (normalized === "armor") {
    return "armor";
  }

  if (normalized === "relic") {
    return "relic";
  }

  return "unknown";
}

function compareNamedEquipments(left: NamedEquipmentInstance, right: NamedEquipmentInstance): number {
  if (left.isEquipped !== right.isEquipped) {
    return left.isEquipped ? -1 : 1;
  }

  const byRarity = rarityWeight(right.rarity) - rarityWeight(left.rarity);
  if (byRarity !== 0) {
    return byRarity;
  }

  const bySlot = SLOT_SORT_ORDER[left.slot] - SLOT_SORT_ORDER[right.slot];
  if (bySlot !== 0) {
    return bySlot;
  }

  const byName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }

  return left.instanceId.localeCompare(right.instanceId, undefined, { sensitivity: "base" });
}

function resolveRarity(instanceRarity: string | null | undefined, itemRarity: string | null | undefined): string {
  const normalizedInstanceRarity = (instanceRarity ?? "").trim().toLowerCase();
  if (normalizedInstanceRarity.length > 0) {
    return normalizedInstanceRarity;
  }

  const normalizedItemRarity = (itemRarity ?? "").trim().toLowerCase();
  if (normalizedItemRarity.length > 0) {
    return normalizedItemRarity;
  }

  return "common";
}

function rarityWeight(rarity: string): number {
  return RARITY_SORT_ORDER[(rarity ?? "").trim().toLowerCase()] ?? 0;
}

function toTitleLabel(value: string): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return "Common";
  }

  return normalized
    .split(/[_\s-]+/)
    .map((token) => token.length > 0 ? token[0].toUpperCase() + token.slice(1) : token)
    .join(" ");
}

function resolveTypeLabel(
  slot: BackpackEquipmentSlot,
  weaponClass: string | null,
  weaponElement: string | null
): string {
  if (slot === "weapon") {
    const classLabel = weaponClass && weaponClass.trim().length > 0
      ? toTitleLabel(weaponClass)
      : "Weapon";
    const elementLabel = weaponElement && weaponElement.trim().length > 0
      ? ` (${toTitleLabel(weaponElement)})`
      : "";
    return `${classLabel}${elementLabel}`;
  }

  if (slot === "armor") {
    return "Defensive Gear";
  }

  if (slot === "relic") {
    return "Relic Focus";
  }

  return "Unknown Type";
}

function buildDetailStatLines(modifiers: Readonly<Record<string, string>>): ReadonlyArray<string> {
  const statLines: string[] = [];
  const effectLines: string[] = [];

  const orderedEntries = Object.entries(modifiers).sort(([left], [right]) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
  for (const [rawKey, rawValue] of orderedEntries) {
    const key = (rawKey ?? "").trim();
    const value = (rawValue ?? "").trim();
    if (!key || !value) {
      continue;
    }

    if (key.startsWith("stat.")) {
      statLines.push(formatStatLine(key, value));
      continue;
    }

    effectLines.push(formatEffectLine(key, value));
  }

  const merged = [...statLines, ...effectLines];
  if (merged.length === 0) {
    return [];
  }

  return merged;
}

function buildImpactBadges(modifiers: Readonly<Record<string, string>>): ReadonlyArray<string> {
  const attack = readNumericModifier(modifiers, "stat.attack");
  const defense = readNumericModifier(modifiers, "stat.defense");
  const vitality = readNumericModifier(modifiers, "stat.vitality");
  const badges: string[] = [];

  if (attack !== null && attack !== 0) {
    badges.push(`Damage ${formatSignedNumber(attack)}`);
  }

  if (defense !== null && defense !== 0) {
    badges.push(`Defense ${formatSignedNumber(defense)}`);
  }

  if (vitality !== null && vitality !== 0) {
    badges.push(`Vitality ${formatSignedNumber(vitality)}`);
  }

  return badges;
}

function formatStatLine(key: string, value: string): string {
  const statKey = key.slice("stat.".length).toLowerCase();
  const statLabel = statKey === "attack"
    ? "Damage"
    : statKey === "defense"
      ? "Defense"
      : statKey === "vitality"
        ? "Vitality"
        : toTitleLabel(statKey);
  const numericValue = Number(value);
  const formattedValue = Number.isFinite(numericValue) ? formatSignedNumber(numericValue) : value;

  return `${statLabel} ${formattedValue}`.trim();
}

function formatEffectLine(key: string, value: string): string {
  const label = key === "basic_combo"
    ? "Combo"
    : key === "shot_pattern"
      ? "Pattern"
      : key === "damage_profile"
        ? "Profile"
        : key === "focus"
          ? "Focus"
          : key === "on_hit"
            ? "On Hit"
            : key === "finisher"
              ? "Finisher"
              : toTitleLabel(key);

  return `${label}: ${toTitleLabel(value)}`;
}

function readNumericModifier(
  modifiers: Readonly<Record<string, string>>,
  key: string
): number | null {
  const rawValue = modifiers[key];
  if (typeof rawValue !== "string") {
    return null;
  }

  const parsedValue = Number(rawValue.trim());
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}
