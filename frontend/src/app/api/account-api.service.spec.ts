import { AccountApiService, type AccountStateResponse, type CharacterState } from "./account-api.service";

describe("AccountApiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls account state endpoint using a relative /api path", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(buildAccountStateResponse()), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    const service = new AccountApiService();

    await service.getState("dev_account");

    const [url] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/account/state?accountId=dev_account");
    expect(String(url)).toMatch(/^\/api\//);
    expect(String(url)).not.toMatch(/^https?:\/\//i);
  });

  it("calls equip item endpoint using a relative /api path", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(buildCharacterState()), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    const service = new AccountApiService();

    await service.equipItem("dev_account", "char-1", "weapon", "wpn-1");

    const [url] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/account/equip-item");
    expect(String(url)).toMatch(/^\/api\//);
    expect(String(url)).not.toMatch(/^https?:\/\//i);
  });
});

function buildAccountStateResponse(): AccountStateResponse {
  return {
    account: {
      accountId: "dev_account",
      activeCharacterId: "char-1",
      version: 1,
      echoFragmentsBalance: 0,
      characters: {}
    },
    characterCatalog: [],
    itemCatalog: [],
    equipmentCatalog: []
  };
}

function buildCharacterState(): CharacterState {
  return {
    characterId: "char-1",
    name: "Kaelis",
    level: 1,
    xp: 0,
    inventory: {
      materialStacks: {},
      equipmentInstances: {}
    },
    equipment: {
      weaponInstanceId: null
    },
    bestiaryKillsBySpecies: {},
    primalCoreBySpecies: {}
  };
}
