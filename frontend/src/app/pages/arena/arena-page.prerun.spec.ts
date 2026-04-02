import type { AccountApiService, AccountStateResponse } from "../../api/account-api.service";
import { ArenaPageComponent } from "./arena-page.component";

describe("ArenaPageComponent pre-run account loading", () => {
  function createComponent(accountApi: Partial<AccountApiService>): ArenaPageComponent {
    return new ArenaPageComponent(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      accountApi as AccountApiService
    );
  }

  it("calls account state on init and populates deterministic pre-run characters", async () => {
    const response: AccountStateResponse = {
      account: {
        accountId: "dev_account",
        activeCharacterId: "char_b",
        version: 1,
        echoFragmentsBalance: 0,
        kaerosBalance: 0,
        characters: {
          char_a: {
            characterId: "char_a",
            name: "Ares",
            masteryLevel: 3,
            masteryXp: 210,
            masteryXpForCurrentLevel: 10,
            masteryXpRequiredForNextLevel: 440,
            unlockedSigilSlots: 1,
            equipment: { weaponInstanceId: "wpn_a" },
            inventory: {
              materialStacks: {},
              equipmentInstances: {
                wpn_a: { instanceId: "wpn_a", definitionId: "bronze_sword", isLocked: false }
              }
            },
            bestiaryKillsBySpecies: {},
            primalCoreBySpecies: {}
          },
          char_b: {
            characterId: "char_b",
            name: "Zeda",
            masteryLevel: 5,
            masteryXp: 540,
            masteryXpForCurrentLevel: 40,
            masteryXpRequiredForNextLevel: 680,
            unlockedSigilSlots: 1,
            equipment: { weaponInstanceId: "wpn_b" },
            inventory: {
              materialStacks: {},
              equipmentInstances: {
                wpn_b: { instanceId: "wpn_b", definitionId: "steel_axe", isLocked: false }
              }
            },
            bestiaryKillsBySpecies: {},
            primalCoreBySpecies: {}
          }
        }
      },
      characterCatalog: [],
      itemCatalog: [
        { itemId: "bronze_sword", displayName: "Bronze Sword", kind: "equipment", stackable: false, rarity: "common" },
        { itemId: "steel_axe", displayName: "Steel Axe", kind: "equipment", stackable: false, rarity: "rare" }
      ],
      equipmentCatalog: []
    };

    const getState = vi.fn(async () => response);
    const component = createComponent({ getState });

    await component.ngAfterViewInit();

    expect(getState).toHaveBeenCalledWith("dev_account");
    expect(component.preRunCharacters.map((entry) => entry.id)).toEqual(["char_b", "char_a"]);
    expect(component.preRunCharacters[0]?.equippedWeaponName).toBe("Steel Axe");
  });

  it("defaults selected character id to account active character", async () => {
    const getState = vi.fn(async (): Promise<AccountStateResponse> => ({
      account: {
        accountId: "dev_account",
        activeCharacterId: "char_active",
        version: 1,
        echoFragmentsBalance: 0,
        kaerosBalance: 0,
        characters: {
          char_active: {
            characterId: "char_active",
            name: "Kina",
            masteryLevel: 7,
            masteryXp: 1337,
            masteryXpForCurrentLevel: 97,
            masteryXpRequiredForNextLevel: 920,
            unlockedSigilSlots: 1,
            equipment: {},
            inventory: { materialStacks: {}, equipmentInstances: {} },
            bestiaryKillsBySpecies: {},
            primalCoreBySpecies: {}
          }
        }
      },
      characterCatalog: [],
      itemCatalog: [],
      equipmentCatalog: []
    }));
    const component = createComponent({ getState });

    await component.ngAfterViewInit();

    expect(component.selectedCharacterId).toBe("char_active");
  });

  it("flags pre-run empty state when account has no characters", async () => {
    const getState = vi.fn(async (): Promise<AccountStateResponse> => ({
      account: {
        accountId: "dev_account",
        activeCharacterId: "",
        version: 1,
        echoFragmentsBalance: 0,
        kaerosBalance: 0,
        characters: {}
      },
      characterCatalog: [],
      itemCatalog: [],
      equipmentCatalog: []
    }));
    const component = createComponent({ getState });

    await component.ngAfterViewInit();

    expect(component.accountLoaded).toBe(true);
    expect(component.preRunCharacters).toEqual([]);
    expect(component.isPreRunEmptyState).toBe(true);
  });
});
