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

  function createCharacter(weaponInstanceId: string): CharacterState {
    const equipmentInstances: Record<string, OwnedEquipmentInstance> = {
      "wpn-old": { instanceId: "wpn-old", definitionId: "old_blade", isLocked: false },
      "wpn-new": { instanceId: "wpn-new", definitionId: "new_blade", isLocked: false }
    };

    return {
      characterId: "char-1",
      name: "Kaelis",
      level: 10,
      xp: 3000,
      equipment: {
        weaponInstanceId
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
    const before = createCharacter("wpn-old");
    const after = createCharacter("wpn-new");

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
      new_blade: { itemId: "new_blade", displayName: "New Blade", kind: "equipment", stackable: false, rarity: "rare" }
    } as Record<string, ItemDefinition>;
    component.backpackWeaponFilterMode = true;
    component.backpackForcedFilter = "weapons";

    (component as any).accountApi = {
      equipWeapon: async () => after
    };

    await component.onBackpackEquipRequested("wpn-new");

    expect(component.selectedCharacter?.equipment.weaponInstanceId).toBe("wpn-new");
    expect(component.selectedCharacterWeaponLabel).toBe("New Blade");
    expect(component.backpackWeaponFilterMode).toBe(false);
    expect(component.backpackForcedFilter).toBeNull();
  });

  it("resolves equipped rarity from item catalog when instance rarity is missing", () => {
    const component = createComponent();
    const character = createCharacter("wpn-old");
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
