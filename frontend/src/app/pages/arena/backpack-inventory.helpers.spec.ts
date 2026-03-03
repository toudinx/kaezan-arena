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
        materialStacks: {},
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
          "arm-01": {
            instanceId: "arm-01",
            definitionId: "plate_guard",
            isLocked: false
          },
          "rel-01": {
            instanceId: "rel-01",
            definitionId: "rune_orb",
            isLocked: false
          }
        }
      },
      bestiaryKillsBySpecies: {},
      primalCoreBySpecies: {}
    };
  }

  it("maps inventory to deterministic equipment-only slots and ordering", () => {
    const character = createCharacter();
    const itemCatalogById: Record<string, ItemDefinition> = {
      blade_alpha: { itemId: "blade_alpha", displayName: "Axe of Dawn", kind: "equipment", stackable: false, rarity: "epic" },
      plate_guard: { itemId: "plate_guard", displayName: "Guard Plate", kind: "equipment", stackable: false, rarity: "common" },
      rune_orb: { itemId: "rune_orb", displayName: "Rune Orb", kind: "equipment", stackable: false, rarity: "rare" }
    };
    const equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {
      blade_alpha: { itemId: "blade_alpha", slot: "weapon", weaponClass: "axe", gameplayModifiers: {} },
      plate_guard: { itemId: "plate_guard", slot: "armor", weaponClass: "", gameplayModifiers: {} },
      rune_orb: { itemId: "rune_orb", slot: "relic", weaponClass: "", gameplayModifiers: {} }
    };

    const slots = mapInventoryToBackpackSlots(character, itemCatalogById, equipmentCatalogByItemId);

    expect(slots.map((slot) => slot.slotId)).toEqual([
      "equipment:arm-01",
      "equipment:rel-01",
      "equipment:wpn-02",
      "equipment:wpn-10"
    ]);
    expect(slots.find((slot) => slot.slotId === "equipment:wpn-02")?.isEquipped).toBe(true);
    expect(slots.find((slot) => slot.slotId === "equipment:wpn-10")?.isEquipped).toBe(false);
    expect(slots.find((slot) => slot.slotId === "equipment:arm-01")?.slot).toBe("armor");
    expect(slots.find((slot) => slot.slotId === "equipment:rel-01")?.slot).toBe("relic");
  });

  it("filters slots by equipment tabs", () => {
    const character = createCharacter();
    const itemCatalogById: Record<string, ItemDefinition> = {
      blade_alpha: { itemId: "blade_alpha", displayName: "Axe of Dawn", kind: "equipment", stackable: false, rarity: "epic" },
      plate_guard: { itemId: "plate_guard", displayName: "Guard Plate", kind: "equipment", stackable: false, rarity: "common" },
      rune_orb: { itemId: "rune_orb", displayName: "Rune Orb", kind: "equipment", stackable: false, rarity: "rare" }
    };
    const equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {
      blade_alpha: { itemId: "blade_alpha", slot: "weapon", weaponClass: "axe", gameplayModifiers: {} },
      plate_guard: { itemId: "plate_guard", slot: "armor", weaponClass: "", gameplayModifiers: {} },
      rune_orb: { itemId: "rune_orb", slot: "relic", weaponClass: "", gameplayModifiers: {} }
    };
    const slots = mapInventoryToBackpackSlots(character, itemCatalogById, equipmentCatalogByItemId);

    expect(filterBackpackSlots(slots, "all").length).toBe(4);
    expect(filterBackpackSlots(slots, "weapons").every((slot) => slot.slot === "weapon")).toBe(true);
    expect(filterBackpackSlots(slots, "armor").every((slot) => slot.slot === "armor")).toBe(true);
    expect(filterBackpackSlots(slots, "relics").every((slot) => slot.slot === "relic")).toBe(true);
  });

  it("falls back to catalog rarity when instance rarity is null or blank", () => {
    const character = createCharacter();
    character.inventory.equipmentInstances["wpn-10"] = {
      instanceId: "wpn-10",
      definitionId: "blade_alpha",
      isLocked: false,
      rarity: null
    };
    character.inventory.equipmentInstances["wpn-02"] = {
      instanceId: "wpn-02",
      definitionId: "blade_alpha",
      isLocked: false,
      rarity: "   "
    };

    const itemCatalogById: Record<string, ItemDefinition> = {
      blade_alpha: { itemId: "blade_alpha", displayName: "Axe of Dawn", kind: "equipment", stackable: false, rarity: "legendary" },
      plate_guard: { itemId: "plate_guard", displayName: "Guard Plate", kind: "equipment", stackable: false, rarity: "common" },
      rune_orb: { itemId: "rune_orb", displayName: "Rune Orb", kind: "equipment", stackable: false, rarity: "rare" }
    };
    const equipmentCatalogByItemId: Record<string, EquipmentDefinition> = {
      blade_alpha: { itemId: "blade_alpha", slot: "weapon", weaponClass: "axe", gameplayModifiers: {} },
      plate_guard: { itemId: "plate_guard", slot: "armor", weaponClass: "", gameplayModifiers: {} },
      rune_orb: { itemId: "rune_orb", slot: "relic", weaponClass: "", gameplayModifiers: {} }
    };

    const slots = mapInventoryToBackpackSlots(character, itemCatalogById, equipmentCatalogByItemId);

    expect(slots.find((slot) => slot.instanceId === "wpn-10")?.rarity).toBe("legendary");
    expect(slots.find((slot) => slot.instanceId === "wpn-02")?.rarity).toBe("legendary");
  });
});
