import type { AccountState, CharacterState, ItemDefinition, OwnedEquipmentInstance } from "../../api/account-api.service";
import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent equipment flow", () => {
  function createComponent(): ArenaPageComponent {
    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
  }

  function createCharacter(
    equipment: {
      weaponInstanceId: string | null;
      armorInstanceId: string | null;
      relicInstanceId: string | null;
    }
  ): CharacterState {
    const equipmentInstances: Record<string, OwnedEquipmentInstance> = {
      "wpn-old": { instanceId: "wpn-old", definitionId: "old_blade", isLocked: false },
      "wpn-new": { instanceId: "wpn-new", definitionId: "new_blade", isLocked: false },
      "arm-old": { instanceId: "arm-old", definitionId: "old_plate", isLocked: false },
      "arm-new": { instanceId: "arm-new", definitionId: "new_plate", isLocked: false },
      "rel-old": { instanceId: "rel-old", definitionId: "old_relic", isLocked: false },
      "rel-new": { instanceId: "rel-new", definitionId: "new_relic", isLocked: false }
    };

    return {
      characterId: "char-1",
      name: "Kaelis",
      level: 10,
      xp: 3000,
      equipment: {
        weaponInstanceId: equipment.weaponInstanceId,
        armorInstanceId: equipment.armorInstanceId,
        relicInstanceId: equipment.relicInstanceId
      },
      inventory: {
        materialStacks: {},
        equipmentInstances
      },
      bestiaryKillsBySpecies: {},
      primalCoreBySpecies: {}
    };
  }

  it("weapon slot click focuses backpack panel and enables weapon filter mode", () => {
    const component = createComponent();
    const focusBackpackSpy = vi.spyOn(component as any, "focusBackpackPanel");
    component.onEquipmentWeaponSlotActivated();

    expect(component.backpackWeaponFilterMode).toBe(true);
    expect(component.backpackForcedFilter).toBe("weapons");
    expect(focusBackpackSpy).toHaveBeenCalledTimes(1);
  });

  it("equip request updates character weapon and exits weapon filter mode", async () => {
    const component = createComponent();
    const before = createCharacter({ weaponInstanceId: "wpn-old", armorInstanceId: "arm-old", relicInstanceId: "rel-old" });
    const after = createCharacter({ weaponInstanceId: "wpn-new", armorInstanceId: "arm-old", relicInstanceId: "rel-old" });

    const accountState: AccountState = {
      accountId: "dev",
      activeCharacterId: "char-1",
      version: 1,
      echoFragmentsBalance: 0,
      characters: {
        "char-1": before
      }
    };

    (component as any).accountState = accountState;
    component.selectedCharacterId = "char-1";
    (component as any).itemCatalogById = {
      old_blade: { itemId: "old_blade", displayName: "Old Blade", kind: "equipment", stackable: false, rarity: "common" },
      new_blade: { itemId: "new_blade", displayName: "New Blade", kind: "equipment", stackable: false, rarity: "rare" },
      old_plate: { itemId: "old_plate", displayName: "Old Guard Plate", kind: "equipment", stackable: false, rarity: "common" },
      new_plate: { itemId: "new_plate", displayName: "New Guard Plate", kind: "equipment", stackable: false, rarity: "rare" },
      old_relic: { itemId: "old_relic", displayName: "Old Rune Codex", kind: "equipment", stackable: false, rarity: "common" },
      new_relic: { itemId: "new_relic", displayName: "New Rune Codex", kind: "equipment", stackable: false, rarity: "rare" }
    } as Record<string, ItemDefinition>;
    component.backpackWeaponFilterMode = true;
    component.backpackForcedFilter = "weapons";

    (component as any).accountApi = {
      equipItem: async () => after
    };

    await component.onBackpackEquipRequested({ instanceId: "wpn-new", slot: "weapon" });

    expect(component.selectedCharacter?.equipment.weaponInstanceId).toBe("wpn-new");
    expect(component.selectedCharacterWeaponLabel).toBe("New Blade");
    expect(component.backpackWeaponFilterMode).toBe(false);
    expect(component.backpackForcedFilter).toBeNull();
  });

  it("equip request updates armor and relic slots via equip-item API", async () => {
    const component = createComponent();
    const before = createCharacter({ weaponInstanceId: "wpn-old", armorInstanceId: "arm-old", relicInstanceId: "rel-old" });
    const afterArmor = createCharacter({ weaponInstanceId: "wpn-old", armorInstanceId: "arm-new", relicInstanceId: "rel-old" });
    const afterRelic = createCharacter({ weaponInstanceId: "wpn-old", armorInstanceId: "arm-new", relicInstanceId: "rel-new" });

    const accountState: AccountState = {
      accountId: "dev",
      activeCharacterId: "char-1",
      version: 1,
      echoFragmentsBalance: 0,
      characters: {
        "char-1": before
      }
    };

    (component as any).accountState = accountState;
    component.selectedCharacterId = "char-1";
    (component as any).itemCatalogById = {
      old_blade: { itemId: "old_blade", displayName: "Old Blade", kind: "equipment", stackable: false, rarity: "common" },
      new_blade: { itemId: "new_blade", displayName: "New Blade", kind: "equipment", stackable: false, rarity: "rare" },
      old_plate: { itemId: "old_plate", displayName: "Old Guard Plate", kind: "equipment", stackable: false, rarity: "common" },
      new_plate: { itemId: "new_plate", displayName: "New Guard Plate", kind: "equipment", stackable: false, rarity: "rare" },
      old_relic: { itemId: "old_relic", displayName: "Old Rune Codex", kind: "equipment", stackable: false, rarity: "common" },
      new_relic: { itemId: "new_relic", displayName: "New Rune Codex", kind: "equipment", stackable: false, rarity: "rare" }
    } as Record<string, ItemDefinition>;

    const equipItemMock = vi.fn()
      .mockResolvedValueOnce(afterArmor)
      .mockResolvedValueOnce(afterRelic);
    (component as any).accountApi = { equipItem: equipItemMock };

    await component.onBackpackEquipRequested({ instanceId: "arm-new", slot: "armor" });
    await component.onBackpackEquipRequested({ instanceId: "rel-new", slot: "relic" });

    expect(equipItemMock).toHaveBeenNthCalledWith(1, "dev_account", "char-1", "armor", "arm-new");
    expect(equipItemMock).toHaveBeenNthCalledWith(2, "dev_account", "char-1", "relic", "rel-new");
    expect(component.selectedCharacter?.equipment.armorInstanceId).toBe("arm-new");
    expect(component.selectedCharacter?.equipment.relicInstanceId).toBe("rel-new");
    expect(component.selectedCharacterArmorLabel).toBe("New Guard Plate");
    expect(component.selectedCharacterRelicLabel).toBe("New Rune Codex");
  });

  it("resolves equipped rarity from item catalog when instance rarity is missing", () => {
    const component = createComponent();
    const character = createCharacter({ weaponInstanceId: "wpn-old", armorInstanceId: "arm-old", relicInstanceId: "rel-old" });
    const accountState: AccountState = {
      accountId: "dev",
      activeCharacterId: "char-1",
      version: 1,
      echoFragmentsBalance: 0,
      characters: {
        "char-1": character
      }
    };

    (component as any).accountState = accountState;
    component.selectedCharacterId = "char-1";
    (component as any).itemCatalogById = {
      old_blade: { itemId: "old_blade", displayName: "Old Blade", kind: "equipment", stackable: false, rarity: "ascendant" },
      new_blade: { itemId: "new_blade", displayName: "New Blade", kind: "equipment", stackable: false, rarity: "rare" }
    } as Record<string, ItemDefinition>;

    expect(component.selectedCharacterWeaponRarity).toBe("ascendant");
  });
});
