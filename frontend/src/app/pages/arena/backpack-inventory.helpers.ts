import type {
  CharacterState,
  EquipmentDefinition,
  ItemDefinition,
  OwnedEquipmentInstance
} from "../../api/account-api.service";

export type BackpackFilter = "all" | "materials" | "weapons";

export type BackpackSlot = Readonly<{
  slotId: string;
  kind: "material" | "equipment";
  itemId: string;
  definitionId: string;
  displayName: string;
  rarity: string;
  quantity: number;
  instanceId: string | null;
  weaponClass: string | null;
  isWeapon: boolean;
  isEquipped: boolean;
  inspectLabel: string;
}>;

type NamedMaterialStack = Readonly<{
  itemId: string;
  displayName: string;
  rarity: string;
  quantity: number;
}>;

type NamedEquipmentInstance = Readonly<{
  instanceId: string;
  definitionId: string;
  displayName: string;
  rarity: string;
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

  const materials = Object.entries(character.inventory.materialStacks)
    .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
    .map(([itemId, quantity]) => toNamedMaterialStack(itemId, quantity, itemCatalogById))
    .sort(compareNamedMaterials);

  const equipments = Object.values(character.inventory.equipmentInstances)
    .map((instance) =>
      toNamedEquipmentInstance(
        instance,
        new Set<string>(
          [
            character.equipment.weaponInstanceId,
            character.equipment.armorInstanceId,
            character.equipment.relicInstanceId
          ].filter((value): value is string => !!value)
        ),
        itemCatalogById,
        equipmentCatalogByItemId
      )
    )
    .sort(compareNamedEquipments);

  const materialSlots = materials.map((stack) =>
    createMaterialSlot(stack)
  );
  const equipmentSlots = equipments.map((entry) =>
    createEquipmentSlot(entry)
  );

  return [...materialSlots, ...equipmentSlots];
}

export function filterBackpackSlots(slots: ReadonlyArray<BackpackSlot>, filter: BackpackFilter): BackpackSlot[] {
  if (filter === "all") {
    return [...slots];
  }

  if (filter === "materials") {
    return slots.filter((slot) => slot.kind === "material");
  }

  return slots.filter((slot) => slot.kind === "equipment" && slot.isWeapon);
}

function toNamedMaterialStack(
  itemId: string,
  quantity: number,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>
): NamedMaterialStack {
  const definition = itemCatalogById[itemId];
  return {
    itemId,
    displayName: definition?.displayName ?? itemId,
    rarity: definition?.rarity ?? "common",
    quantity
  };
}

function toNamedEquipmentInstance(
  instance: OwnedEquipmentInstance,
  equippedInstanceIds: ReadonlySet<string>,
  itemCatalogById: Readonly<Record<string, ItemDefinition>>,
  equipmentCatalogByItemId: Readonly<Record<string, EquipmentDefinition>>
): NamedEquipmentInstance {
  const itemDefinition = itemCatalogById[instance.definitionId];
  const equipmentDefinition = equipmentCatalogByItemId[instance.definitionId];
  const weaponClass = equipmentDefinition?.weaponClass ?? null;
  const isWeapon = (equipmentDefinition?.slot ?? "").toLowerCase() === "weapon" || !!weaponClass;

  return {
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    displayName: itemDefinition?.displayName ?? instance.definitionId,
    rarity: itemDefinition?.rarity ?? "common",
    weaponClass,
    isWeapon,
    isEquipped: equippedInstanceIds.has(instance.instanceId)
  };
}

function createMaterialSlot(stack: NamedMaterialStack): BackpackSlot {
  return {
    slotId: `material:${stack.itemId}`,
    kind: "material",
    itemId: stack.itemId,
    definitionId: stack.itemId,
    displayName: stack.displayName,
    rarity: stack.rarity,
    quantity: stack.quantity,
    instanceId: null,
    weaponClass: null,
    isWeapon: false,
    isEquipped: false,
    inspectLabel: `id=${stack.itemId}; rarity=${stack.rarity}`
  };
}

function createEquipmentSlot(entry: NamedEquipmentInstance): BackpackSlot {
  return {
    slotId: `equipment:${entry.instanceId}`,
    kind: "equipment",
    itemId: entry.definitionId,
    definitionId: entry.definitionId,
    displayName: entry.displayName,
    rarity: entry.rarity,
    quantity: 1,
    instanceId: entry.instanceId,
    weaponClass: entry.weaponClass,
    isWeapon: entry.isWeapon,
    isEquipped: entry.isEquipped,
    inspectLabel: `definitionId=${entry.definitionId}; rarity=${entry.rarity}; weaponClass=${entry.weaponClass ?? "unknown"}`
  };
}

function compareNamedMaterials(left: NamedMaterialStack, right: NamedMaterialStack): number {
  const byName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }

  return left.itemId.localeCompare(right.itemId, undefined, { sensitivity: "base" });
}

function compareNamedEquipments(left: NamedEquipmentInstance, right: NamedEquipmentInstance): number {
  const byName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }

  return left.instanceId.localeCompare(right.instanceId, undefined, { sensitivity: "base" });
}
