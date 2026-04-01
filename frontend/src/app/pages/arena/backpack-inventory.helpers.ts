import type {
  CharacterState,
  EquipmentDefinition,
  ItemDefinition,
  OwnedEquipmentInstance
} from "../../api/account-api.service";

export type BackpackFilter = "all" | "weapons";

type BackpackEquipmentSlot = "weapon" | "unknown";

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
  isWeapon: boolean;
  isEquipped: boolean;
}>;

export function mapInventoryToBackpackSlots(
  character: CharacterState | null,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>,
  equipmentCatalogByItemId: Readonly<Record<string, EquipmentDefinition>>
): BackpackSlot[] {
  if (!character) {
    return [];
  }

  const equippedInstanceIds = new Set<string>(
    [character.equipment.weaponInstanceId].filter((value): value is string => !!value)
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

  return slots.filter((slot) => slot.slot === "weapon");
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
  const isWeapon = slot === "weapon";

  return {
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    displayName: itemDefinition?.displayName ?? instance.definitionId,
    rarity: resolveRarity(instance.rarity, itemDefinition?.rarity),
    originSpeciesId: instance.originSpeciesId ?? null,
    slot,
    weaponClass,
    isWeapon,
    isEquipped: equippedInstanceIds.has(instance.instanceId)
  };
}

function createEquipmentSlot(entry: NamedEquipmentInstance): BackpackSlot {
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
    isWeapon: entry.isWeapon,
    isEquipped: entry.isEquipped,
    inspectLabel: `definitionId=${entry.definitionId}; slot=${entry.slot}; rarity=${entry.rarity}; weaponClass=${entry.weaponClass ?? "unknown"}`
  };
}

function normalizeSlot(value: string | null): BackpackEquipmentSlot {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "weapon") {
    return "weapon";
  }

  return "unknown";
}

function compareNamedEquipments(left: NamedEquipmentInstance, right: NamedEquipmentInstance): number {
  const bySlot = left.slot.localeCompare(right.slot, undefined, { sensitivity: "base" });
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
