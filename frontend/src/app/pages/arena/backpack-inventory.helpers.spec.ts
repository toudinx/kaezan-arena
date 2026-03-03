import type { CharacterState, EquipmentDefinition, ItemDefinition } from "../../api/account-api.service";
import { filterBackpackSlots, mapInventoryToBackpackSlots } from "./backpack-inventory.helpers";

describe("backpack-inventory.helpers", () => {
  function createCharacter(): CharacterState {
    return {
      characterId: "char-01",
      name: "Kaelis",
      level: 12,
      xp: 999,
      equipment: {
        weaponInstanceId: "wpn-02"
      },
      inventory: {
        materialStacks: {
          mat_z: 30,
          mat_a: 10,
          mat_a2: 5
        },
        equipmentInstances: {
          "wpn-10": {
            instanceId: "wpn-10",
            definitionId: "blade_alpha",
            isLocked: false
          },
          "wpn-02": {
            instanceId: "wpn-02",
            definitionId: "blade_alpha",
            isLocked: false
          },
          "ring-01": {
            instanceId: "ring-01",
            definitionId: "ring_rare",
            isLocked: false
          }
        }
      }
    };
  }

  it("maps inventory to deterministic slots and ordering", () => {
    const character = createCharacter();
    const itemCatalogById: Record<string, ItemDefinition> = {
      mat_z: { itemId: "mat_z", displayName: "Zinc Dust", kind: "material", stackable: true, rarity: "common" },
      mat_a: { itemId: "mat_a", displayName: "Amber", kind: "material", stackable: true, rarity: "rare" },
      mat_a2: { itemId: "mat_a2", displayName: "Amber", kind: "material", stackable: true, rarity: "common" },
      blade_alpha: { itemId: "blade_alpha", displayName: "Axe of Dawn", kind: "equipment", stackable: false, rarity: "epic" },
      ring_rare: { itemId: "ring_rare", displayName: "Ring of Mist", kind: "equipment", stackable: false, rarity: "rare" }
    };
    const equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {
      blade_alpha: { itemId: "blade_alpha", slot: "weapon", weaponClass: "axe", gameplayModifiers: {} },
      ring_rare: { itemId: "ring_rare", slot: "ring", weaponClass: "", gameplayModifiers: {} }
    };

    const slots = mapInventoryToBackpackSlots(character, itemCatalogById, equipmentCatalogByItemId);

    expect(slots.map((slot) => slot.slotId)).toEqual([
      "material:mat_a",
      "material:mat_a2",
      "material:mat_z",
      "equipment:wpn-02",
      "equipment:wpn-10",
      "equipment:ring-01"
    ]);
    expect(slots.find((slot) => slot.slotId === "equipment:wpn-02")?.isEquipped).toBe(true);
    expect(slots.find((slot) => slot.slotId === "equipment:wpn-10")?.isEquipped).toBe(false);
    expect(slots.find((slot) => slot.slotId === "equipment:ring-01")?.isWeapon).toBe(false);
  });

  it("filters slots by tab", () => {
    const character = createCharacter();
    const itemCatalogById: Record<string, ItemDefinition> = {
      mat_z: { itemId: "mat_z", displayName: "Zinc Dust", kind: "material", stackable: true, rarity: "common" },
      mat_a: { itemId: "mat_a", displayName: "Amber", kind: "material", stackable: true, rarity: "rare" },
      mat_a2: { itemId: "mat_a2", displayName: "Amber", kind: "material", stackable: true, rarity: "common" },
      blade_alpha: { itemId: "blade_alpha", displayName: "Axe of Dawn", kind: "equipment", stackable: false, rarity: "epic" }
    };
    const equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {
      blade_alpha: { itemId: "blade_alpha", slot: "weapon", weaponClass: "axe", gameplayModifiers: {} }
    };
    const slots = mapInventoryToBackpackSlots(character, itemCatalogById, equipmentCatalogByItemId);

    expect(filterBackpackSlots(slots, "all").length).toBe(6);
    expect(filterBackpackSlots(slots, "materials").every((slot) => slot.kind === "material")).toBe(true);
    expect(filterBackpackSlots(slots, "weapons").every((slot) => slot.kind === "equipment" && slot.isWeapon)).toBe(true);
  });
});
