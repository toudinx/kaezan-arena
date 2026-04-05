using System.Collections;
using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Account;
using KaezanArena.Api.Contracts.Battle;
using KaezanArena.Api.Contracts.Common;
using KaezanArena.Api.Contracts.Effects;
using KaezanArena.Api.Contracts.Health;
using Microsoft.Extensions.DependencyInjection;

namespace KaezanArena.Api.Tests;

public sealed class ApiEndpointsTests : IClassFixture<ApiTestWebApplicationFactory>
{
    private const int ArenaWidth = 7;
    private const int ArenaHeight = 7;
    private const int PlayerTileX = 3;
    private const int PlayerTileY = 3;
    private const int MaxAliveMobs = 10;
    private const int EarlyMobConcurrentCap = 2;
    private const int EarlyMobConcurrentCapDurationMs = 75000;
    private const int StepDeltaMs = 250;
    private const int GlobalCooldownMs = 400;
    private const int HealCooldownMs = 7000;
    private const int GuardCooldownMs = 10000;
    private const int AltarCooldownMs = 12000;
    private const int AltarSummonSpawnCount = 2;
    private const int HealPercentOfMaxHp = 22;
    private const int RunInitialLevel = 1;
    private const int RunXpPerNormalMobKill = 10;
    private const int RunLevelXpBase = 60;
    private const int RunLevelXpIncrementPerLevel = 40;
    private static int[] BestiaryRankKillThresholds => ArenaConfig.BestiaryConfig.RankKillThresholds;
    private readonly HttpClient _client;
    private readonly ApiTestWebApplicationFactory _factory;

    public ApiEndpointsTests(ApiTestWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _factory = factory;
    }

    [Fact]
    public async Task GetHealth_ReturnsOk()
    {
        var response = await _client.GetAsync("/health");
        var payload = await response.Content.ReadFromJsonAsync<HealthResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal("ok", payload.Status);
    }

    [Fact]
    public async Task GetApiPing_ReturnsPongTrue()
    {
        var response = await _client.GetAsync("/api/ping");
        var payload = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.True(payload.TryGetValue("pong", out var pong));
        Assert.True(pong);
    }

    [Fact]
    public async Task GetAccountState_ReturnsSeededDevAccountAndCatalogs()
    {
        var response = await _client.GetAsync("/api/v1/account/state?accountId=dev_account");
        var payload = await response.Content.ReadFromJsonAsync<AccountStateResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.NotNull(payload.Account);
        Assert.Equal("dev_account", payload.Account.AccountId);
        Assert.True(payload.Account.Characters.Count >= 2);
        Assert.True(payload.Account.Characters.ContainsKey(ArenaConfig.CharacterIds.Kina));
        Assert.True(payload.Account.Characters.ContainsKey(ArenaConfig.CharacterIds.RangedPrototype));
        Assert.Contains(
            payload.CharacterCatalog,
            definition =>
                string.Equals(definition.CharacterId, ArenaConfig.CharacterIds.RangedPrototype, StringComparison.Ordinal) &&
                string.Equals(definition.DisplayName, ArenaConfig.DisplayNames[ArenaConfig.CharacterIds.RangedPrototype], StringComparison.Ordinal) &&
                definition.FixedWeaponNames.SequenceEqual(
                    ArenaConfig.GetFixedWeaponKitForCharacterId(ArenaConfig.CharacterIds.RangedPrototype)
                        .Select(weaponId => ArenaConfig.DisplayNames[weaponId])));
        Assert.True(payload.ItemCatalog.Count >= 1);
        Assert.True(payload.EquipmentCatalog.Count >= 1);
        Assert.True(payload.Account.Characters.ContainsKey(payload.Account.ActiveCharacterId));
        Assert.True(payload.Account.EchoFragmentsBalance >= 0);
        Assert.All(payload.Account.Characters.Values, character =>
        {
            Assert.NotNull(character.BestiaryKillsBySpecies);
            Assert.NotNull(character.PrimalCoreBySpecies);
        });
    }

    [Fact]
    public async Task GetAccountBestiary_ReturnsDeterministicSpeciesCatalogAndActiveCharacterProgress()
    {
        var state = await GetAccountStateAsync("dev_account_bestiary_overview");
        var activeCharacter = state.Account.Characters[state.Account.ActiveCharacterId];

        var response = await _client.GetAsync($"/api/v1/account/bestiary?accountId={state.Account.AccountId}");
        var payload = await response.Content.ReadFromJsonAsync<BestiaryOverviewResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.NotNull(payload.SpeciesCatalog);
        Assert.Equal(
            ["melee_brute", "ranged_archer", "melee_demon", "ranged_shaman"],
            payload.SpeciesCatalog.Select(species => species.SpeciesId).ToArray());
        Assert.All(payload.SpeciesCatalog, species =>
        {
            Assert.False(string.IsNullOrWhiteSpace(species.SpeciesId));
            Assert.False(string.IsNullOrWhiteSpace(species.DisplayName));
        });
        Assert.NotNull(payload.Character);
        Assert.Equal(activeCharacter.CharacterId, payload.Character.CharacterId);
        Assert.Equal(activeCharacter.Name, payload.Character.Name);
        Assert.Equal(activeCharacter.BestiaryKillsBySpecies, payload.Character.BestiaryKillsBySpecies);
        Assert.Equal(activeCharacter.PrimalCoreBySpecies, payload.Character.PrimalCoreBySpecies);
    }

    [Fact]
    public async Task PostBestiaryCraft_DeductsBalancesAndCreatesCommonItem()
    {
        const string accountId = "dev_account_craft_ready_deducts";
        var state = await GetAccountStateAsync(accountId);
        var activeCharacter = state.Account.Characters[state.Account.ActiveCharacterId];
        var initialEchoFragments = state.Account.EchoFragmentsBalance;
        var initialPrimalCore = activeCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0);

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon"));
        var payload = await response.Content.ReadFromJsonAsync<BestiaryCraftResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(initialEchoFragments - 100, payload.EchoFragmentsBalance);
        Assert.Equal(activeCharacter.CharacterId, payload.Character.CharacterId);
        Assert.Equal(initialPrimalCore - 20, payload.Character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal("wpn.primal_forged_blade", payload.CraftedItem.DefinitionId);
        Assert.Equal("melee_brute", payload.CraftedItem.OriginSpeciesId);
        Assert.Equal("weapon", payload.CraftedItem.Slot);
        Assert.Equal("common", payload.CraftedItem.Rarity);
        Assert.True(payload.Character.Inventory.EquipmentInstances.ContainsKey(payload.CraftedItem.InstanceId));

        var finalState = await GetAccountStateAsync(accountId);
        var finalCharacter = finalState.Account.Characters[activeCharacter.CharacterId];
        Assert.Equal(payload.EchoFragmentsBalance, finalState.Account.EchoFragmentsBalance);
        Assert.Equal(payload.Character.PrimalCoreBySpecies, finalCharacter.PrimalCoreBySpecies);
        Assert.True(finalCharacter.Inventory.EquipmentInstances.ContainsKey(payload.CraftedItem.InstanceId));
    }

    [Fact]
    public async Task PostBestiaryCraft_FailsWhenSameCharacterCraftsSameSpeciesTwice()
    {
        const string accountId = "dev_account_craft_ready_unique_per_character";

        var firstResponse = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon"));
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        var secondResponse = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon"));
        var secondPayload = await secondResponse.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, secondResponse.StatusCode);
        Assert.NotNull(secondPayload);
        Assert.Equal("validation_error", secondPayload.Code);
        Assert.Contains("already crafted", secondPayload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PostBestiaryCraft_SetsCraftedByMetadata()
    {
        const string accountId = "dev_account_craft_ready_metadata";
        var state = await GetAccountStateAsync(accountId);
        var activeCharacter = state.Account.Characters[state.Account.ActiveCharacterId];

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon"));
        var payload = await response.Content.ReadFromJsonAsync<BestiaryCraftResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(activeCharacter.CharacterId, payload.CraftedItem.CraftedByCharacterId);
        Assert.Equal(activeCharacter.Name, payload.CraftedItem.CraftedByCharacterName);

        Assert.True(payload.Character.Inventory.EquipmentInstances.TryGetValue(payload.CraftedItem.InstanceId, out var owned));
        Assert.NotNull(owned);
        Assert.Equal(activeCharacter.CharacterId, owned.CraftedByCharacterId);
        Assert.Equal(activeCharacter.Name, owned.CraftedByCharacterName);
    }

    [Fact]
    public async Task PostBestiaryCraft_UsesRequestedCharacterContext()
    {
        const string accountId = "dev_account_craft_ready_context_override";
        var state = await GetAccountStateAsync(accountId);
        var defaultActiveCharacterId = state.Account.ActiveCharacterId;
        var alternateCharacterId = state.Account.Characters.Keys.Single(id =>
            !string.Equals(id, defaultActiveCharacterId, StringComparison.Ordinal));

        var switchResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/active-character",
            new SetActiveCharacterRequestDto(
                AccountId: accountId,
                CharacterId: alternateCharacterId));
        Assert.Equal(HttpStatusCode.OK, switchResponse.StatusCode);

        var craftResponse = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon",
                CharacterId: defaultActiveCharacterId));
        var craftPayload = await craftResponse.Content.ReadFromJsonAsync<BestiaryCraftResponseDto>();

        Assert.Equal(HttpStatusCode.OK, craftResponse.StatusCode);
        Assert.NotNull(craftPayload);
        Assert.Equal(defaultActiveCharacterId, craftPayload.Character.CharacterId);
        Assert.Equal(defaultActiveCharacterId, craftPayload.CraftedItem.CraftedByCharacterId);

        var persisted = await GetAccountStateAsync(accountId);
        Assert.Equal(alternateCharacterId, persisted.Account.ActiveCharacterId);
    }

    [Fact]
    public async Task PostBestiaryCraft_FailsWhenInsufficientFunds()
    {
        const string accountId = "dev_account_craft_insufficient";
        var response = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon"));
        var payload = await response.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal("validation_error", payload.Code);
        Assert.Contains("Not enough Primal Core", payload.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PostItemRefine_CommonToRare_DeductsCorrectBalances_AndPersistsTransition()
    {
        const string accountId = "dev_account_refine_ready_common";
        var state = await GetAccountStateAsync(accountId);
        var activeCharacter = state.Account.Characters[state.Account.ActiveCharacterId];
        var initialEchoFragments = state.Account.EchoFragmentsBalance;
        var initialPrimalCore = activeCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0);
        var commonItem = activeCharacter.Inventory.EquipmentInstances.Values
            .First(item =>
                string.Equals(item.OriginSpeciesId, "melee_brute", StringComparison.Ordinal) &&
                string.Equals(item.Rarity, "common", StringComparison.Ordinal));

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/items/refine?accountId={accountId}",
            new ItemRefineRequestDto(ItemInstanceId: commonItem.InstanceId));
        var payload = await response.Content.ReadFromJsonAsync<ItemRefineResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(initialEchoFragments - 200, payload.EchoFragmentsBalance);
        Assert.Equal(initialPrimalCore - 40, payload.Character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(commonItem.InstanceId, payload.RefinedItem.InstanceId);
        Assert.Equal("rare", payload.RefinedItem.Rarity);

        var finalState = await GetAccountStateAsync(accountId);
        var finalCharacter = finalState.Account.Characters[activeCharacter.CharacterId];
        var persistedItem = finalCharacter.Inventory.EquipmentInstances[commonItem.InstanceId];
        Assert.Equal("rare", persistedItem.Rarity);
        Assert.Equal(payload.EchoFragmentsBalance, finalState.Account.EchoFragmentsBalance);
        Assert.Equal(payload.Character.PrimalCoreBySpecies, finalCharacter.PrimalCoreBySpecies);
    }

    [Fact]
    public async Task PostItemRefine_RareToEpic_UsesSecondTierCosts()
    {
        const string accountId = "dev_account_refine_ready_rare_to_epic";
        var state = await GetAccountStateAsync(accountId);
        var activeCharacter = state.Account.Characters[state.Account.ActiveCharacterId];
        var commonItem = activeCharacter.Inventory.EquipmentInstances.Values
            .First(item =>
                string.Equals(item.OriginSpeciesId, "melee_brute", StringComparison.Ordinal) &&
                string.Equals(item.Rarity, "common", StringComparison.Ordinal));

        var firstResponse = await _client.PostAsJsonAsync(
            $"/api/v1/items/refine?accountId={accountId}",
            new ItemRefineRequestDto(ItemInstanceId: commonItem.InstanceId));
        var firstPayload = await firstResponse.Content.ReadFromJsonAsync<ItemRefineResponseDto>();
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.NotNull(firstPayload);
        Assert.Equal("rare", firstPayload.RefinedItem.Rarity);

        var secondResponse = await _client.PostAsJsonAsync(
            $"/api/v1/items/refine?accountId={accountId}",
            new ItemRefineRequestDto(ItemInstanceId: commonItem.InstanceId));
        var secondPayload = await secondResponse.Content.ReadFromJsonAsync<ItemRefineResponseDto>();
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        Assert.NotNull(secondPayload);
        Assert.Equal("epic", secondPayload.RefinedItem.Rarity);
        Assert.Equal(
            activeCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0) - 40 - 120,
            secondPayload.Character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(state.Account.EchoFragmentsBalance - 200 - 500, secondPayload.EchoFragmentsBalance);
    }

    [Fact]
    public async Task PostItemRefine_UsesRequestedCharacterContext()
    {
        const string accountId = "dev_account_refine_ready_context_override";
        var state = await GetAccountStateAsync(accountId);
        var defaultActiveCharacterId = state.Account.ActiveCharacterId;
        var alternateCharacterId = state.Account.Characters.Keys.Single(id =>
            !string.Equals(id, defaultActiveCharacterId, StringComparison.Ordinal));
        var defaultActiveCharacter = state.Account.Characters[defaultActiveCharacterId];
        var commonItem = defaultActiveCharacter.Inventory.EquipmentInstances.Values
            .First(item =>
                string.Equals(item.OriginSpeciesId, "melee_brute", StringComparison.Ordinal) &&
                string.Equals(item.Rarity, "common", StringComparison.Ordinal));

        var switchResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/active-character",
            new SetActiveCharacterRequestDto(
                AccountId: accountId,
                CharacterId: alternateCharacterId));
        Assert.Equal(HttpStatusCode.OK, switchResponse.StatusCode);

        var refineResponse = await _client.PostAsJsonAsync(
            $"/api/v1/items/refine?accountId={accountId}",
            new ItemRefineRequestDto(
                ItemInstanceId: commonItem.InstanceId,
                CharacterId: defaultActiveCharacterId));
        var refinePayload = await refineResponse.Content.ReadFromJsonAsync<ItemRefineResponseDto>();

        Assert.Equal(HttpStatusCode.OK, refineResponse.StatusCode);
        Assert.NotNull(refinePayload);
        Assert.Equal(defaultActiveCharacterId, refinePayload.Character.CharacterId);
        Assert.Equal(commonItem.InstanceId, refinePayload.RefinedItem.InstanceId);
        Assert.Equal("rare", refinePayload.RefinedItem.Rarity);
    }

    [Fact]
    public async Task PostItemRefine_FailsWhenTryingToRefineBeyondLegendary()
    {
        const string accountId = "dev_account_refine_legendary_cap";
        var state = await GetAccountStateAsync(accountId);
        var activeCharacter = state.Account.Characters[state.Account.ActiveCharacterId];
        var legendaryItem = activeCharacter.Inventory.EquipmentInstances.Values
            .First(item =>
                string.Equals(item.OriginSpeciesId, "melee_brute", StringComparison.Ordinal) &&
                string.Equals(item.Rarity, "legendary", StringComparison.Ordinal));

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/items/refine?accountId={accountId}",
            new ItemRefineRequestDto(ItemInstanceId: legendaryItem.InstanceId));
        var payload = await response.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal("validation_error", payload.Code);
        Assert.Contains("cannot be refined beyond Legendary", payload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PostItemSalvage_EndpointIsRemoved()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/items/salvage?accountId=dev_account",
            new { itemInstanceId = "any.instance" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostSetActiveCharacter_UpdatesActiveCharacter()
    {
        var state = await GetAccountStateAsync();
        var nextCharacterId = state.Account.Characters.Keys.First(id =>
            !string.Equals(id, state.Account.ActiveCharacterId, StringComparison.Ordinal));

        var response = await _client.PostAsJsonAsync(
            "/api/v1/account/active-character",
            new SetActiveCharacterRequestDto(
                AccountId: state.Account.AccountId,
                CharacterId: nextCharacterId));
        var payload = await response.Content.ReadFromJsonAsync<AccountStateDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(nextCharacterId, payload.ActiveCharacterId);
    }

    [Fact]
    public async Task PostEquipWeapon_FailsWhenNotOwnedAndSucceedsWhenOwned()
    {
        var state = await GetAccountStateAsync();
        var character = state.Account.Characters[state.Account.ActiveCharacterId];
        var notOwnedWeaponInstanceId = "not-owned.weapon.instance";

        var failResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/equip-weapon",
            new EquipWeaponRequestDto(
                AccountId: state.Account.AccountId,
                CharacterId: character.CharacterId,
                WeaponInstanceId: notOwnedWeaponInstanceId));
        Assert.Equal(HttpStatusCode.BadRequest, failResponse.StatusCode);

        var ownedWeaponInstanceId = FindOwnedEquipmentInstanceForSlot(state, character, "weapon");
        var successResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/equip-weapon",
            new EquipWeaponRequestDto(
                AccountId: state.Account.AccountId,
                CharacterId: character.CharacterId,
                WeaponInstanceId: ownedWeaponInstanceId));
        var payload = await successResponse.Content.ReadFromJsonAsync<CharacterStateDto>();

        Assert.Equal(HttpStatusCode.OK, successResponse.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(ownedWeaponInstanceId, payload.Equipment.WeaponInstanceId);
    }

    [Fact]
    public async Task PostEquipItem_EquipsWeaponSlot()
    {
        var state = await GetAccountStateAsync();
        var character = state.Account.Characters[state.Account.ActiveCharacterId];

        var ownedWeaponInstanceId = FindOwnedEquipmentInstanceForSlot(state, character, "weapon");
        var equipResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/equip-item",
            new EquipItemRequestDto(
                AccountId: state.Account.AccountId,
                CharacterId: character.CharacterId,
                Slot: "weapon",
                EquipmentInstanceId: ownedWeaponInstanceId));
        var payload = await equipResponse.Content.ReadFromJsonAsync<CharacterStateDto>();

        Assert.Equal(HttpStatusCode.OK, equipResponse.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(ownedWeaponInstanceId, payload.Equipment.WeaponInstanceId);

        var persisted = await GetAccountStateAsync(state.Account.AccountId);
        var persistedCharacter = persisted.Account.Characters[state.Account.ActiveCharacterId];
        Assert.Equal(ownedWeaponInstanceId, persistedCharacter.Equipment.WeaponInstanceId);
    }

    [Fact]
    public async Task PostEquipItem_FailsWhenBestiaryForgedWeaponIsEquippedByAnotherCharacter()
    {
        const string accountId = "dev_account_craft_ready_bound_weapon";
        var state = await GetAccountStateAsync(accountId);
        var creatorCharacterId = state.Account.ActiveCharacterId;
        var otherCharacterId = state.Account.Characters.Keys.Single(id =>
            !string.Equals(id, creatorCharacterId, StringComparison.Ordinal));

        var craftResponse = await _client.PostAsJsonAsync(
            $"/api/v1/bestiary/craft?accountId={accountId}",
            new BestiaryCraftRequestDto(
                SpeciesId: "melee_brute",
                Slot: "Weapon",
                CharacterId: creatorCharacterId));
        var craftPayload = await craftResponse.Content.ReadFromJsonAsync<BestiaryCraftResponseDto>();
        Assert.Equal(HttpStatusCode.OK, craftResponse.StatusCode);
        Assert.NotNull(craftPayload);

        var equipResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/equip-item",
            new EquipItemRequestDto(
                AccountId: accountId,
                CharacterId: otherCharacterId,
                Slot: "weapon",
                EquipmentInstanceId: craftPayload.CraftedItem.InstanceId));
        var equipPayload = await equipResponse.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, equipResponse.StatusCode);
        Assert.NotNull(equipPayload);
        Assert.Contains("bound to their creator", equipPayload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PostEquipItem_RejectsUnsupportedSlot()
    {
        var state = await GetAccountStateAsync();
        var character = state.Account.Characters[state.Account.ActiveCharacterId];
        var ownedWeaponInstanceId = FindOwnedEquipmentInstanceForSlot(state, character, "weapon");

        var response = await _client.PostAsJsonAsync(
            "/api/v1/account/equip-item",
            new EquipItemRequestDto(
                AccountId: state.Account.AccountId,
                CharacterId: character.CharacterId,
                Slot: "armor",
                EquipmentInstanceId: ownedWeaponInstanceId));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<ApiErrorDto>();
        Assert.NotNull(payload);
        Assert.Equal("validation_error", payload.Code);
        Assert.Contains("slot must be: weapon", payload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetSigilsInventory_ReturnsAccountWideSigils()
    {
        const string accountId = "dev_account_sigils_inventory";

        var response = await _client.GetAsync($"/api/v1/sigils/inventory?accountId={accountId}");
        var payload = await response.Content.ReadFromJsonAsync<SigilInventoryResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(accountId, payload.AccountId);
        Assert.NotEmpty(payload.Sigils);
        Assert.All(payload.Sigils, sigil => Assert.False(string.IsNullOrWhiteSpace(sigil.InstanceId)));
    }

    [Fact]
    public async Task GetSigilsLoadout_ReturnsFiveOrderedSlotsWithState()
    {
        const string accountId = "dev_account_sigils_loadout";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;

        var response = await _client.GetAsync($"/api/v1/sigils/loadout?accountId={accountId}&characterId={characterId}");
        var payload = await response.Content.ReadFromJsonAsync<CharacterSigilLoadoutStateDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(accountId, payload.AccountId);
        Assert.Equal(characterId, payload.CharacterId);
        Assert.Equal(5, payload.Slots.Count);
        Assert.Equal(1, payload.Slots[0].SlotIndex);
        Assert.Equal(5, payload.Slots[^1].SlotIndex);
    }

    [Fact]
    public async Task PostSigilsEquip_EquipsSpecificSlotAndReturnsUpdatedLoadout()
    {
        const string accountId = "dev_account_sigils_equip";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;
        var sigil = state.Account.SigilInventory.First();

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/equip?accountId={accountId}",
            new EquipSigilToSlotRequestDto(
                CharacterId: characterId,
                SlotIndex: sigil.SlotIndex,
                SigilInstanceId: sigil.InstanceId));
        var payload = await response.Content.ReadFromJsonAsync<SigilLoadoutMutationResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(characterId, payload.CharacterLoadout.CharacterId);
        var equippedSlot = payload.CharacterLoadout.Slots.Single(slot => slot.SlotIndex == sigil.SlotIndex);
        Assert.Equal(sigil.InstanceId, equippedSlot.EquippedSigil?.InstanceId);
    }

    [Fact]
    public async Task PostSigilsEquip_RejectsTierMismatch()
    {
        const string accountId = "dev_account_sigils_tier_mismatch";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;
        var sigil = state.Account.SigilInventory.First();
        var wrongSlot = sigil.SlotIndex == 1 ? 2 : 1;

        var response = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/equip?accountId={accountId}",
            new EquipSigilToSlotRequestDto(
                CharacterId: characterId,
                SlotIndex: wrongSlot,
                SigilInstanceId: sigil.InstanceId));
        var payload = await response.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Contains("tier-compatible", payload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PostSigilsEquip_RejectsWhenSigilAlreadyEquippedByAnotherCharacter()
    {
        const string accountId = "dev_account_sigils_unique_equip";
        var state = await GetAccountStateAsync(accountId);
        var firstCharacterId = state.Account.ActiveCharacterId;
        var secondCharacterId = state.Account.Characters.Keys.First(id =>
            !string.Equals(id, firstCharacterId, StringComparison.Ordinal));
        var sigil = state.Account.SigilInventory.First();

        var firstEquipResponse = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/equip?accountId={accountId}",
            new EquipSigilToSlotRequestDto(
                CharacterId: firstCharacterId,
                SlotIndex: sigil.SlotIndex,
                SigilInstanceId: sigil.InstanceId));
        Assert.Equal(HttpStatusCode.OK, firstEquipResponse.StatusCode);

        var secondEquipResponse = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/equip?accountId={accountId}",
            new EquipSigilToSlotRequestDto(
                CharacterId: secondCharacterId,
                SlotIndex: sigil.SlotIndex,
                SigilInstanceId: sigil.InstanceId));
        var payload = await secondEquipResponse.Content.ReadFromJsonAsync<ApiErrorDto>();

        Assert.Equal(HttpStatusCode.BadRequest, secondEquipResponse.StatusCode);
        Assert.NotNull(payload);
        Assert.Contains("already equipped", payload.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task StartBattle_AppliesSigilPassiveModifiers_WhenCharacterHasEquippedSigil()
    {
        const string accountId = "dev_account";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;
        var sigil = state.Account.SigilInventory
            .OrderBy(candidate => candidate.SlotIndex)
            .ThenByDescending(candidate => candidate.SigilLevel)
            .First();

        var initialUnequipResponse = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/unequip?accountId={accountId}",
            new UnequipSigilFromSlotRequestDto(
                CharacterId: characterId,
                SlotIndex: sigil.SlotIndex));
        Assert.Equal(HttpStatusCode.OK, initialUnequipResponse.StatusCode);

        try
        {
            var equipResponse = await _client.PostAsJsonAsync(
                $"/api/v1/sigils/equip?accountId={accountId}",
                new EquipSigilToSlotRequestDto(
                    CharacterId: characterId,
                    SlotIndex: sigil.SlotIndex,
                    SigilInstanceId: sigil.InstanceId));
            Assert.Equal(HttpStatusCode.OK, equipResponse.StatusCode);

            var start = await StartBattleAsync("arena-sigil-passive-applied", characterId, 1337);
            AssertArenaInvariants(start.Actors, characterId);
            var player = GetActor(start.Actors, characterId);
            Assert.True(player.MaxHp > ArenaConfig.PlayerBaseHp);
            Assert.Equal(player.MaxHp, player.Hp);
        }
        finally
        {
            var cleanupResponse = await _client.PostAsJsonAsync(
                $"/api/v1/sigils/unequip?accountId={accountId}",
                new UnequipSigilFromSlotRequestDto(
                    CharacterId: characterId,
                    SlotIndex: sigil.SlotIndex));
            Assert.Equal(HttpStatusCode.OK, cleanupResponse.StatusCode);
        }
    }

    [Fact]
    public async Task StartBattle_PreservesBaseStats_WhenNoSigilsAreEquipped()
    {
        const string accountId = "dev_account";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;
        var sigil = state.Account.SigilInventory
            .OrderBy(candidate => candidate.SlotIndex)
            .ThenByDescending(candidate => candidate.SigilLevel)
            .First();

        var unequipResponse = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/unequip?accountId={accountId}",
            new UnequipSigilFromSlotRequestDto(
                CharacterId: characterId,
                SlotIndex: sigil.SlotIndex));
        Assert.Equal(HttpStatusCode.OK, unequipResponse.StatusCode);

        var start = await StartBattleAsync("arena-sigil-passive-none", characterId, 1337);
        AssertArenaInvariants(start.Actors, characterId);
        var player = GetActor(start.Actors, characterId);
        Assert.Equal(ArenaConfig.PlayerBaseHp, player.MaxHp);
        Assert.Equal(ArenaConfig.PlayerBaseHp, player.Hp);
    }

    [Fact]
    public async Task StartBattle_IgnoresInvalidMissingSigilLoadoutState_Safely()
    {
        const string accountId = "dev_account";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;
        var sigil = state.Account.SigilInventory
            .OrderBy(candidate => candidate.SlotIndex)
            .ThenByDescending(candidate => candidate.SigilLevel)
            .First();
        var slotIndex = sigil.SlotIndex;

        var initialUnequipResponse = await _client.PostAsJsonAsync(
            $"/api/v1/sigils/unequip?accountId={accountId}",
            new UnequipSigilFromSlotRequestDto(
                CharacterId: characterId,
                SlotIndex: slotIndex));
        Assert.Equal(HttpStatusCode.OK, initialUnequipResponse.StatusCode);

        try
        {
            CorruptCharacterSigilLoadoutWithMissingSigil(
                accountId: accountId,
                characterId: characterId,
                slotIndex: slotIndex,
                missingSigilInstanceId: "sigil_missing_001");

            var start = await StartBattleAsync("arena-sigil-passive-invalid", characterId, 1337);
            AssertArenaInvariants(start.Actors, characterId);
            var player = GetActor(start.Actors, characterId);
            Assert.Equal(ArenaConfig.PlayerBaseHp, player.MaxHp);
            Assert.Equal(ArenaConfig.PlayerBaseHp, player.Hp);
        }
        finally
        {
            var cleanupResponse = await _client.PostAsJsonAsync(
                $"/api/v1/sigils/unequip?accountId={accountId}",
                new UnequipSigilFromSlotRequestDto(
                    CharacterId: characterId,
                    SlotIndex: slotIndex));
            Assert.Equal(HttpStatusCode.OK, cleanupResponse.StatusCode);
        }
    }

    [Fact]
    public async Task PostAwardDrops_ChestCanCreateEquipmentInstance_AndDoesNotCreateMaterials()
    {
        var state = await GetAccountStateAsync("dev_account_awards_chest");
        var character = state.Account.Characters[state.Account.ActiveCharacterId];
        var beforeMaterialStacks = character.Inventory.MaterialStacks
            .OrderBy(entry => entry.Key, StringComparer.Ordinal)
            .ToList();
        var beforeEquipmentCount = character.Inventory.EquipmentInstances.Count;

        var battleId = "battle-award-chest-01";
        var request = new AwardDropsRequestDto(
            AccountId: state.Account.AccountId,
            CharacterId: character.CharacterId,
            BattleId: battleId,
            Sources:
            [
                new DropSourceDto(
                    Tick: 12,
                    SourceType: "chest",
                    SourceId: "poi.chest.01",
                    Species: null)
            ]);

        var response = await _client.PostAsJsonAsync("/api/v1/account/award-drops", request);
        var payload = await response.Content.ReadFromJsonAsync<AwardDropsResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(
            beforeMaterialStacks,
            payload.Character.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToList());
        Assert.DoesNotContain(payload.Awarded, drop => drop.ItemId.StartsWith("mat.", StringComparison.Ordinal));

        var awardedEquipment = payload.Awarded.FirstOrDefault(drop => !string.IsNullOrWhiteSpace(drop.EquipmentInstanceId));
        if (awardedEquipment is not null)
        {
            Assert.True(payload.Character.Inventory.EquipmentInstances.Count > beforeEquipmentCount);
            Assert.True(payload.Character.Inventory.EquipmentInstances.ContainsKey(awardedEquipment.EquipmentInstanceId!));
        }
        else
        {
            Assert.Equal(beforeEquipmentCount, payload.Character.Inventory.EquipmentInstances.Count);
        }
    }

    [Fact]
    public async Task PostAwardDrops_MobKillAwardsEchoFragmentsPrimalCoreAndBestiaryKill()
    {
        var state = await GetAccountStateAsync("dev_account_awards_mob_once");
        var character = state.Account.Characters[state.Account.ActiveCharacterId];
        var initialEchoFragments = state.Account.EchoFragmentsBalance;
        var initialMaterialStacks = character.Inventory.MaterialStacks
            .OrderBy(entry => entry.Key, StringComparer.Ordinal)
            .ToList();
        var initialKills = character.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0);
        var initialPrimalCore = character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0);

        var request = new AwardDropsRequestDto(
            AccountId: state.Account.AccountId,
            CharacterId: character.CharacterId,
            BattleId: "battle-award-mob-01",
            Sources:
            [
                new DropSourceDto(
                    Tick: 9,
                    SourceType: "mob",
                    SourceId: "mob.0009",
                    Species: "melee_brute")
            ]);

        var response = await _client.PostAsJsonAsync("/api/v1/account/award-drops", request);
        var payload = await response.Content.ReadFromJsonAsync<AwardDropsResponseDto>();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(
            initialMaterialStacks,
            payload.Character.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToList());
        Assert.Equal(initialKills + 1, payload.Character.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(initialPrimalCore + 1, payload.Character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Contains(payload.Awarded, drop => drop.RewardKind == "echo_fragments" && drop.Quantity == 1);
        Assert.Contains(payload.Awarded, drop => drop.RewardKind == "primal_core" && drop.Species == "melee_brute" && drop.Quantity == 1);
        Assert.DoesNotContain(payload.Awarded, drop => drop.ItemId.StartsWith("mat.", StringComparison.Ordinal));

        var finalState = await GetAccountStateAsync(state.Account.AccountId);
        var finalCharacter = finalState.Account.Characters[character.CharacterId];
        Assert.Equal(initialEchoFragments + 1, finalState.Account.EchoFragmentsBalance);
        Assert.Equal(initialKills + 1, finalCharacter.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(initialPrimalCore + 1, finalCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(
            initialMaterialStacks,
            finalCharacter.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToList());
    }

    [Fact]
    public async Task PostAwardDrops_IsIdempotentForSameSourceAndNoDoubleCounting()
    {
        var state = await GetAccountStateAsync("dev_account_award_idempotent");
        var character = state.Account.Characters[state.Account.ActiveCharacterId];
        var initialEchoFragments = state.Account.EchoFragmentsBalance;
        var initialMaterialStacks = character.Inventory.MaterialStacks
            .OrderBy(entry => entry.Key, StringComparer.Ordinal)
            .ToList();
        var initialKills = character.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0);
        var initialPrimalCore = character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0);

        var request = new AwardDropsRequestDto(
            AccountId: state.Account.AccountId,
            CharacterId: character.CharacterId,
            BattleId: "battle-award-idempotent-01",
            Sources:
            [
                new DropSourceDto(
                    Tick: 7,
                    SourceType: "mob",
                    SourceId: "mob.0007",
                    Species: "melee_brute")
            ]);

        var firstResponse = await _client.PostAsJsonAsync("/api/v1/account/award-drops", request);
        var firstPayload = await firstResponse.Content.ReadFromJsonAsync<AwardDropsResponseDto>();
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.NotNull(firstPayload);

        var secondResponse = await _client.PostAsJsonAsync("/api/v1/account/award-drops", request);
        var secondPayload = await secondResponse.Content.ReadFromJsonAsync<AwardDropsResponseDto>();
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        Assert.NotNull(secondPayload);

        var firstSignatures = firstPayload.Awarded
            .Select(drop => $"{drop.DropEventId}|{drop.ItemId}|{drop.Quantity}|{drop.EquipmentInstanceId}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        var secondSignatures = secondPayload.Awarded
            .Select(drop => $"{drop.DropEventId}|{drop.ItemId}|{drop.Quantity}|{drop.EquipmentInstanceId}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        Assert.Equal(firstSignatures, secondSignatures);

        var finalState = await GetAccountStateAsync(state.Account.AccountId);
        var finalCharacter = finalState.Account.Characters[character.CharacterId];
        Assert.Equal(
            initialMaterialStacks,
            finalCharacter.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToList());
        Assert.Equal(initialEchoFragments + 1, finalState.Account.EchoFragmentsBalance);
        Assert.Equal(initialKills + 1, finalCharacter.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(initialPrimalCore + 1, finalCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(
            finalCharacter.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToList(),
            secondPayload.Character.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToList());
        Assert.Equal(
            finalCharacter.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0),
            secondPayload.Character.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(
            finalCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0),
            secondPayload.Character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.DoesNotContain(firstPayload.Awarded, drop => drop.ItemId.StartsWith("mat.", StringComparison.Ordinal));
        Assert.DoesNotContain(secondPayload.Awarded, drop => drop.ItemId.StartsWith("mat.", StringComparison.Ordinal));
    }

    [Fact]
    public async Task PostAwardDrops_IsIdempotentAcrossBattlesWhenRunIdMatches()
    {
        var state = await GetAccountStateAsync("dev_account_award_run_idempotent");
        var character = state.Account.Characters[state.Account.ActiveCharacterId];
        var initialEchoFragments = state.Account.EchoFragmentsBalance;
        var initialKills = character.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0);
        var initialPrimalCore = character.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0);

        const string runId = "run-idempotent-replay-01";
        var firstRequest = new AwardDropsRequestDto(
            AccountId: state.Account.AccountId,
            CharacterId: character.CharacterId,
            BattleId: "battle-run-idempotent-a",
            Sources:
            [
                new DropSourceDto(
                    Tick: 11,
                    SourceType: "mob",
                    SourceId: "mob.0011",
                    Species: "melee_brute")
            ],
            RunId: runId);

        var firstResponse = await _client.PostAsJsonAsync("/api/v1/account/award-drops", firstRequest);
        var firstPayload = await firstResponse.Content.ReadFromJsonAsync<AwardDropsResponseDto>();
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.NotNull(firstPayload);

        var replayRequest = firstRequest with { BattleId = "battle-run-idempotent-b" };
        var replayResponse = await _client.PostAsJsonAsync("/api/v1/account/award-drops", replayRequest);
        var replayPayload = await replayResponse.Content.ReadFromJsonAsync<AwardDropsResponseDto>();
        Assert.Equal(HttpStatusCode.OK, replayResponse.StatusCode);
        Assert.NotNull(replayPayload);

        var firstSignatures = firstPayload.Awarded
            .Select(drop => $"{drop.DropEventId}|{drop.ItemId}|{drop.Quantity}|{drop.SourceId}|{drop.Tick}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        var replaySignatures = replayPayload.Awarded
            .Select(drop => $"{drop.DropEventId}|{drop.ItemId}|{drop.Quantity}|{drop.SourceId}|{drop.Tick}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        Assert.Equal(firstSignatures, replaySignatures);

        var finalState = await GetAccountStateAsync(state.Account.AccountId);
        var finalCharacter = finalState.Account.Characters[character.CharacterId];
        Assert.Equal(initialEchoFragments + 1, finalState.Account.EchoFragmentsBalance);
        Assert.Equal(initialKills + 1, finalCharacter.BestiaryKillsBySpecies.GetValueOrDefault("melee_brute", 0));
        Assert.Equal(initialPrimalCore + 1, finalCharacter.PrimalCoreBySpecies.GetValueOrDefault("melee_brute", 0));
    }

    [Fact]
    public async Task PostAwardDrops_MobKillAscendantDrop_WithControlledSeed_IsDeterministic()
    {
        const string accountId = "dev_account_ascendant_cap_deterministic";
        var state = await GetAccountStateAsync(accountId);
        var characterId = state.Account.ActiveCharacterId;
        const string speciesId = "melee_brute";
        var sources = BuildMobDropSources(prefix: "mob.ascendant.force", speciesId: speciesId, count: 50);

        int? matchedSeed = null;
        AwardDropsResponseDto? firstPayload = null;
        for (var seed = 1; seed <= 300; seed += 1)
        {
            var start = await StartBattleAsync($"arena-ascendant-force-a-{seed}", $"player-ascendant-force-a-{seed}", seed);
            var response = await _client.PostAsJsonAsync(
                "/api/v1/account/award-drops",
                new AwardDropsRequestDto(
                    AccountId: accountId,
                    CharacterId: characterId,
                    BattleId: start.BattleId,
                    Sources: sources));
            var payload = await response.Content.ReadFromJsonAsync<AwardDropsResponseDto>();

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.NotNull(payload);

            if (payload.Awarded.Any(drop => IsAscendantItemId(drop.ItemId)))
            {
                matchedSeed = seed;
                firstPayload = payload;
                break;
            }
        }

        if (!matchedSeed.HasValue || firstPayload is null)
        {
            throw new Xunit.Sdk.XunitException("No seed in range 1..300 produced an ascendant drop.");
        }

        var firstAscendantDrops = firstPayload.Awarded
            .Where(drop => IsAscendantItemId(drop.ItemId))
            .OrderBy(drop => drop.SourceId, StringComparer.Ordinal)
            .ThenBy(drop => drop.Tick)
            .ToList();
        Assert.NotEmpty(firstAscendantDrops);

        var expectedSlotByItemId = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["wpn.ascendant_forged_blade"] = "weapon",
            ["arm.ascendant_forged_mail"] = "armor",
            ["rel.ascendant_forged_emblem"] = "relic"
        };

        foreach (var drop in firstAscendantDrops)
        {
            Assert.Equal("item", drop.RewardKind);
            Assert.Equal(speciesId, drop.Species);
            Assert.False(string.IsNullOrWhiteSpace(drop.EquipmentInstanceId));

            var equipmentInstance = firstPayload.Character.Inventory.EquipmentInstances[drop.EquipmentInstanceId!];
            Assert.Equal("ascendant", equipmentInstance.Rarity);
            Assert.Equal(speciesId, equipmentInstance.OriginSpeciesId);
            Assert.True(expectedSlotByItemId.TryGetValue(drop.ItemId, out var expectedSlot));
            Assert.Equal(expectedSlot, equipmentInstance.Slot);
        }

        var secondStart = await StartBattleAsync(
            $"arena-ascendant-force-b-{matchedSeed.Value}",
            $"player-ascendant-force-b-{matchedSeed.Value}",
            matchedSeed.Value);
        var secondResponse = await _client.PostAsJsonAsync(
            "/api/v1/account/award-drops",
            new AwardDropsRequestDto(
                AccountId: accountId,
                CharacterId: characterId,
                BattleId: secondStart.BattleId,
                Sources: sources));
        var secondPayload = await secondResponse.Content.ReadFromJsonAsync<AwardDropsResponseDto>();

        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
        Assert.NotNull(secondPayload);

        var firstSignatures = firstAscendantDrops
            .Select(drop => $"{drop.SourceId}|{drop.Tick}|{drop.ItemId}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        var secondSignatures = secondPayload.Awarded
            .Where(drop => IsAscendantItemId(drop.ItemId))
            .Select(drop => $"{drop.SourceId}|{drop.Tick}|{drop.ItemId}")
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();

        Assert.Equal(firstSignatures, secondSignatures);
    }

    [Fact]
    public async Task PostBattleStart_WithFixedSeed_IsDeterministicAndInBounds()
    {
        const int seed = 1337;
        var first = await StartBattleAsync("arena-seed-a", "player-seed-a", seed);
        var second = await StartBattleAsync("arena-seed-b", "player-seed-b", seed);

        Assert.Equal(seed, first.Seed);
        Assert.Equal(seed, second.Seed);
        Assert.Equal("started", first.BattleStatus);
        Assert.Equal("up", first.FacingDirection);
        Assert.Equal(0, first.GlobalCooldownRemainingMs);
        Assert.Equal(GlobalCooldownMs, first.GlobalCooldownTotalMs);
        Assert.Equal(ElementType.Physical, first.PlayerBaseElement);
        Assert.Null(first.WeaponElement);
        Assert.Equal(0, second.GlobalCooldownRemainingMs);
        Assert.Equal(GlobalCooldownMs, second.GlobalCooldownTotalMs);
        Assert.Equal(ElementType.Physical, second.PlayerBaseElement);
        Assert.Null(second.WeaponElement);
        AssertArenaInvariants(first.Actors, "player-seed-a");
        AssertArenaInvariants(second.Actors, "player-seed-b");

        var firstMobTiles = first.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => (actor.ActorId, actor.TileX, actor.TileY))
            .ToList();
        var secondMobTiles = second.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => (actor.ActorId, actor.TileX, actor.TileY))
            .ToList();

        Assert.Equal(firstMobTiles, secondMobTiles);
    }

    [Fact]
    public async Task PostBattleStart_WithSeedOverride_PrefersOverrideOverSeed()
    {
        const int seed = 11;
        const int seedOverride = 1337;
        var first = await StartBattleAsync("arena-seed-override-a", "player-seed-override-a", seed, seedOverride);
        var second = await StartBattleAsync("arena-seed-override-b", "player-seed-override-b", seed, seedOverride);

        Assert.Equal(seedOverride, first.Seed);
        Assert.Equal(seedOverride, second.Seed);

        var firstMobTiles = first.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => (actor.ActorId, actor.TileX, actor.TileY))
            .ToList();
        var secondMobTiles = second.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => (actor.ActorId, actor.TileX, actor.TileY))
            .ToList();

        Assert.Equal(firstMobTiles, secondMobTiles);
    }

    [Fact]
    public async Task PostBattleStart_SpawnsMobsInPreferredRingWhenAvailable()
    {
        var start = await StartBattleAsync("arena-ring-spawn", "player-ring-spawn", 1337);
        AssertArenaInvariants(start.Actors, "player-ring-spawn");

        var mobTiles = start.Actors
            .Where(actor => actor.Kind == "mob")
            .Select(actor => (actor.TileX, actor.TileY))
            .ToList();

        Assert.Equal(GetExpectedMobCapForTick(start.Tick), mobTiles.Count);
        Assert.All(mobTiles, tile =>
        {
            var distance = ComputeChebyshevDistance(tile.TileX, tile.TileY, PlayerTileX, PlayerTileY);
            Assert.InRange(distance, 2, 4);
        });
    }

    [Fact]
    public async Task PostBattleStart_MobTypes_AreExposedInSnapshot()
    {
        var start = await StartBattleAsync("arena-mob-types", "player-mob-types", 1337);
        AssertArenaInvariants(start.Actors, "player-mob-types");

        // Accumulate all mob types seen across the run (all 4 types spawn during progression).
        var mobTypes = new HashSet<MobArchetype>();
        void CollectTypes(IReadOnlyList<ActorStateDto> actors)
        {
            foreach (var actor in actors.Where(a => a.Kind == "mob" && a.MobType is not null))
            {
                mobTypes.Add(actor.MobType!.Value);
            }
        }

        CollectTypes(start.Actors);
        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 1500 && mobTypes.Count < 4; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            step = await ChoosePendingCardIfAwaitingAsync(step, "player-mob-types");
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, "player-mob-types");
            CollectTypes(step.Actors);
            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        Assert.Contains(MobArchetype.MeleeBrute, mobTypes);
        Assert.Contains(MobArchetype.RangedArcher, mobTypes);
        Assert.Contains(MobArchetype.MeleeDemon, mobTypes);
        Assert.Contains(MobArchetype.RangedShaman, mobTypes);
    }

    [Fact]
    public async Task PostBattleStep_CooldownDecrementsByStepDeltaAndBlocksSpam()
    {
        const string playerId = "player-cooldown-rules";
        var start = await StartBattleAsync("arena-cooldown-rules", playerId, 4242);
        var configured = await DisableAssistAsync(start.BattleId, start.Tick, playerId);
        var firstCast = await StepBattleAsync(
            start.BattleId,
            configured.Tick,
            [new BattleCommandDto("cast_skill", "exori")]);
        AssertArenaInvariants(firstCast.Actors, playerId);

        var exoriAfterCast = GetSkill(firstCast, "exori");
        Assert.Equal(1200, exoriAfterCast.CooldownRemainingMs);
        Assert.Equal(GlobalCooldownMs, firstCast.GlobalCooldownRemainingMs);
        Assert.True(Assert.Single(firstCast.CommandResults).Ok);
        var exoriFxTiles = firstCast.Events
            .OfType<FxSpawnEventDto>()
            .Where(evt => evt.FxId == "fx.skill.exori")
            .Select(evt => (evt.TileX, evt.TileY))
            .OrderBy(tile => tile.TileY)
            .ThenBy(tile => tile.TileX)
            .ToList();
        Assert.Equal(8, exoriFxTiles.Count);
        Assert.DoesNotContain((PlayerTileX, PlayerTileY), exoriFxTiles);
        Assert.Contains((2, 2), exoriFxTiles);
        Assert.Contains((3, 2), exoriFxTiles);
        Assert.Contains((4, 4), exoriFxTiles);

        var secondCast = await StepBattleAsync(
            start.BattleId,
            firstCast.Tick,
            [new BattleCommandDto("cast_skill", "exori")]);
        AssertArenaInvariants(secondCast.Actors, playerId);

        var result = Assert.Single(secondCast.CommandResults);
        Assert.False(result.Ok);
        Assert.Equal("cooldown", result.Reason);
        Assert.Equal(GlobalCooldownMs - StepDeltaMs, secondCast.GlobalCooldownRemainingMs);
        Assert.DoesNotContain(secondCast.Events.OfType<FxSpawnEventDto>(), fx => fx.FxId == "fx.skill.exori");

        var exoriAfterSecondCast = GetSkill(secondCast, "exori");
        Assert.Equal(1200 - StepDeltaMs, exoriAfterSecondCast.CooldownRemainingMs);

        var readyStep = await WaitUntilSkillReadyAsync(start.BattleId, secondCast.Tick, "exori", playerId);
        Assert.Equal(0, GetSkill(readyStep, "exori").CooldownRemainingMs);

        var clampedStep = await StepBattleAsync(start.BattleId, readyStep.Tick, []);
        AssertArenaInvariants(clampedStep.Actors, playerId);
        Assert.Equal(0, GetSkill(clampedStep, "exori").CooldownRemainingMs);
    }

    [Fact]
    public async Task PostBattleStep_GlobalCooldown_BlocksOtherSkillUntilElapsed()
    {
        var start = await StartBattleAsync("arena-gcd-01", "player-gcd-01", 4343);
        AssertArenaInvariants(start.Actors, "player-gcd-01");
        Assert.Equal(0, start.GlobalCooldownRemainingMs);
        Assert.Equal(GlobalCooldownMs, start.GlobalCooldownTotalMs);

        var firstCast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("cast_skill", "exori")]);
        AssertArenaInvariants(firstCast.Actors, "player-gcd-01");
        Assert.True(Assert.Single(firstCast.CommandResults).Ok);
        Assert.Equal(GlobalCooldownMs, firstCast.GlobalCooldownRemainingMs);
        Assert.Equal(1200, GetSkill(firstCast, "exori").CooldownRemainingMs);

        var blockedByGcd = await StepBattleAsync(
            start.BattleId,
            firstCast.Tick,
            [new BattleCommandDto("cast_skill", "exori_min")]);
        AssertArenaInvariants(blockedByGcd.Actors, "player-gcd-01");

        var blockedResult = Assert.Single(blockedByGcd.CommandResults);
        Assert.False(blockedResult.Ok);
        Assert.Equal("global_cooldown", blockedResult.Reason);
        Assert.Equal(GlobalCooldownMs - StepDeltaMs, blockedByGcd.GlobalCooldownRemainingMs);
        Assert.Equal(0, GetSkill(blockedByGcd, "exori_min").CooldownRemainingMs);
        Assert.DoesNotContain(
            blockedByGcd.Events.OfType<FxSpawnEventDto>(),
            evt => evt.FxId == "fx.skill.exori_min");

        var castAfterGcd = await StepBattleAsync(
            start.BattleId,
            blockedByGcd.Tick,
            [new BattleCommandDto("cast_skill", "exori_min")]);
        AssertArenaInvariants(castAfterGcd.Actors, "player-gcd-01");

        Assert.True(Assert.Single(castAfterGcd.CommandResults).Ok);
        Assert.Equal(GlobalCooldownMs, castAfterGcd.GlobalCooldownRemainingMs);
        Assert.Equal(800, GetSkill(castAfterGcd, "exori_min").CooldownRemainingMs);
    }

    [Fact]
    public async Task PostBattleStart_ProvidesHealAndGuardSkillsWithExpectedCooldowns()
    {
        var start = await StartBattleAsync("arena-active-sustain-skills", "player-active-sustain-skills", 1337);
        AssertArenaInvariants(start.Actors, "player-active-sustain-skills");

        // Heal and Guard are no longer in the fixed weapon kit. The kit is: exori_min, exori, exori_mas.
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "heal");
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "guard");
        var exoriMin = Assert.Single(start.Skills, s => s.SkillId == "exori_min");
        var exori    = Assert.Single(start.Skills, s => s.SkillId == "exori");
        var exoriMas = Assert.Single(start.Skills, s => s.SkillId == "exori_mas");
        Assert.Equal(0, exoriMin.CooldownRemainingMs);
        Assert.Equal(0, exori.CooldownRemainingMs);
        Assert.Equal(0, exoriMas.CooldownRemainingMs);
    }

    [Fact]
    public async Task PostBattleStep_HealSkill_IncreasesHpAndClampsToMax()
    {
        // Heal has been removed from the fixed weapon kit. Casting it should fail with unknown_skill.
        var playerId = "player-heal-skill";
        var start = await StartBattleAsync("arena-heal-skill", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "heal");

        var step = await StepBattleAsync(start.BattleId, start.Tick,
            [new BattleCommandDto("cast_skill", "heal")]);
        AssertArenaInvariants(step.Actors, playerId);

        var result = Assert.Single(step.CommandResults);
        Assert.False(result.Ok);
        Assert.Equal("unknown_skill", result.Reason);
    }

    [Fact]
    public async Task PostBattleStep_GuardSkill_IncreasesShieldAndNeverExceedsCap()
    {
        // Guard has been removed from the fixed weapon kit. Casting it should fail with unknown_skill.
        var playerId = "player-guard-skill";
        var start = await StartBattleAsync("arena-guard-skill", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "guard");

        var step = await StepBattleAsync(start.BattleId, start.Tick,
            [new BattleCommandDto("cast_skill", "guard")]);
        AssertArenaInvariants(step.Actors, playerId);

        var result = Assert.Single(step.CommandResults);
        Assert.False(result.Ok);
        Assert.Equal("unknown_skill", result.Reason);
    }

    [Fact]
    public async Task PostBattleStep_HealAndGuard_SetCooldownsWithoutNeedingTargets()
    {
        // Heal and Guard are no longer in the kit; both cast attempts should fail with unknown_skill.
        var playerId = "player-no-target-heal-guard";
        var start = await StartBattleAsync("arena-no-target-heal-guard", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var healCast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("cast_skill", "heal")]);
        AssertArenaInvariants(healCast.Actors, playerId);
        var healResult = Assert.Single(healCast.CommandResults);
        Assert.False(healResult.Ok);
        Assert.Equal("unknown_skill", healResult.Reason);

        var guardCast = await StepBattleAsync(
            start.BattleId,
            healCast.Tick,
            [new BattleCommandDto("cast_skill", "guard")]);
        AssertArenaInvariants(guardCast.Actors, playerId);
        var guardResult = Assert.Single(guardCast.CommandResults);
        Assert.False(guardResult.Ok);
        Assert.Equal("unknown_skill", guardResult.Reason);
    }

    [Fact]
    public async Task PostBattleStep_GlobalCooldown_BlocksHealAndGuardWhenIssuedDuringGcd()
    {
        // Heal and Guard are no longer in the kit. We verify GCD blocking using exori_min and exori_mas instead.
        var start = await StartBattleAsync("arena-gcd-heal-guard", "player-gcd-heal-guard", 1337);
        AssertArenaInvariants(start.Actors, "player-gcd-heal-guard");

        var firstCast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("cast_skill", "exori")]);
        AssertArenaInvariants(firstCast.Actors, "player-gcd-heal-guard");
        Assert.True(Assert.Single(firstCast.CommandResults).Ok);
        Assert.Equal(GlobalCooldownMs, firstCast.GlobalCooldownRemainingMs);

        var blocked = await StepBattleAsync(
            start.BattleId,
            firstCast.Tick,
            [new BattleCommandDto("cast_skill", "exori_min"), new BattleCommandDto("cast_skill", "exori_mas")]);
        AssertArenaInvariants(blocked.Actors, "player-gcd-heal-guard");

        Assert.Equal(2, blocked.CommandResults.Count);
        Assert.All(blocked.CommandResults, result =>
        {
            Assert.False(result.Ok);
            Assert.Equal("global_cooldown", result.Reason);
        });
        Assert.Equal(0, GetSkill(blocked, "exori_min").CooldownRemainingMs);
        Assert.Equal(0, GetSkill(blocked, "exori_mas").CooldownRemainingMs);
    }

    [Fact]
    public async Task PostBattleStep_GlobalCooldown_DoesNotBlockPlayerAutoAttack()
    {
        var playerId = "player-gcd-auto-attack";
        var start = await StartBattleAsync("arena-gcd-auto-attack", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var skills = start.Skills;
        var sawAutoAttackDuringGcd = false;

        for (var stepIndex = 0; stepIndex < 120; stepIndex += 1)
        {
            var step = await StepBattleAsync(
                start.BattleId,
                currentTick,
                BuildReadySkillCommands(skills));
            currentTick = step.Tick;
            skills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var playerAutoAttackHitDuringGcd = step.GlobalCooldownRemainingMs > 0
                && step.Events
                    .OfType<DamageNumberEventDto>()
                    .Any(evt => IsPlayerAutoAttackDamageEvent(step, playerId, evt));

            if (playerAutoAttackHitDuringGcd)
            {
                sawAutoAttackDuringGcd = true;
                break;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        Assert.True(
            sawAutoAttackDuringGcd,
            "Expected at least one player auto-attack damage event while global cooldown was active.");
    }

    [Fact]
    public async Task PostBattleStep_CastNoTarget_StillSetsCooldownAndReturnsOk()
    {
        var playerId = "player-no-target-cooldown";
        BattleStartResponseDto? start = null;
        BattleStepResponseDto? cast = null;
        for (var seed = 1; seed <= 300; seed += 1)
        {
            var candidateStart = await StartBattleAsync("arena-no-target-cooldown", playerId, seed);
            AssertArenaInvariants(candidateStart.Actors, playerId);
            var candidateCast = await StepBattleAsync(
                candidateStart.BattleId,
                candidateStart.Tick,
                [new BattleCommandDto("cast_skill", "exori")]);
            AssertArenaInvariants(candidateCast.Actors, playerId);

            var candidateResult = Assert.Single(candidateCast.CommandResults);
            if (candidateResult.Ok && candidateResult.Reason == "no_target")
            {
                start = candidateStart;
                cast = candidateCast;
                break;
            }
        }

        Assert.NotNull(start);
        Assert.NotNull(cast);

        var castResult = Assert.Single(cast!.CommandResults);
        Assert.True(castResult.Ok);
        Assert.Equal("no_target", castResult.Reason);
        Assert.Equal(1200, GetSkill(cast, "exori").CooldownRemainingMs);
        Assert.DoesNotContain(
            cast.Events.OfType<DamageNumberEventDto>(),
            evt =>
                evt.AttackerEntityId == playerId &&
                evt.TargetEntityId.StartsWith("mob.slime.", StringComparison.Ordinal) &&
                evt.ElementType == ElementType.Fire);
    }

    [Fact]
    public async Task PostBattleStep_PlayerDamage_ConsumesShieldBeforeHp()
    {
        var playerId = "player-shield-priority";
        var start = await StartBattleAsync("arena-shield-priority", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var shieldGainStep = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("cast_skill", "exori")]);
        AssertArenaInvariants(shieldGainStep.Actors, playerId);

        var previousStep = shieldGainStep;
        for (var stepIndex = 0; stepIndex < 140; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, previousStep.Tick, []);
            AssertArenaInvariants(step.Actors, playerId);

            var playerDamageEvents = step.Events
                .OfType<DamageNumberEventDto>()
                .Where(evt => evt.TargetEntityId == playerId)
                .ToList();
            if (playerDamageEvents.Count == 0)
            {
                previousStep = step;
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var previousPlayer = GetActor(previousStep.Actors, playerId);
            var currentPlayer = GetActor(step.Actors, playerId);
            var autoAttackTriggered = step.Events
                .OfType<DamageNumberEventDto>()
                .Any(evt => IsPlayerAutoAttackDamageEvent(step, playerId, evt));
            var shieldBeforeDamage = Math.Min(
                previousPlayer.MaxShield,
                previousPlayer.Shield + (autoAttackTriggered ? 2 : 0));
            var incomingDamage = playerDamageEvents.Sum(evt => evt.DamageAmount);
            if (shieldBeforeDamage == 0 || incomingDamage == 0)
            {
                previousStep = step;
                continue;
            }

            var absorbed = Math.Min(shieldBeforeDamage, incomingDamage);
            var expectedShield = shieldBeforeDamage - absorbed;
            var expectedHp = Math.Max(0, previousPlayer.Hp - (incomingDamage - absorbed));

            Assert.Equal(expectedShield, currentPlayer.Shield);
            Assert.Equal(expectedHp, currentPlayer.Hp);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected at least one player damage step to validate shield absorption.");
    }

    [Fact]
    public async Task PostBattleStep_PlayerShieldCapAndDefeat_ResetShield()
    {
        var playerId = "player-shield-cap";
        var start = await StartBattleAsync("arena-shield-cap", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var startPlayer = GetActor(start.Actors, playerId);
        Assert.Equal((int)Math.Floor(startPlayer.MaxHp * 0.45d), startPlayer.MaxShield);

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        var sawPositiveShield = false;
        var sawDefeat = false;

        for (var stepIndex = 0; stepIndex < 500; stepIndex += 1)
        {
            var commands = BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            currentTick = step.Tick;
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var player = GetActor(step.Actors, playerId);
            Assert.InRange(player.Shield, 0, player.MaxShield);
            sawPositiveShield = sawPositiveShield || player.Shield > 0;

            if (step.BattleStatus == "defeat")
            {
                Assert.Equal(0, player.Hp);
                Assert.Equal(0, player.Shield);
                sawDefeat = true;
                break;
            }
        }

        Assert.True(sawPositiveShield, "Expected shield to increase at least once.");
        if (sawDefeat)
        {
            return;
        }
    }

    [Fact]
    public async Task PostBattleStep_AfterDefeat_CastIsRejected()
    {
        var playerId = "player-defeat-cast-reject";
        var start = await StartBattleAsync("arena-defeat-cast-reject", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        var configured = await DisableAssistAsync(start.BattleId, start.Tick, playerId);
        Assert.False(start.IsGameOver);
        Assert.Null(start.EndReason);

        var currentTick = configured.Tick;
        BattleStepResponseDto? defeatStep = null;
        for (var stepIndex = 0; stepIndex < 200; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);
            if (step.BattleStatus == "defeat")
            {
                defeatStep = step;
                break;
            }
        }

        Assert.NotNull(defeatStep);
        Assert.True(defeatStep!.IsGameOver);
        Assert.Equal("death", defeatStep.EndReason);
        var rejected = await StepBattleAsync(
            start.BattleId,
            defeatStep!.Tick,
            [new BattleCommandDto("cast_skill", "exori")]);
        AssertArenaInvariants(rejected.Actors, playerId);
        Assert.True(rejected.IsGameOver);
        Assert.Equal("death", rejected.EndReason);

        if (rejected.CommandResults.Count > 0)
        {
            var result = Assert.Single(rejected.CommandResults);
            Assert.False(result.Ok);
            Assert.Equal("defeat", result.Reason);
        }
    }

    [Fact]
    public async Task PostBattleStep_PlayerLifeLeech_HealsAfterPlayerDamage()
    {
        var playerId = "player-life-leech";
        var start = await StartBattleAsync("arena-life-leech", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        BattleStepResponseDto? reducedHpStep = null;
        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 100; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var player = GetActor(step.Actors, playerId);
            if (player.Hp < player.MaxHp)
            {
                reducedHpStep = step;
                break;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        Assert.NotNull(reducedHpStep);
        var previousStep = reducedHpStep!;
        var currentSkills = reducedHpStep!.Skills;

        for (var stepIndex = 0; stepIndex < 160; stepIndex += 1)
        {
            var commands = BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, previousStep.Tick, commands);
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var healEvents = step.Events
                .OfType<HealNumberEventDto>()
                .Where(evt => evt.ActorId == playerId && evt.Source == "life_leech")
                .ToList();
            if (healEvents.Count == 0)
            {
                previousStep = step;
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var incomingDamage = step.Events
                .OfType<DamageNumberEventDto>()
                .Where(evt => evt.TargetEntityId == playerId)
                .Sum(evt => evt.DamageAmount);
            if (incomingDamage > 0)
            {
                previousStep = step;
                continue;
            }

            var previousPlayer = GetActor(previousStep.Actors, playerId);
            var currentPlayer = GetActor(step.Actors, playerId);
            var totalHeal = healEvents.Sum(evt => evt.Amount);
            var expectedHp = Math.Min(currentPlayer.MaxHp, previousPlayer.Hp + totalHeal);

            Assert.True(totalHeal > 0, "Expected positive life leech heal amount.");
            Assert.Equal(expectedHp, currentPlayer.Hp);
            Assert.True(currentPlayer.Hp > previousPlayer.Hp, "Expected life leech to increase player HP.");
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected to observe a life leech heal event with net HP gain.");
    }

    [Fact]
    public async Task PostBattleStep_ExoriMas_UsesManhattanRadiusTwoShape()
    {
        var start = await StartBattleAsync("arena-exori-mas-shape", "player-exori-mas-shape", 2025);
        var cast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("cast_skill", "exori_mas")]);
        AssertArenaInvariants(cast.Actors, "player-exori-mas-shape");

        var fxTiles = cast.Events
            .OfType<FxSpawnEventDto>()
            .Where(evt => evt.FxId == "fx.skill.exori_mas")
            .Select(evt => (evt.TileX, evt.TileY))
            .OrderBy(tile => tile.TileY)
            .ThenBy(tile => tile.TileX)
            .ToList();

        Assert.Equal(12, fxTiles.Count);
        Assert.All(fxTiles, tile =>
        {
            var manhattan = Math.Abs(tile.TileX - PlayerTileX) + Math.Abs(tile.TileY - PlayerTileY);
            Assert.True(manhattan <= 2);
        });
        Assert.DoesNotContain((PlayerTileX, PlayerTileY), fxTiles);
        Assert.Contains((3, 1), fxTiles);
        Assert.Contains((1, 3), fxTiles);
        Assert.Contains((5, 3), fxTiles);
        Assert.Contains((3, 5), fxTiles);
        Assert.DoesNotContain((2, 1), fxTiles);
        Assert.DoesNotContain((5, 5), fxTiles);
    }

    [Fact]
    public async Task PostBattleStep_SetFacing_ChangesExoriMinFrontalTargeting()
    {
        var start = await StartBattleAsync("arena-facing-14", "player-facing-14", 2026);
        AssertArenaInvariants(start.Actors, "player-facing-14");

        var castUp = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("cast_skill", "exori_min")]);
        AssertArenaInvariants(castUp.Actors, "player-facing-14");

        Assert.True(Assert.Single(castUp.CommandResults).Ok);
        var upFxTiles = castUp.Events
            .OfType<FxSpawnEventDto>()
            .Where(evt => evt.FxId == "fx.skill.exori_min")
            .Select(evt => (evt.TileX, evt.TileY))
            .ToList();
        Assert.Equal(3, upFxTiles.Count);
        Assert.Contains((2, 2), upFxTiles);
        Assert.Contains((3, 2), upFxTiles);
        Assert.Contains((4, 2), upFxTiles);
        Assert.DoesNotContain((PlayerTileX, PlayerTileY), upFxTiles);

        var afterCooldown = await WaitUntilSkillReadyAsync(start.BattleId, castUp.Tick, "exori_min", "player-facing-14");
        var setFacing = await StepBattleAsync(
            start.BattleId,
            afterCooldown.Tick,
            [new BattleCommandDto("set_facing", Dir: "right")]);
        AssertArenaInvariants(setFacing.Actors, "player-facing-14");
        Assert.Equal("right", setFacing.FacingDirection);
        Assert.True(Assert.Single(setFacing.CommandResults).Ok);

        var castRight = await StepBattleAsync(
            start.BattleId,
            setFacing.Tick,
            [new BattleCommandDto("cast_skill", "exori_min")]);
        AssertArenaInvariants(castRight.Actors, "player-facing-14");

        var rightResult = Assert.Single(castRight.CommandResults);
        Assert.True(rightResult.Ok);
        var rightFxTiles = castRight.Events
            .OfType<FxSpawnEventDto>()
            .Where(evt => evt.FxId == "fx.skill.exori_min")
            .Select(evt => (evt.TileX, evt.TileY))
            .ToList();
        Assert.Equal(3, rightFxTiles.Count);
        Assert.Contains((4, 2), rightFxTiles);
        Assert.Contains((4, 3), rightFxTiles);
        Assert.Contains((4, 4), rightFxTiles);
        Assert.DoesNotContain((PlayerTileX, PlayerTileY), rightFxTiles);
    }

    [Fact]
    public async Task PostBattleStep_MovePlayer_AllowsCardinalAndDiagonal_WhenOpen()
    {
        // Player movement is disabled — all move_player commands return unknown_command and player stays fixed at (3,3).
        var playerId = "player-move-cardinal";
        var start = await StartBattleAsync("arena-move-cardinal", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        foreach (var direction in new[] { "right", "ne", "up", "nw", "left", "sw", "down", "se" })
        {
            var step = await StepBattleAsync(start.BattleId, start.Tick, [BuildMoveCommand(direction)]);
            AssertArenaInvariants(step.Actors, playerId);
            var result = Assert.Single(step.CommandResults);
            Assert.False(result.Ok);
            Assert.Equal("unknown_command", result.Reason);
            var player = GetActor(step.Actors, playerId);
            Assert.Equal(PlayerTileX, player.TileX);
            Assert.Equal(PlayerTileY, player.TileY);
        }
    }

    [Fact]
    public async Task PostBattleStep_MovePlayer_DiagonalMove_SucceedsWhenNorthAndWestOccupiedButTargetIsFree()
    {
        // Player movement is disabled — move_player always returns unknown_command regardless of board state.
        var playerId = "player-move-diagonal-adjacent";
        var start = await StartBattleAsync("arena-move-diagonal-adjacent", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var step = await StepBattleAsync(start.BattleId, start.Tick, [BuildMoveCommand("nw")]);
        AssertArenaInvariants(step.Actors, playerId);
        var result = Assert.Single(step.CommandResults);
        Assert.False(result.Ok);
        Assert.Equal("unknown_command", result.Reason);
        var player = GetActor(step.Actors, playerId);
        Assert.Equal(PlayerTileX, player.TileX);
        Assert.Equal(PlayerTileY, player.TileY);
    }

    [Fact]
    public async Task PostBattleStep_MovePlayer_CannotMoveIntoOccupiedDiagonalTile()
    {
        // Player movement is disabled — move_player always returns unknown_command regardless of tile occupancy.
        var playerId = "player-move-occupied-diagonal";
        var start = await StartBattleAsync("arena-move-occupied-diagonal", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var step = await StepBattleAsync(start.BattleId, start.Tick, [BuildMoveCommand("nw")]);
        AssertArenaInvariants(step.Actors, playerId);
        var result = Assert.Single(step.CommandResults);
        Assert.False(result.Ok);
        Assert.Equal("unknown_command", result.Reason);
        var player = GetActor(step.Actors, playerId);
        Assert.Equal(PlayerTileX, player.TileX);
        Assert.Equal(PlayerTileY, player.TileY);
    }

    [Fact]
    public async Task PostBattleStep_MovePlayer_CannotMoveOutOfBoundsDiagonally()
    {
        // Player movement is disabled — move_player always returns unknown_command. Player is fixed at (3,3).
        var playerId = "player-move-bounds-diagonal";
        var start = await StartBattleAsync("arena-move-bounds-diagonal", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var step = await StepBattleAsync(start.BattleId, start.Tick, [BuildMoveCommand("nw")]);
        AssertArenaInvariants(step.Actors, playerId);
        var result = Assert.Single(step.CommandResults);
        Assert.False(result.Ok);
        Assert.Equal("unknown_command", result.Reason);
        var player = GetActor(step.Actors, playerId);
        Assert.Equal(PlayerTileX, player.TileX);
        Assert.Equal(PlayerTileY, player.TileY);
    }

    [Fact]
    public async Task PostBattleStep_MovePlayer_CooldownPreventsMovingEveryTick()
    {
        // Player movement is disabled — move_player always returns unknown_command. No cooldown applies.
        var playerId = "player-move-cooldown";
        var start = await StartBattleAsync("arena-move-cooldown", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var firstMove = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [BuildMoveCommand("right")]);
        AssertArenaInvariants(firstMove.Actors, playerId);
        var firstMoveResult = Assert.Single(firstMove.CommandResults);
        Assert.False(firstMoveResult.Ok);
        Assert.Equal("unknown_command", firstMoveResult.Reason);
        var playerAfterFirst = GetActor(firstMove.Actors, playerId);
        Assert.Equal(PlayerTileX, playerAfterFirst.TileX);
        Assert.Equal(PlayerTileY, playerAfterFirst.TileY);

        var secondMove = await StepBattleAsync(
            start.BattleId,
            firstMove.Tick,
            [BuildMoveCommand("right")]);
        AssertArenaInvariants(secondMove.Actors, playerId);
        var secondMoveResult = Assert.Single(secondMove.CommandResults);
        Assert.False(secondMoveResult.Ok);
        Assert.Equal("unknown_command", secondMoveResult.Reason);
        var playerAfterSecond = GetActor(secondMove.Actors, playerId);
        Assert.Equal(PlayerTileX, playerAfterSecond.TileX);
        Assert.Equal(PlayerTileY, playerAfterSecond.TileY);
    }

    [Fact]
    public async Task PostBattleStep_MovePlayer_IsDeterministicForSameSeedAndCommandSequence()
    {
        const int seed = 1337;
        var playerId = "player-move-determinism";
        var firstStart = await StartBattleAsync("arena-move-determinism-a", playerId, seed);
        var secondStart = await StartBattleAsync("arena-move-determinism-b", playerId, seed);
        AssertArenaInvariants(firstStart.Actors, playerId);
        AssertArenaInvariants(secondStart.Actors, playerId);

        var scriptedCommands = new IReadOnlyList<BattleCommandDto>[]
        {
            [BuildMoveCommand("right")],
            [BuildMoveCommand("up")],
            [],
            [BuildMoveCommand("ne")],
            [],
            [BuildMoveCommand("left")],
            [BuildMoveCommand("sw")],
            []
        };

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;
        for (var stepIndex = 0; stepIndex < scriptedCommands.Length; stepIndex += 1)
        {
            var commands = scriptedCommands[stepIndex];
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, commands);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, commands);
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;
            AssertArenaInvariants(firstStep.Actors, playerId);
            AssertArenaInvariants(secondStep.Actors, playerId);

            var firstPlayer = GetActor(firstStep.Actors, playerId);
            var secondPlayer = GetActor(secondStep.Actors, playerId);
            Assert.Equal(firstPlayer.TileX, secondPlayer.TileX);
            Assert.Equal(firstPlayer.TileY, secondPlayer.TileY);
            Assert.Equal(firstStep.FacingDirection, secondStep.FacingDirection);
            Assert.Equal(
                firstStep.CommandResults.Select(result => $"{result.Index}:{result.Type}:{result.Ok}:{result.Reason}").ToList(),
                secondStep.CommandResults.Select(result => $"{result.Index}:{result.Type}:{result.Ok}:{result.Reason}").ToList());
            Assert.Equal(
                firstStep.Events.Select(ToEventSignature).ToList(),
                secondStep.Events.Select(ToEventSignature).ToList());
        }
    }

    [Fact]
    public async Task PostBattleStep_InteractPoi_OutOfRangeFails()
    {
        // Range check was removed in Prompt 1. Verify that an unknown POI ID fails with "unknown_poi".
        var playerId = "player-interact-poi-out-range";
        var start = await StartBattleAsync("arena-interact-poi-out-range", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        const string unknownPoiId = "poi-does-not-exist";
        var step = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [BuildInteractPoiCommand(unknownPoiId)]);
        AssertArenaInvariants(step.Actors, playerId);

        var result = Assert.Single(step.CommandResults);
        Assert.Equal("interact_poi", result.Type);
        Assert.False(result.Ok);
        Assert.Equal("unknown_poi", result.Reason);
        Assert.Contains(
            step.Events.OfType<InteractFailedEventDto>(),
            evt => evt.PoiId == unknownPoiId && evt.Reason == "unknown_poi");
    }

    [Fact]
    public async Task PostBattleStep_InteractPoi_InRangeSucceedsAndConsumesPoi()
    {
        var playerId = "player-interact-poi-in-range";
        var start = await StartBattleAsync("arena-interact-poi-in-range", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        // No initial chest in Prompt-1 build; step forward until a chest spawns.
        BattleStepResponseDto? chestStep = null;
        BattlePoiDto? inRangePoi = null;
        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 2000; stepIndex += 1)
        {
            var s = await StepBattleAsync(start.BattleId, currentTick, []);
            s = await ChoosePendingCardIfAwaitingAsync(s, playerId);
            currentTick = s.Tick;
            AssertArenaInvariants(s.Actors, playerId);
            var chest = s.ActivePois.FirstOrDefault(poi => poi.Type == "chest");
            if (chest is not null)
            {
                chestStep = s;
                inRangePoi = chest;
                break;
            }
            if (s.BattleStatus == "defeat") break;
        }

        Assert.NotNull(chestStep);
        Assert.NotNull(inRangePoi);

        var step = await StepBattleAsync(
            start.BattleId,
            chestStep!.Tick,
            [BuildInteractPoiCommand(inRangePoi!.PoiId)]);
        AssertArenaInvariants(step.Actors, playerId);

        var result = Assert.Single(step.CommandResults);
        Assert.Equal("interact_poi", result.Type);
        Assert.True(result.Ok);
        Assert.Null(result.Reason);
        Assert.Contains(
            step.Events.OfType<PoiInteractedEventDto>(),
            evt => evt.PoiId == inRangePoi.PoiId && evt.PoiType == inRangePoi.Type);
        Assert.DoesNotContain(step.ActivePois, poi => poi.PoiId == inRangePoi.PoiId);
    }

    [Fact]
    public async Task PostBattleStep_ChestSpawnSchedule_IsDeterministicBySeed()
    {
        const int seed = 1337;
        var playerId = "player-poi-chest-determinism";
        var firstStart = await StartBattleAsync("arena-poi-chest-determinism-a", playerId, seed);
        var secondStart = await StartBattleAsync("arena-poi-chest-determinism-b", playerId, seed);
        AssertArenaInvariants(firstStart.Actors, playerId);
        AssertArenaInvariants(secondStart.Actors, playerId);

        // No initial chest in Prompt-1 build; start the spawn-check loop directly from start.
        var firstCurrentTick = firstStart.Tick;
        var secondCurrentTick = secondStart.Tick;
        IReadOnlyList<SkillStateDto> firstCurrentSkills = firstStart.Skills;
        BattleStepResponseDto? firstSpawnStep = null;
        BattleStepResponseDto? secondSpawnStep = null;
        BattlePoiDto? firstSpawnChest = null;
        BattlePoiDto? secondSpawnChest = null;
        for (var stepIndex = 0; stepIndex < 1120; stepIndex += 1)
        {
            var sustainCommands = new List<BattleCommandDto>(BuildReadySkillCommands(firstCurrentSkills));

            var firstStep = await StepBattleAsync(firstStart.BattleId, firstCurrentTick, sustainCommands);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondCurrentTick, sustainCommands);
            firstStep = await ChoosePendingCardIfAwaitingAsync(firstStep, playerId);
            secondStep = await ChoosePendingCardIfAwaitingAsync(secondStep, playerId);
            firstCurrentTick = firstStep.Tick;
            secondCurrentTick = secondStep.Tick;
            firstCurrentSkills = firstStep.Skills;
            AssertArenaInvariants(firstStep.Actors, playerId);
            AssertArenaInvariants(secondStep.Actors, playerId);

            var firstChest = firstStep.ActivePois
                .Where(poi => poi.Type == "chest")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            var secondChest = secondStep.ActivePois
                .Where(poi => poi.Type == "chest")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            Assert.Equal(firstChest is null, secondChest is null);
            if (firstChest is null || secondChest is null)
            {
                continue;
            }

            firstSpawnStep = firstStep;
            secondSpawnStep = secondStep;
            firstSpawnChest = firstChest;
            secondSpawnChest = secondChest;
            break;
        }

        Assert.NotNull(firstSpawnStep);
        Assert.NotNull(secondSpawnStep);
        Assert.NotNull(firstSpawnChest);
        Assert.NotNull(secondSpawnChest);
        Assert.Equal(firstSpawnStep!.Tick, secondSpawnStep!.Tick);
        Assert.Equal(firstSpawnChest!.PoiId, secondSpawnChest!.PoiId);
        Assert.Equal(firstSpawnChest.Type, secondSpawnChest.Type);
        Assert.Equal(firstSpawnChest.Pos.X, secondSpawnChest.Pos.X);
        Assert.Equal(firstSpawnChest.Pos.Y, secondSpawnChest.Pos.Y);
    }

    [Fact]
    public async Task PostBattleStep_AltarSpawnSchedule_IsDeterministicBySeed()
    {
        const int seed = 1337;
        var playerId = "player-poi-altar-determinism";
        var firstStart = await StartBattleAsync("arena-poi-altar-determinism-a", playerId, seed);
        var secondStart = await StartBattleAsync("arena-poi-altar-determinism-b", playerId, seed);
        AssertArenaInvariants(firstStart.Actors, playerId);
        AssertArenaInvariants(secondStart.Actors, playerId);

        BattleStepResponseDto? firstSpawnStep = null;
        BattleStepResponseDto? secondSpawnStep = null;
        BattlePoiDto? firstSpawnAltar = null;
        BattlePoiDto? secondSpawnAltar = null;
        var firstCurrentTick = firstStart.Tick;
        var secondCurrentTick = secondStart.Tick;
        IReadOnlyList<SkillStateDto> firstCurrentSkills = firstStart.Skills;
        for (var stepIndex = 0; stepIndex < 1400; stepIndex += 1)
        {
            var commands = BuildSustainCommands(firstCurrentSkills);
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstCurrentTick, commands);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondCurrentTick, commands);
            firstStep = await ChoosePendingCardIfAwaitingAsync(firstStep, playerId);
            secondStep = await ChoosePendingCardIfAwaitingAsync(secondStep, playerId);
            firstCurrentTick = firstStep.Tick;
            secondCurrentTick = secondStep.Tick;
            firstCurrentSkills = firstStep.Skills;
            AssertArenaInvariants(firstStep.Actors, playerId);
            AssertArenaInvariants(secondStep.Actors, playerId);

            var firstAltar = firstStep.ActivePois
                .Where(poi => poi.Type == "altar")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            var secondAltar = secondStep.ActivePois
                .Where(poi => poi.Type == "altar")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            Assert.Equal(firstAltar is null, secondAltar is null);
            if (firstAltar is null || secondAltar is null)
            {
                continue;
            }

            firstSpawnStep = firstStep;
            secondSpawnStep = secondStep;
            firstSpawnAltar = firstAltar;
            secondSpawnAltar = secondAltar;
            break;
        }

        Assert.NotNull(firstSpawnStep);
        Assert.NotNull(secondSpawnStep);
        Assert.NotNull(firstSpawnAltar);
        Assert.NotNull(secondSpawnAltar);
        Assert.Equal(firstSpawnStep!.Tick, secondSpawnStep!.Tick);
        Assert.Equal(firstSpawnAltar!.PoiId, secondSpawnAltar!.PoiId);
        Assert.Equal(firstSpawnAltar.Type, secondSpawnAltar.Type);
        Assert.Equal(firstSpawnAltar.Pos.X, secondSpawnAltar.Pos.X);
        Assert.Equal(firstSpawnAltar.Pos.Y, secondSpawnAltar.Pos.Y);
    }

    [Fact]
    public async Task PostBattleStep_InteractAltar_EnforcesGlobalCooldown()
    {
        const int seed = 1337;
        var playerId = "player-altar-cooldown";
        var start = await StartBattleAsync("arena-altar-cooldown", playerId, seed);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.Equal(0, start.AltarCooldownRemainingMs);

        var activation = await ActivateFirstAvailableAltarAsync(start, playerId, maxSteps: 2000);
        AssertArenaInvariants(activation.ActivatedStep.Actors, playerId);
        Assert.True(activation.ActivatedStep.AltarCooldownRemainingMs > 0);
        Assert.InRange(activation.ActivatedStep.AltarCooldownRemainingMs, 1, AltarCooldownMs);

        var current = activation.ActivatedStep;
        var sawCooldownRejection = false;
        var sawAltarWhileCooldownActive = false;
        for (var stepIndex = 0; stepIndex < 2000; stepIndex += 1)
        {
            if (current.BattleStatus == "defeat")
            {
                break;
            }

            var commands = new List<BattleCommandDto>();
            var altar = current.ActivePois
                .Where(poi => poi.Type == "altar")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            if (altar is null)
            {
                commands.AddRange(BuildSustainCommands(current.Skills));
            }
            else
            {
                if (current.AltarCooldownRemainingMs > 0)
                {
                    sawAltarWhileCooldownActive = true;
                }

                var player = GetActor(current.Actors, playerId);
                var distance = ComputeChebyshevDistance(player.TileX, player.TileY, altar.Pos.X, altar.Pos.Y);
                if (distance > 1)
                {
                    commands.Add(BuildMoveCommand(ResolveMoveDirectionToward(player.TileX, player.TileY, altar.Pos.X, altar.Pos.Y)));
                }

                commands.Add(BuildInteractPoiCommand(altar.PoiId));
            }

            var step = await StepBattleAsync(start.BattleId, current.Tick, commands);
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            current = step;
            AssertArenaInvariants(step.Actors, playerId);
            if (step.CommandResults.Any(result =>
                    result.Type == "interact_poi" &&
                    !result.Ok &&
                    result.Reason == "cooldown") &&
                step.Events.OfType<InteractFailedEventDto>().Any(evt => evt.Reason == "cooldown"))
            {
                sawCooldownRejection = true;
                break;
            }
        }

        if (sawAltarWhileCooldownActive)
        {
            Assert.True(sawCooldownRejection, "Expected altar interaction to fail with cooldown while altar cooldown was active.");
        }
    }

    [Fact]
    public async Task PostBattleStep_InteractAltar_SummonsUpToTwoMobsDeterministically_AndRespectsPoiOccupancy()
    {
        const int seed = 1337;
        var playerId = "player-altar-summon";
        var firstStart = await StartBattleAsync("arena-altar-summon-a", playerId, seed);
        var secondStart = await StartBattleAsync("arena-altar-summon-b", playerId, seed);
        AssertArenaInvariants(firstStart.Actors, playerId);
        AssertArenaInvariants(secondStart.Actors, playerId);

        var firstActivation = await ActivateFirstAvailableAltarAsync(firstStart, playerId, maxSteps: 2000);
        var secondActivation = await ActivateFirstAvailableAltarAsync(secondStart, playerId, maxSteps: 2000);
        AssertArenaInvariants(firstActivation.ActivatedStep.Actors, playerId);
        AssertArenaInvariants(secondActivation.ActivatedStep.Actors, playerId);

        var firstActivationEvent = Assert.Single(firstActivation.ActivatedStep.Events.OfType<AltarActivatedEventDto>());
        var secondActivationEvent = Assert.Single(secondActivation.ActivatedStep.Events.OfType<AltarActivatedEventDto>());
        Assert.Equal(AltarSummonSpawnCount, firstActivationEvent.RequestedCount);
        Assert.Equal(AltarSummonSpawnCount, secondActivationEvent.RequestedCount);
        Assert.InRange(firstActivationEvent.SpawnedCount, 0, AltarSummonSpawnCount);
        Assert.Equal(firstActivationEvent.SpawnedCount, secondActivationEvent.SpawnedCount);

        var firstMobCountBefore = firstActivation.ActorsBeforeActivation.Count(actor => actor.Kind == "mob");
        var firstMobCountAfter = firstActivation.ActivatedStep.Actors.Count(actor => actor.Kind == "mob");
        Assert.Equal(firstActivationEvent.SpawnedCount, firstMobCountAfter - firstMobCountBefore);
        Assert.DoesNotContain(firstActivation.ActivatedStep.ActivePois, poi => poi.PoiId == firstActivation.ConsumedPoiId);

        var secondMobCountBefore = secondActivation.ActorsBeforeActivation.Count(actor => actor.Kind == "mob");
        var secondMobCountAfter = secondActivation.ActivatedStep.Actors.Count(actor => actor.Kind == "mob");
        Assert.Equal(secondActivationEvent.SpawnedCount, secondMobCountAfter - secondMobCountBefore);
        Assert.DoesNotContain(secondActivation.ActivatedStep.ActivePois, poi => poi.PoiId == secondActivation.ConsumedPoiId);

        var firstMobSignature = firstActivation.ActivatedStep.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}")
            .ToList();
        var secondMobSignature = secondActivation.ActivatedStep.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}")
            .ToList();
        Assert.Equal(firstMobSignature, secondMobSignature);

        AssertNoMobOnPoiTile(firstActivation.ActivatedStep);
        AssertNoMobOnPoiTile(secondActivation.ActivatedStep);
    }

    [Fact]
    public async Task PostBattleStep_InteractChest_OffersCardChoice_AndPausesSimulation()
    {
        var playerId = "player-interact-chest-buff";
        var start = await StartBattleAsync("arena-interact-chest-buff", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        // No initial chest in Prompt-1 build; step forward until a chest spawns.
        BattleStepResponseDto? chestStep = null;
        BattlePoiDto? chest = null;
        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 2000; stepIndex += 1)
        {
            var s = await StepBattleAsync(start.BattleId, currentTick, []);
            s = await ChoosePendingCardIfAwaitingAsync(s, playerId);
            currentTick = s.Tick;
            AssertArenaInvariants(s.Actors, playerId);
            var c = s.ActivePois.FirstOrDefault(poi => poi.Type == "chest");
            if (c is not null) { chestStep = s; chest = c; break; }
            if (s.BattleStatus == "defeat") break;
        }
        Assert.NotNull(chestStep);
        Assert.NotNull(chest);

        var step = await StepBattleAsync(
            start.BattleId,
            chestStep!.Tick,
            [BuildInteractPoiCommand(chest!.PoiId)]);
        AssertArenaInvariants(step.Actors, playerId);

        var result = Assert.Single(step.CommandResults);
        Assert.Equal("interact_poi", result.Type);
        Assert.True(result.Ok);
        Assert.Contains(
            step.Events.OfType<PoiInteractedEventDto>(),
            evt => evt.PoiId == chest.PoiId && evt.PoiType == "chest");
        Assert.DoesNotContain(step.ActivePois, poi => poi.PoiId == chest.PoiId);
        Assert.Equal(chestStep!.ChestsOpened + 1, step.ChestsOpened);
        var offeredEvent = Assert.Single(step.Events.OfType<CardChoiceOfferedEventDto>());
        Assert.InRange(offeredEvent.OfferedCards.Count, 1, 3);
        Assert.True(step.IsAwaitingCardChoice);
        Assert.False(string.IsNullOrWhiteSpace(step.PendingChoiceId));
        Assert.Equal(offeredEvent.ChoiceId, step.PendingChoiceId);

        var pausedTick = step.Tick;
        var pausedStep = await StepBattleAsync(step.BattleId, step.Tick, []);
        AssertArenaInvariants(pausedStep.Actors, playerId);
        Assert.Equal(pausedTick, pausedStep.Tick);
        Assert.True(pausedStep.IsAwaitingCardChoice);
        Assert.Equal(step.PendingChoiceId, pausedStep.PendingChoiceId);
    }

    [Fact]
    public async Task PostBattleStep_InteractChest_ChooseCard_ResumesSimulation()
    {
        var playerId = "player-chest-card-choice-resume";
        var start = await StartBattleAsync("arena-heal-amp", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        // No initial chest in Prompt-1 build; step forward until a chest spawns.
        BattleStepResponseDto? chestStep = null;
        BattlePoiDto? chest = null;
        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 2000; stepIndex += 1)
        {
            var s = await StepBattleAsync(start.BattleId, currentTick, []);
            s = await ChoosePendingCardIfAwaitingAsync(s, playerId);
            currentTick = s.Tick;
            AssertArenaInvariants(s.Actors, playerId);
            var c = s.ActivePois.FirstOrDefault(poi => poi.Type == "chest");
            if (c is not null) { chestStep = s; chest = c; break; }
            if (s.BattleStatus == "defeat") break;
        }
        Assert.NotNull(chestStep);
        Assert.NotNull(chest);

        var offered = await StepBattleAsync(
            start.BattleId,
            chestStep!.Tick,
            [BuildInteractPoiCommand(chest!.PoiId)]);
        AssertArenaInvariants(offered.Actors, playerId);
        Assert.True(Assert.Single(offered.CommandResults).Ok);
        Assert.True(offered.IsAwaitingCardChoice);
        Assert.False(string.IsNullOrWhiteSpace(offered.PendingChoiceId));
        Assert.NotEmpty(offered.OfferedCards);
        Assert.DoesNotContain(offered.Events, evt => evt is BuffAppliedEventDto);

        var chosen = await ChooseCardAsync(
            offered.BattleId,
            offered.PendingChoiceId!,
            offered.OfferedCards[0].Id);
        AssertArenaInvariants(chosen.Actors, playerId);
        Assert.False(chosen.IsAwaitingCardChoice);
        Assert.Null(chosen.PendingChoiceId);

        var resumed = await StepBattleAsync(chosen.BattleId, chosen.Tick, []);
        AssertArenaInvariants(resumed.Actors, playerId);
        Assert.True(resumed.Tick > chosen.Tick);
    }

    [Fact]
    public async Task PostBattleStep_BestiaryKillCounters_IncrementPerSpeciesDeath()
    {
        var playerId = "player-bestiary-kills";
        var start = await StartBattleAsync("arena-bestiary-kills", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.NotEmpty(start.Bestiary);

        var currentTick = start.Tick;
        IReadOnlyList<SkillStateDto> currentSkills = start.Skills;
        IReadOnlyList<BestiaryEntryDto> currentBestiary = start.Bestiary;
        var sawMobDeath = false;
        for (var stepIndex = 0; stepIndex < 2400; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildSustainCommands(currentSkills));
            AssertArenaInvariants(step.Actors, playerId);

            var beforeBySpecies = ToBestiaryMap(currentBestiary);
            var afterBySpecies = ToBestiaryMap(step.Bestiary);
            var deathsBySpecies = step.Events
                .OfType<DeathEventDto>()
                .Where(evt => evt.EntityType == "mob" && evt.MobType is not null)
                .GroupBy(evt => MapMobArchetypeToSpeciesId(evt.MobType!.Value), StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
            if (deathsBySpecies.Count == 0)
            {
                currentTick = step.Tick;
                currentSkills = step.Skills;
                currentBestiary = step.Bestiary;
                continue;
            }

            sawMobDeath = true;
            foreach (var species in beforeBySpecies.Keys.OrderBy(value => value, StringComparer.Ordinal))
            {
                var expectedDelta = deathsBySpecies.TryGetValue(species, out var count) ? count : 0;
                Assert.Equal(beforeBySpecies[species].KillsTotal + expectedDelta, afterBySpecies[species].KillsTotal);
            }

            break;
        }

        Assert.True(sawMobDeath, "Expected at least one mob death to validate bestiary kill counters.");
    }

    [Fact]
    public async Task PostBattleStart_BestiaryRanks_InitializeFromThresholds()
    {
        var playerId = "player-bestiary-rank-initial";
        var start = await StartBattleAsync("arena-bestiary-rank-initial", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.NotEmpty(start.Bestiary);
        AssertBestiaryRanksMatchKills(start.Bestiary);
        Assert.All(start.Bestiary, entry => Assert.Equal(1, entry.Rank));
    }

    [Fact]
    public async Task PostBattleStep_BestiaryRanks_TransitionAtThresholds_AndTrackKills()
    {
        var playerId = "player-bestiary-rank-transition";
        var start = await StartBattleAsync("arena-bestiary-rank-transition", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.NotEmpty(start.Bestiary);
        AssertBestiaryRanksMatchKills(start.Bestiary);

        var currentTick = start.Tick;
        IReadOnlyList<SkillStateDto> currentSkills = start.Skills;
        IReadOnlyList<BestiaryEntryDto> currentBestiary = start.Bestiary;
        var sawRankTransition = false;
        for (var stepIndex = 0; stepIndex < 2600; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildSustainCommands(currentSkills));
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            AssertArenaInvariants(step.Actors, playerId);
            AssertBestiaryRanksMatchKills(step.Bestiary);

            var beforeBySpecies = ToBestiaryMap(currentBestiary);
            var afterBySpecies = ToBestiaryMap(step.Bestiary);
            foreach (var species in beforeBySpecies.Keys.OrderBy(value => value, StringComparer.Ordinal))
            {
                var previous = beforeBySpecies[species];
                var next = afterBySpecies[species];
                Assert.True(next.Rank >= previous.Rank);
                if (next.Rank <= previous.Rank)
                {
                    continue;
                }

                var thresholdForNewRank = ResolveBestiaryRankKillThreshold(next.Rank);
                Assert.True(previous.KillsTotal < thresholdForNewRank);
                Assert.True(next.KillsTotal >= thresholdForNewRank);
                sawRankTransition = true;
            }

            if (sawRankTransition)
            {
                break;
            }

            currentTick = step.Tick;
            currentSkills = step.Skills;
            currentBestiary = step.Bestiary;
        }

        Assert.True(sawRankTransition, "Expected at least one bestiary rank transition while kills accumulate.");
    }

    [Fact]
    public async Task PostBattleStep_SpeciesChestThresholds_AndSpawns_AreDeterministicBySeed()
    {
        const int seed = 1337;
        var playerId = "player-species-chest-determinism";
        var firstStart = await StartBattleAsync("arena-species-chest-determinism-a", playerId, seed);
        var secondStart = await StartBattleAsync("arena-species-chest-determinism-b", playerId, seed);
        AssertArenaInvariants(firstStart.Actors, playerId);
        AssertArenaInvariants(secondStart.Actors, playerId);
        Assert.Equal(ToBestiarySignature(firstStart.Bestiary), ToBestiarySignature(secondStart.Bestiary));
        Assert.Equal(firstStart.PendingSpeciesChest, secondStart.PendingSpeciesChest);

        // BestiaryFirstChestBaseKills=150 is not reachable in a single 3-minute run.
        // Seed kills to threshold-1 for MeleeBrute on both battles (same seed → same initial threshold).
        var bruteEntry = firstStart.Bestiary.First(e => string.Equals(e.Species, "melee_brute", StringComparison.Ordinal));
        var initialThreshold = bruteEntry.NextChestAtKills;
        SeedBestiaryKills(firstStart.BattleId, MobArchetype.MeleeBrute, initialThreshold - 1);
        SeedBestiaryKills(secondStart.BattleId, MobArchetype.MeleeBrute, initialThreshold - 1);

        var firstCurrentTick = firstStart.Tick;
        var secondCurrentTick = secondStart.Tick;
        IReadOnlyList<SkillStateDto> firstCurrentSkills = firstStart.Skills;

        BattleStepResponseDto? firstSpawnStep = null;
        BattleStepResponseDto? secondSpawnStep = null;
        BattlePoiDto? firstSpeciesChest = null;
        BattlePoiDto? secondSpeciesChest = null;
        for (var stepIndex = 0; stepIndex < 400; stepIndex += 1)
        {
            var commands = BuildSustainCommands(firstCurrentSkills);
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstCurrentTick, commands);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondCurrentTick, commands);
            firstStep = await ChoosePendingCardIfAwaitingAsync(firstStep, playerId);
            secondStep = await ChoosePendingCardIfAwaitingAsync(secondStep, playerId);
            AssertArenaInvariants(firstStep.Actors, playerId);
            AssertArenaInvariants(secondStep.Actors, playerId);

            Assert.Equal(ToBestiarySignature(firstStep.Bestiary), ToBestiarySignature(secondStep.Bestiary));
            Assert.Equal(firstStep.PendingSpeciesChest, secondStep.PendingSpeciesChest);

            var firstChest = firstStep.ActivePois
                .Where(poi => poi.Type == "species_chest")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            var secondChest = secondStep.ActivePois
                .Where(poi => poi.Type == "species_chest")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            Assert.Equal(firstChest is null, secondChest is null);
            if (firstChest is not null && secondChest is not null)
            {
                firstSpawnStep = firstStep;
                secondSpawnStep = secondStep;
                firstSpeciesChest = firstChest;
                secondSpeciesChest = secondChest;
                break;
            }

            if (firstStep.BattleStatus == "defeat" || secondStep.BattleStatus == "defeat") break;

            firstCurrentTick = firstStep.Tick;
            secondCurrentTick = secondStep.Tick;
            firstCurrentSkills = firstStep.Skills;
        }

        Assert.NotNull(firstSpawnStep);
        Assert.NotNull(secondSpawnStep);
        Assert.NotNull(firstSpeciesChest);
        Assert.NotNull(secondSpeciesChest);
        Assert.Equal(firstSpawnStep!.Tick, secondSpawnStep!.Tick);
        Assert.Equal(firstSpeciesChest!.PoiId, secondSpeciesChest!.PoiId);
        Assert.Equal(firstSpeciesChest.Type, secondSpeciesChest.Type);
        Assert.Equal(firstSpeciesChest.Species, secondSpeciesChest.Species);
        Assert.Equal(firstSpeciesChest.Pos.X, secondSpeciesChest.Pos.X);
        Assert.Equal(firstSpeciesChest.Pos.Y, secondSpeciesChest.Pos.Y);
    }

    [Fact]
    public async Task PostBattleStep_SpeciesChestSpawn_DefersWhenChestActive_ThenSpawnsWhenSlotFrees()
    {
        var playerId = "player-species-chest-deferral";
        var start = await StartBattleAsync("arena-species-chest-deferral", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        // BestiaryFirstChestBaseKills=150 is not reachable in a single 3-minute run.
        // We must seed kills AFTER a regular chest has already spawned; otherwise the threshold
        // triggers before a chest is present and the species chest spawns immediately (no deferral).
        var bruteEntry = start.Bestiary.First(e => string.Equals(e.Species, "melee_brute", StringComparison.Ordinal));
        var initialThreshold = bruteEntry.NextChestAtKills;
        var seededKills = false;

        var currentTick = start.Tick;
        IReadOnlyList<SkillStateDto> currentSkills = start.Skills;
        string? pendingSpecies = null;
        var pendingObservedTick = 0;

        // Step until a regular chest is active AND the species chest threshold triggers simultaneously.
        for (var stepIndex = 0; stepIndex < 600; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildSustainCommands(currentSkills));
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            AssertArenaInvariants(step.Actors, playerId);

            // Once a regular chest slot is occupied, seed kills so the next MeleeBrute kill triggers deferral.
            if (!seededKills && step.ActivePois.Any(poi => poi.Type == "chest"))
            {
                SeedBestiaryKills(start.BattleId, MobArchetype.MeleeBrute, initialThreshold - 1);
                seededKills = true;
            }

            var hasActiveChest = step.ActivePois.Any(IsChestPoi);
            if (hasActiveChest && !string.IsNullOrWhiteSpace(step.PendingSpeciesChest))
            {
                pendingSpecies = step.PendingSpeciesChest;
                pendingObservedTick = step.Tick;
                currentTick = step.Tick;
                currentSkills = step.Skills;
                break;
            }

            currentTick = step.Tick;
            currentSkills = step.Skills;
            if (step.BattleStatus == "defeat") break;
        }

        Assert.False(string.IsNullOrWhiteSpace(pendingSpecies));

        BattleStepResponseDto? deferredSpawnStep = null;
        for (var stepIndex = 0; stepIndex < 480; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildSustainCommands(currentSkills));
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            AssertArenaInvariants(step.Actors, playerId);
            var speciesChest = step.ActivePois
                .Where(poi => poi.Type == "species_chest")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            if (speciesChest is not null && string.Equals(speciesChest.Species, pendingSpecies, StringComparison.Ordinal))
            {
                deferredSpawnStep = step;
                break;
            }

            if (step.BattleStatus == "defeat") break;
            currentTick = step.Tick;
            currentSkills = step.Skills;
        }

        Assert.NotNull(deferredSpawnStep);
        Assert.True(deferredSpawnStep!.Tick > pendingObservedTick);
        Assert.Equal(pendingSpecies, Assert.Single(deferredSpawnStep.ActivePois, poi => poi.Type == "species_chest").Species);
    }

    [Fact]
    public async Task PostBattleStep_InteractSpeciesChest_RequiresRange_OffersCardChoice_AndConsumesPoi()
    {
        var playerId = "player-species-chest-interact";
        var start = await StartBattleAsync("arena-species-chest-interact", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        // BestiaryFirstChestBaseKills=150 is not reachable organically; seed kills to threshold-1.
        var bruteEntry = start.Bestiary.First(e => string.Equals(e.Species, "melee_brute", StringComparison.Ordinal));
        SeedBestiaryKills(start.BattleId, MobArchetype.MeleeBrute, bruteEntry.NextChestAtKills - 1);

        BattleStepResponseDto? spawnStep = null;
        BattlePoiDto? speciesChest = null;
        var currentTick = start.Tick;
        IReadOnlyList<SkillStateDto> currentSkills = start.Skills;
        for (var stepIndex = 0; stepIndex < 400; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildSustainCommands(currentSkills));
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            AssertArenaInvariants(step.Actors, playerId);
            var activeSpeciesChest = step.ActivePois
                .Where(poi => poi.Type == "species_chest")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            if (activeSpeciesChest is not null)
            {
                spawnStep = step;
                speciesChest = activeSpeciesChest;
                break;
            }
            if (step.BattleStatus == "defeat") break;
            currentTick = step.Tick;
            currentSkills = step.Skills;
        }

        Assert.NotNull(spawnStep);
        Assert.NotNull(speciesChest);
        Assert.False(string.IsNullOrWhiteSpace(speciesChest!.Species));

        // Range check removed — interact with the species chest directly from spawnStep.
        var opened = await StepBattleAsync(
            spawnStep!.BattleId,
            spawnStep.Tick,
            [BuildInteractPoiCommand(speciesChest.PoiId)]);
        AssertArenaInvariants(opened.Actors, playerId);
        Assert.True(Assert.Single(opened.CommandResults).Ok);
        Assert.DoesNotContain(opened.ActivePois, poi => poi.PoiId == speciesChest.PoiId);
        Assert.Contains(
            opened.Events.OfType<PoiInteractedEventDto>(),
            evt => evt.PoiId == speciesChest.PoiId && evt.PoiType == "species_chest");
        var offeredEvent = Assert.Single(opened.Events.OfType<CardChoiceOfferedEventDto>());
        Assert.InRange(offeredEvent.OfferedCards.Count, 1, 3);
        Assert.True(opened.IsAwaitingCardChoice);
        Assert.False(string.IsNullOrWhiteSpace(opened.PendingChoiceId));
        Assert.Equal(offeredEvent.ChoiceId, opened.PendingChoiceId);
        Assert.DoesNotContain(opened.Events, evt => evt is BuffAppliedEventDto);
    }

    [Fact]
    public async Task PostBattleStep_BestiaryThreshold_AdvancesDeterministicallyAfterTrigger()
    {
        var playerId = "player-bestiary-threshold";
        var start = await StartBattleAsync("arena-bestiary-threshold", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.NotEmpty(start.Bestiary);

        // BestiaryFirstChestBaseKills=150 is not reachable in a single 3-minute run.
        // Seed kills to threshold-1 for MeleeBrute so the next kill triggers the threshold advance.
        var bruteEntry = start.Bestiary.First(e => string.Equals(e.Species, "melee_brute", StringComparison.Ordinal));
        var initialThreshold = bruteEntry.NextChestAtKills;
        Assert.InRange(initialThreshold, 150, 180); // Validate initial threshold is in expected range.
        SeedBestiaryKills(start.BattleId, MobArchetype.MeleeBrute, initialThreshold - 1);

        var currentTick = start.Tick;
        IReadOnlyList<SkillStateDto> currentSkills = start.Skills;
        IReadOnlyList<BestiaryEntryDto> currentBestiary = start.Bestiary;
        var sawThresholdAdvance = false;
        for (var stepIndex = 0; stepIndex < 200; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildSustainCommands(currentSkills));
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            AssertArenaInvariants(step.Actors, playerId);

            var afterBrute = step.Bestiary
                .FirstOrDefault(e => string.Equals(e.Species, "melee_brute", StringComparison.Ordinal));
            if (afterBrute is not null && afterBrute.NextChestAtKills > initialThreshold)
            {
                var delta = afterBrute.NextChestAtKills - initialThreshold;
                // BestiaryChestIncrementBaseKills=300, BestiaryChestIncrementRandomInclusiveMax=50.
                Assert.InRange(delta, 300, 350);
                Assert.True(afterBrute.KillsTotal >= initialThreshold);
                sawThresholdAdvance = true;
                break;
            }

            currentTick = step.Tick;
            currentSkills = step.Skills;
            currentBestiary = step.Bestiary;
            if (step.BattleStatus == "defeat") break;
        }

        Assert.True(sawThresholdAdvance, "Expected a bestiary threshold increase after reaching a species chest trigger.");
    }

    [Fact]
    public async Task PostBattleStep_MobsMoveTowardPlayer_ThenAutoAttacksTrigger()
    {
        var playerId = "player-auto-attacks";
        var start = await StartBattleAsync("arena-auto-attacks", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var initialMinDistance = start.Actors
            .Where(actor => actor.Kind == "mob")
            .Select(actor => ComputeChebyshevDistance(actor.TileX, actor.TileY, PlayerTileX, PlayerTileY))
            .Min();

        var currentTick = start.Tick;
        var gotCloser = false;
        var gotAdjacent = false;
        var sawPlayerDamage = false;
        var sawMobDamage = false;
        var sawPhysicalElementEvent = false;

        for (var stepIndex = 0; stepIndex < 24; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var mobDistances = step.Actors
                .Where(actor => actor.Kind == "mob")
                .Select(actor => ComputeChebyshevDistance(actor.TileX, actor.TileY, PlayerTileX, PlayerTileY))
                .ToList();

            if (mobDistances.Count > 0)
            {
                gotCloser = gotCloser || mobDistances.Min() < initialMinDistance;
                gotAdjacent = gotAdjacent || mobDistances.Any(distance => distance <= 1);
            }

            sawPlayerDamage = sawPlayerDamage || step.Events
                .OfType<DamageNumberEventDto>()
                .Any(evt => evt.TargetEntityId == playerId && evt.DamageAmount > 0);

            sawMobDamage = sawMobDamage || step.Events
                .OfType<DamageNumberEventDto>()
                .Any(evt => IsPlayerAutoAttackDamageEvent(step, playerId, evt));

            sawPhysicalElementEvent = sawPhysicalElementEvent
                || step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.Element == ElementType.Physical)
                || step.Events.OfType<DamageNumberEventDto>().Any(evt => evt.ElementType == ElementType.Physical);

            if (gotCloser && gotAdjacent && sawPlayerDamage && sawMobDamage && sawPhysicalElementEvent)
            {
                break;
            }
        }

        Assert.True(gotCloser, "Expected at least one mob to reduce distance to player.");
        Assert.True(gotAdjacent, "Expected at least one mob to become adjacent to player.");
        Assert.True(sawPlayerDamage, "Expected mob auto-attack damage on player.");
        Assert.True(sawMobDamage, "Expected player auto-attack damage on mobs.");
        Assert.True(sawPhysicalElementEvent, "Expected at least one emitted battle event with Physical element.");
    }

    [Fact]
    public async Task PostBattleStart_RunProgression_FieldsAreInitialized()
    {
        var start = await StartBattleAsync("arena-run-progression-start", "player-run-progression-start", 1337);
        AssertArenaInvariants(start.Actors, "player-run-progression-start");

        Assert.Equal(0, start.RunXp);
        Assert.Equal(RunInitialLevel, start.RunLevel);
        Assert.Equal(ComputeXpToNextLevel(start.RunLevel), start.XpToNextLevel);
    }

    [Fact]
    public async Task PostBattleStep_RunProgression_KillsGrantXp_LevelUpsCarryExcess_AndEmitEvents()
    {
        var playerId = "player-run-progression";
        var start = await StartBattleAsync("arena-run-progression", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.Equal(0, start.RunXp);
        Assert.Equal(RunInitialLevel, start.RunLevel);
        Assert.Equal(ComputeXpToNextLevel(start.RunLevel), start.XpToNextLevel);

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        var totalKillXp = 0;
        var sawKill = false;
        var sawLevelUp = false;
        var sawXpGainedEvent = false;

        for (var stepIndex = 0; stepIndex < 600; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, BuildReadySkillCommands(currentSkills));
            AssertArenaInvariants(step.Actors, playerId);

            var killedMobCount = step.Events
                .OfType<DeathEventDto>()
                .Count(evt => string.Equals(evt.EntityType, "mob", StringComparison.Ordinal));
            if (killedMobCount > 0)
            {
                sawKill = true;
                totalKillXp += killedMobCount * RunXpPerNormalMobKill;
            }

            var xpGainedEvents = step.Events.OfType<XpGainedEventDto>().ToList();
            Assert.Equal(killedMobCount, xpGainedEvents.Count);
            if (xpGainedEvents.Count > 0)
            {
                sawXpGainedEvent = true;
                Assert.All(xpGainedEvents, evt =>
                {
                    Assert.Equal(RunXpPerNormalMobKill, evt.Amount);
                    Assert.False(string.IsNullOrWhiteSpace(evt.SourceSpeciesId));
                });
            }

            var expectedProgress = ComputeExpectedRunProgress(totalKillXp);
            Assert.Equal(expectedProgress.RunLevel, step.RunLevel);
            Assert.Equal(expectedProgress.RunXp, step.RunXp);
            Assert.Equal(expectedProgress.XpToNextLevel, step.XpToNextLevel);

            var levelUpEvents = step.Events.OfType<LevelUpEventDto>().ToList();
            if (levelUpEvents.Count > 0)
            {
                sawLevelUp = true;
                var lastLevelUp = levelUpEvents[^1];
                Assert.Equal(step.RunLevel, lastLevelUp.NewLevel);
                Assert.Equal(step.RunXp, lastLevelUp.RunXp);
                Assert.Equal(step.XpToNextLevel, lastLevelUp.XpToNextLevel);
            }

            if (xpGainedEvents.Count > 0 && levelUpEvents.Count > 0)
            {
                var xpEventIndex = step.Events.ToList().FindIndex(evt => evt is XpGainedEventDto);
                var levelUpEventIndex = step.Events.ToList().FindIndex(evt => evt is LevelUpEventDto);
                Assert.True(
                    xpEventIndex >= 0 && levelUpEventIndex > xpEventIndex,
                    "Expected xp_gained events to be emitted before level_up events in the same step.");
            }

            if (sawKill && sawXpGainedEvent && sawLevelUp)
            {
                return;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }

            // Handle any pending card choice at the END to avoid replacing the step's kill/XP events.
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            currentTick = step.Tick;
            currentSkills = step.Skills;
        }

        Assert.True(sawKill, "Expected at least one mob kill to grant run XP.");
        Assert.True(sawXpGainedEvent, "Expected at least one xp_gained event for a mob kill.");
        Assert.True(sawLevelUp, "Expected at least one deterministic run level-up event.");
    }

    [Fact]
    public async Task PostBattleStep_RunProgression_XpGainedEventOrder_IsDeterministicForSameSeed()
    {
        const int seed = 1337;
        var firstStart = await StartBattleAsync("arena-run-xp-events-a", "player-run-xp-events", seed);
        var secondStart = await StartBattleAsync("arena-run-xp-events-b", "player-run-xp-events", seed);
        AssertArenaInvariants(firstStart.Actors, "player-run-xp-events");
        AssertArenaInvariants(secondStart.Actors, "player-run-xp-events");

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;
        var firstSkills = firstStart.Skills;
        var secondSkills = secondStart.Skills;
        var sawXpGain = false;

        for (var stepIndex = 0; stepIndex < 180; stepIndex += 1)
        {
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, BuildReadySkillCommands(firstSkills));
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, BuildReadySkillCommands(secondSkills));
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;
            firstSkills = firstStep.Skills;
            secondSkills = secondStep.Skills;
            AssertArenaInvariants(firstStep.Actors, "player-run-xp-events");
            AssertArenaInvariants(secondStep.Actors, "player-run-xp-events");

            var firstXpSignatures = firstStep.Events.OfType<XpGainedEventDto>()
                .Select(evt => $"{evt.Amount}:{evt.SourceSpeciesId}:{evt.IsElite}")
                .ToList();
            var secondXpSignatures = secondStep.Events.OfType<XpGainedEventDto>()
                .Select(evt => $"{evt.Amount}:{evt.SourceSpeciesId}:{evt.IsElite}")
                .ToList();

            Assert.Equal(firstXpSignatures, secondXpSignatures);
            sawXpGain = sawXpGain || firstXpSignatures.Count > 0;

            if (firstStep.BattleStatus == "defeat" || secondStep.BattleStatus == "defeat")
            {
                break;
            }
        }

        Assert.True(sawXpGain, "Expected at least one deterministic xp_gained event.");
    }

    [Fact]
    public async Task PostBattleStep_RangedMobs_DoNotRemainFarForLong()
    {
        var playerId = "player-ranged-band";
        var start = await StartBattleAsync("arena-ranged-band", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var trackedRangedMobIds = start.Actors
            .Where(IsRangedMob)
            .Select(actor => actor.ActorId)
            .ToList();
        Assert.NotEmpty(trackedRangedMobIds);

        var farStreakByMobId = trackedRangedMobIds.ToDictionary(id => id, _ => 0, StringComparer.Ordinal);
        var currentTick = start.Tick;

        for (var stepIndex = 0; stepIndex < 180; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            foreach (var mobId in trackedRangedMobIds)
            {
                var mob = step.Actors.FirstOrDefault(actor => actor.ActorId == mobId && IsRangedMob(actor));
                if (mob is null)
                {
                    farStreakByMobId[mobId] = 0;
                    continue;
                }

                var distance = ComputeChebyshevDistance(mob.TileX, mob.TileY, PlayerTileX, PlayerTileY);
                if (distance >= 4)
                {
                    farStreakByMobId[mobId] += 1;
                    Assert.True(
                        farStreakByMobId[mobId] <= 4,
                        $"Ranged mob '{mobId}' remained at distance >= 4 for too long.");
                }
                else
                {
                    farStreakByMobId[mobId] = 0;
                }
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }
    }

    [Fact]
    public async Task PostBattleStep_RangedCommitWindow_PreventsImmediateKitingAfterCloseHit()
    {
        var playerId = "player-ranged-commit";
        var start = await StartBattleAsync("arena-ranged-commit", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 420; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            foreach (var damage in step.Events.OfType<DamageNumberEventDto>())
            {
                if (damage.TargetEntityId != playerId || string.IsNullOrWhiteSpace(damage.AttackerEntityId))
                {
                    continue;
                }

                var attacker = step.Actors.FirstOrDefault(actor => actor.ActorId == damage.AttackerEntityId && IsRangedMob(actor));
                if (attacker is null)
                {
                    continue;
                }

                var nextStep = await StepBattleAsync(start.BattleId, currentTick, []);
                currentTick = nextStep.Tick;
                AssertArenaInvariants(nextStep.Actors, playerId);

                var attackerNext = nextStep.Actors.FirstOrDefault(actor => actor.ActorId == attacker.ActorId && IsRangedMob(actor));
                if (attackerNext is null)
                {
                    break;
                }

                Assert.Equal(attacker.TileX, attackerNext.TileX);
                Assert.Equal(attacker.TileY, attackerNext.TileY);
                return;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected a close ranged hit scenario to validate commit-window anti-kite behavior.");
    }

    [Fact]
    public async Task PostBattleStep_RangedBehavior_IsDeterministicForSameSeed()
    {
        var firstStart = await StartBattleAsync("arena-ranged-determinism-a", "player-ranged-determinism", 1337);
        var secondStart = await StartBattleAsync("arena-ranged-determinism-b", "player-ranged-determinism", 1337);
        AssertArenaInvariants(firstStart.Actors, "player-ranged-determinism");
        AssertArenaInvariants(secondStart.Actors, "player-ranged-determinism");

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;

        for (var stepIndex = 0; stepIndex < 72; stepIndex += 1)
        {
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, []);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, []);
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;

            AssertArenaInvariants(firstStep.Actors, "player-ranged-determinism");
            AssertArenaInvariants(secondStep.Actors, "player-ranged-determinism");

            var firstRanged = firstStep.Actors
                .Where(IsRangedMob)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}")
                .ToList();
            var secondRanged = secondStep.Actors
                .Where(IsRangedMob)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}")
                .ToList();

            Assert.Equal(firstRanged, secondRanged);
            Assert.Equal(
                firstStep.Events.Select(ToEventSignature).ToList(),
                secondStep.Events.Select(ToEventSignature).ToList());
        }
    }

    [Fact]
    public async Task PostBattleStep_KinaReflectPassive_ReflectsMeleeDamage()
    {
        var playerId = "player-reflect-melee";
        var start = await StartBattleAsync("arena-reflect-melee", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var previousPlayerShield = GetActor(start.Actors, playerId).Shield;
        for (var stepIndex = 0; stepIndex < 260; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            if (previousPlayerShield > 0)
            {
                previousPlayerShield = GetActor(step.Actors, playerId).Shield;
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var meleeHit = step.Events
                .OfType<DamageNumberEventDto>()
                .FirstOrDefault(evt =>
                {
                    if (evt.TargetEntityId != playerId || string.IsNullOrWhiteSpace(evt.AttackerEntityId) || evt.DamageAmount != 2)
                    {
                        return false;
                    }

                    var attacker = step.Actors.FirstOrDefault(actor => actor.ActorId == evt.AttackerEntityId);
                    return attacker is not null && IsMeleeMob(attacker);
                });

            if (meleeHit is null)
            {
                previousPlayerShield = GetActor(step.Actors, playerId).Shield;
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var matchingReflectEvents = step.Events
                .OfType<ReflectEventDto>()
                .Where(evt => evt.TargetEntityId == meleeHit.AttackerEntityId)
                .ToList();
            Assert.NotEmpty(matchingReflectEvents);
            Assert.Contains(
                matchingReflectEvents,
                evt =>
                    evt.SourceEntityId == playerId &&
                    evt.Amount == 1 &&
                    evt.ElementType == ElementType.Physical);
            var reflectEvent = matchingReflectEvents[0];

            Assert.Contains(
                step.Events.OfType<DamageNumberEventDto>(),
                evt =>
                    evt.AttackerEntityId == playerId &&
                    evt.TargetEntityId == meleeHit.AttackerEntityId &&
                    evt.ElementType == ElementType.Physical &&
                    evt.DamageAmount > 0 &&
                    evt.DamageAmount <= reflectEvent.Amount);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected melee mob damage with Kina reflect passive response.");
    }

    [Fact]
    public async Task PostBattleStep_KinaReflectPassive_AppliesRangedMultiplier()
    {
        var playerId = "player-reflect-ranged";
        var start = await StartBattleAsync("arena-reflect-ranged", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var previousPlayerShield = GetActor(start.Actors, playerId).Shield;
        for (var stepIndex = 0; stepIndex < 320; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            if (previousPlayerShield > 0)
            {
                previousPlayerShield = GetActor(step.Actors, playerId).Shield;
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var rangedHit = step.Events
                .OfType<DamageNumberEventDto>()
                .FirstOrDefault(evt =>
                {
                    if (evt.TargetEntityId != playerId || string.IsNullOrWhiteSpace(evt.AttackerEntityId) || evt.DamageAmount <= 0)
                    {
                        return false;
                    }

                    var attacker = step.Actors.FirstOrDefault(actor => actor.ActorId == evt.AttackerEntityId);
                    return attacker is not null && IsRangedMob(attacker);
                });

            if (rangedHit is null)
            {
                previousPlayerShield = GetActor(step.Actors, playerId).Shield;
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var expectedReflectedBase = Math.Max(1, (int)Math.Floor(rangedHit.DamageAmount * 0.2d));
            var expectedReflected = expectedReflectedBase * 2;
            var matchingReflectEvents = step.Events
                .OfType<ReflectEventDto>()
                .Where(evt => evt.TargetEntityId == rangedHit.AttackerEntityId)
                .ToList();
            Assert.NotEmpty(matchingReflectEvents);
            Assert.Contains(matchingReflectEvents, evt => evt.Amount == expectedReflected);
            var reflectEvent = matchingReflectEvents[0];

            Assert.Contains(
                step.Events.OfType<DamageNumberEventDto>(),
                evt =>
                    evt.AttackerEntityId == playerId &&
                    evt.TargetEntityId == rangedHit.AttackerEntityId &&
                    evt.ElementType == ElementType.Physical &&
                    evt.DamageAmount > 0 &&
                    evt.DamageAmount <= reflectEvent.Amount);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected ranged mob damage with reflect multiplier response.");
    }

    [Fact]
    public async Task PostBattleStep_KinaReflectPassive_DoesNotRecurse()
    {
        var playerId = "player-reflect-no-recursion";
        var start = await StartBattleAsync("arena-reflect-no-recursion", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var sawReflect = false;
        for (var stepIndex = 0; stepIndex < 220; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var reflectEvents = step.Events.OfType<ReflectEventDto>().ToList();
            if (reflectEvents.Count == 0)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            sawReflect = true;
            Assert.All(reflectEvents, reflectEvent =>
            {
                Assert.Equal(playerId, reflectEvent.SourceEntityId);
                Assert.NotEqual(playerId, reflectEvent.TargetEntityId);
                Assert.True(reflectEvent.Amount > 0);
            });

            // A recursion would produce additional reflect chains or reflected hits against the player.
            Assert.DoesNotContain(
                reflectEvents,
                reflectEvent => string.Equals(reflectEvent.TargetEntityId, playerId, StringComparison.Ordinal));
        }

        Assert.True(sawReflect, "Expected at least one reflect event during simulation.");
    }

    [Fact]
    public async Task PostBattleStep_Avalanche_GroundTarget_DamagesMobInsideAoe()
    {
        // Avalanche is no longer in the fixed kit — casting it should fail with unknown_skill.
        var playerId = "player-avalanche-hit";
        var start = await StartBattleAsync("arena-avalanche-hit", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "avalanche");

        var cast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto("set_ground_target", GroundTileX: 3, GroundTileY: 2),
                new BattleCommandDto("cast_skill", "avalanche")
            ]);
        AssertArenaInvariants(cast.Actors, playerId);

        Assert.True(cast.CommandResults.Count >= 2);
        Assert.True(cast.CommandResults[0].Ok);
        Assert.False(cast.CommandResults[1].Ok);
        Assert.Equal("unknown_skill", cast.CommandResults[1].Reason);
    }

    [Fact]
    public async Task PostBattleStep_Avalanche_NoTargets_StillConsumesCooldown()
    {
        // Avalanche is no longer in the fixed kit — casting it should fail with unknown_skill.
        var playerId = "player-avalanche-no-hit";
        var start = await StartBattleAsync("arena-avalanche-no-hit", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "avalanche");

        var cast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto("set_ground_target", GroundTileX: 3, GroundTileY: 0),
                new BattleCommandDto("cast_skill", "avalanche")
            ]);
        AssertArenaInvariants(cast.Actors, playerId);

        Assert.True(cast.CommandResults.Count >= 2);
        Assert.True(cast.CommandResults[0].Ok);
        Assert.False(cast.CommandResults[1].Ok);
        Assert.Equal("unknown_skill", cast.CommandResults[1].Reason);
    }

    [Fact]
    public async Task PostBattleStep_Avalanche_OutOfRange_FailsWithoutDamageOrCooldown()
    {
        // Avalanche is no longer in the fixed kit — casting it should fail with unknown_skill (not out_of_range).
        var playerId = "player-avalanche-out-of-range";
        var start = await StartBattleAsync("arena-avalanche-out-of-range", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "avalanche");

        var cast = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto("set_ground_target", GroundTileX: 0, GroundTileY: 0),
                new BattleCommandDto("cast_skill", "avalanche")
            ]);
        AssertArenaInvariants(cast.Actors, playerId);

        Assert.True(cast.CommandResults.Count >= 2);
        Assert.True(cast.CommandResults[0].Ok);
        Assert.False(cast.CommandResults[1].Ok);
        Assert.Equal("unknown_skill", cast.CommandResults[1].Reason);
    }

    [Fact]
    public async Task PostBattleStep_BruteCleave_AbilityTriggers()
    {
        var start = await StartBattleAsync("arena-brute-cleave", "player-brute-cleave", 1337);
        AssertArenaInvariants(start.Actors, "player-brute-cleave");

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 120; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, "player-brute-cleave");
            if (step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.FxId == "fx.mob.brute.cleave"))
            {
                return;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected brute cleave ability FX to trigger.");
    }

    [Fact]
    public async Task PostBattleStep_ArcherPowerShot_AbilityTriggers()
    {
        var start = await StartBattleAsync("arena-archer-shot", "player-archer-shot", 1337);
        AssertArenaInvariants(start.Actors, "player-archer-shot");

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 120; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, "player-archer-shot");
            if (step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.FxId == "fx.mob.archer.power_shot"))
            {
                return;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected archer power shot ability FX to trigger.");
    }

    [Fact]
    public async Task PostBattleStep_DemonBeam_AbilityTriggers()
    {
        var start = await StartBattleAsync("arena-demon-beam", "player-demon-beam", 1337);
        AssertArenaInvariants(start.Actors, "player-demon-beam");

        var configured = await DisableAssistAsync(start.BattleId, start.Tick, "player-demon-beam");
        var currentTick = configured.Tick;
        for (var stepIndex = 0; stepIndex < 500; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            step = await ChoosePendingCardIfAwaitingAsync(step, "player-demon-beam");
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, "player-demon-beam");
            if (step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.FxId == "fx.mob.demon.beam"))
            {
                return;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected demon beam ability FX to trigger.");
    }

    [Fact]
    public async Task PostBattleStep_ShamanStormPulse_AbilityTriggers()
    {
        var start = await StartBattleAsync("arena-shaman-storm-pulse", "player-shaman-storm-pulse", 1337);
        AssertArenaInvariants(start.Actors, "player-shaman-storm-pulse");

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 500; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            step = await ChoosePendingCardIfAwaitingAsync(step, "player-shaman-storm-pulse");
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, "player-shaman-storm-pulse");
            if (step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.FxId == "fx.mob.shaman.storm_pulse"))
            {
                return;
            }
            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected shaman storm pulse ability FX to trigger.");
    }

    [Fact]
    public void MobShapePlanner_LineForward_RotatesByFacing()
    {
        var up = MobShapePlanner.BuildForwardLineTiles(3, 3, "up", 4);
        Assert.Equal(new[] { (3, 2), (3, 1), (3, 0), (3, -1) }, up);

        var right = MobShapePlanner.BuildForwardLineTiles(3, 3, "right", 4);
        Assert.Equal(new[] { (4, 3), (5, 3), (6, 3), (7, 3) }, right);
    }

    [Fact]
    public void MobShapePlanner_ConeForward_RotatesByFacing()
    {
        var up = MobShapePlanner.BuildForwardConeTiles(3, 3, "up");
        Assert.Equal(9, up.Count);
        Assert.Contains((3, 2), up);
        Assert.Contains((2, 1), up);
        Assert.Contains((4, 1), up);
        Assert.Contains((1, 0), up);
        Assert.Contains((5, 0), up);

        var right = MobShapePlanner.BuildForwardConeTiles(3, 3, "right");
        Assert.Equal(9, right.Count);
        Assert.Contains((4, 3), right);
        Assert.Contains((5, 2), right);
        Assert.Contains((5, 4), right);
        Assert.Contains((6, 1), right);
        Assert.Contains((6, 5), right);
    }

    [Fact]
    public async Task PostBattleStep_MobAbilityCooldowns_CycleAcrossTicks()
    {
        var start = await StartBattleAsync("arena-mob-cooldowns", "player-mob-cooldowns", 1337);
        AssertArenaInvariants(start.Actors, "player-mob-cooldowns");

        var currentTick = start.Tick;
        var bruteAbilityTicks = new HashSet<int>();
        var archerAbilityTicks = new HashSet<int>();

        for (var stepIndex = 0; stepIndex < 220; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, "player-mob-cooldowns");

            if (step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.FxId == "fx.mob.brute.cleave"))
            {
                bruteAbilityTicks.Add(step.Tick);
            }

            if (step.Events.OfType<FxSpawnEventDto>().Any(evt => evt.FxId == "fx.mob.archer.power_shot"))
            {
                archerAbilityTicks.Add(step.Tick);
            }
        }

        Assert.True(bruteAbilityTicks.Count >= 2, "Expected brute ability to trigger on multiple ticks.");
        Assert.True(archerAbilityTicks.Count >= 2, "Expected archer ability to trigger on multiple ticks.");
    }

    [Fact]
    public async Task PostBattleStep_PlayerAutoAttack_NoTarget_EmitsNoHitFx()
    {
        var playerId = "player-no-target-aa";
        var seed = await FindSeedAsync(payload =>
            payload.Actors
                .Where(actor => actor.Kind == "mob")
                .All(actor => ComputeChebyshevDistance(actor.TileX, actor.TileY, PlayerTileX, PlayerTileY) >= 3));
        var start = await StartBattleAsync("arena-no-target-aa", playerId, seed);
        AssertArenaInvariants(start.Actors, playerId);

        var quietStep = await StepBattleAsync(start.BattleId, start.Tick, []);
        AssertArenaInvariants(quietStep.Actors, playerId);

        var mobTiles = quietStep.Actors
            .Where(actor => actor.Kind == "mob")
            .Select(actor => (actor.TileX, actor.TileY))
            .ToHashSet();

        // No player auto-attack should happen.
        Assert.DoesNotContain(
            quietStep.Events.OfType<DamageNumberEventDto>(),
            evt => IsPlayerAutoAttackDamageEvent(quietStep, playerId, evt));

        Assert.DoesNotContain(
            quietStep.Events.OfType<FxSpawnEventDto>(),
            evt => evt.FxId == "fx.hit.small" && mobTiles.Contains((evt.TileX, evt.TileY)));
    }

    [Fact]
    public async Task PostBattleStep_SetTargetAndClearTarget_UpdatesSnapshotState()
    {
        var playerId = "player-set-clear-target";
        var start = await StartBattleAsync("arena-set-clear-target", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.Null(start.LockedTargetEntityId);
        Assert.Null(start.GroundTargetPos);

        var targetMobId = start.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .First();
        var setTarget = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_target", TargetEntityId: targetMobId)]);
        AssertArenaInvariants(setTarget.Actors, playerId);
        Assert.True(Assert.Single(setTarget.CommandResults).Ok);
        Assert.Equal(targetMobId, setTarget.LockedTargetEntityId);
        Assert.Equal(targetMobId, setTarget.EffectiveTargetEntityId);

        var clearTarget = await StepBattleAsync(
            start.BattleId,
            setTarget.Tick,
            [new BattleCommandDto("set_target", TargetEntityId: null)]);
        AssertArenaInvariants(clearTarget.Actors, playerId);
        Assert.True(Assert.Single(clearTarget.CommandResults).Ok);
        Assert.Null(clearTarget.LockedTargetEntityId);
        Assert.Equal(ResolveExpectedEffectiveFallbackTargetId(clearTarget.Actors, playerId), clearTarget.EffectiveTargetEntityId);
    }

    [Fact]
    public async Task PostBattleStep_SetGroundTargetAndClear_UpdatesSnapshotState()
    {
        var playerId = "player-set-ground-target";
        var start = await StartBattleAsync("arena-set-ground-target", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.Null(start.GroundTargetPos);

        var setGround = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_ground_target", GroundTileX: 1, GroundTileY: 5)]);
        AssertArenaInvariants(setGround.Actors, playerId);
        Assert.True(Assert.Single(setGround.CommandResults).Ok);
        Assert.NotNull(setGround.GroundTargetPos);
        Assert.Equal(1, setGround.GroundTargetPos!.X);
        Assert.Equal(5, setGround.GroundTargetPos.Y);

        var clearGround = await StepBattleAsync(
            start.BattleId,
            setGround.Tick,
            [new BattleCommandDto("set_ground_target")]);
        AssertArenaInvariants(clearGround.Actors, playerId);
        Assert.True(Assert.Single(clearGround.CommandResults).Ok);
        Assert.Null(clearGround.GroundTargetPos);
    }

    [Fact]
    public async Task PostBattleStep_SetTarget_AutoFacesTowardLockedEnemy()
    {
        var playerId = "player-set-target-auto-face";
        var seed = await FindSeedAsync(payload =>
            payload.Actors
                .Where(actor => actor.Kind == "mob")
                .Any(actor =>
                {
                    var deltaX = actor.TileX - PlayerTileX;
                    var deltaY = actor.TileY - PlayerTileY;
                    return deltaX > 0 && Math.Abs(deltaX) >= Math.Abs(deltaY);
                }));
        var start = await StartBattleAsync("arena-set-target-auto-face", playerId, seed);
        AssertArenaInvariants(start.Actors, playerId);

        var target = start.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .First(actor =>
            {
                var deltaX = actor.TileX - PlayerTileX;
                var deltaY = actor.TileY - PlayerTileY;
                return deltaX > 0 && Math.Abs(deltaX) >= Math.Abs(deltaY);
            });

        var setTarget = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_target", TargetEntityId: target.ActorId)]);
        AssertArenaInvariants(setTarget.Actors, playerId);
        Assert.True(Assert.Single(setTarget.CommandResults).Ok);
        Assert.Equal(target.ActorId, setTarget.LockedTargetEntityId);
        Assert.Equal(target.ActorId, setTarget.EffectiveTargetEntityId);
        Assert.Equal("right", setTarget.FacingDirection);
    }

    [Fact]
    public async Task PostBattleStep_SetFacingAndSetTarget_SameTick_FacingUsesExplicitSetFacingPriority()
    {
        var playerId = "player-facing-priority";
        var start = await StartBattleAsync("arena-facing-priority", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var targetMobId = start.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .First();

        var step = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto("set_target", TargetEntityId: targetMobId),
                new BattleCommandDto("set_facing", Dir: "left")
            ]);
        AssertArenaInvariants(step.Actors, playerId);
        Assert.Equal("left", step.FacingDirection);
        Assert.Equal(targetMobId, step.LockedTargetEntityId);
        Assert.Equal(targetMobId, step.EffectiveTargetEntityId);
    }

    [Fact]
    public async Task PostBattleStep_SetGroundTarget_AutoFacesTowardTargetTile()
    {
        var playerId = "player-set-ground-auto-face";
        var start = await StartBattleAsync("arena-set-ground-auto-face", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var faceRight = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_facing", Dir: "right")]);
        AssertArenaInvariants(faceRight.Actors, playerId);
        Assert.Equal("right", faceRight.FacingDirection);

        var setGround = await StepBattleAsync(
            start.BattleId,
            faceRight.Tick,
            [new BattleCommandDto("set_ground_target", GroundTileX: PlayerTileX, GroundTileY: PlayerTileY - 2)]);
        AssertArenaInvariants(setGround.Actors, playerId);
        Assert.True(Assert.Single(setGround.CommandResults).Ok);
        Assert.NotNull(setGround.GroundTargetPos);
        Assert.Equal(PlayerTileX, setGround.GroundTargetPos!.X);
        Assert.Equal(PlayerTileY - 2, setGround.GroundTargetPos.Y);
        Assert.Equal("up", setGround.FacingDirection);
    }

    [Fact]
    public async Task PostBattleStep_TargetAndGroundFacing_IsDeterministicForSameSeed()
    {
        const int seed = 1337;
        var firstStart = await StartBattleAsync("arena-target-ground-face-det-a", "player-target-ground-face", seed);
        var secondStart = await StartBattleAsync("arena-target-ground-face-det-b", "player-target-ground-face", seed);
        AssertArenaInvariants(firstStart.Actors, "player-target-ground-face");
        AssertArenaInvariants(secondStart.Actors, "player-target-ground-face");

        var targetMobId = firstStart.Actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .First();

        var firstTargetStep = await StepBattleAsync(
            firstStart.BattleId,
            firstStart.Tick,
            [new BattleCommandDto("set_target", TargetEntityId: targetMobId)]);
        var secondTargetStep = await StepBattleAsync(
            secondStart.BattleId,
            secondStart.Tick,
            [new BattleCommandDto("set_target", TargetEntityId: targetMobId)]);

        AssertArenaInvariants(firstTargetStep.Actors, "player-target-ground-face");
        AssertArenaInvariants(secondTargetStep.Actors, "player-target-ground-face");
        Assert.Equal(firstTargetStep.FacingDirection, secondTargetStep.FacingDirection);
        Assert.Equal(firstTargetStep.EffectiveTargetEntityId, secondTargetStep.EffectiveTargetEntityId);
        Assert.Equal(firstTargetStep.LockedTargetEntityId, secondTargetStep.LockedTargetEntityId);
        Assert.Equal(
            firstTargetStep.Events.Select(ToEventSignature).ToList(),
            secondTargetStep.Events.Select(ToEventSignature).ToList());

        var firstGroundStep = await StepBattleAsync(
            firstStart.BattleId,
            firstTargetStep.Tick,
            [new BattleCommandDto("set_ground_target", GroundTileX: 1, GroundTileY: 1)]);
        var secondGroundStep = await StepBattleAsync(
            secondStart.BattleId,
            secondTargetStep.Tick,
            [new BattleCommandDto("set_ground_target", GroundTileX: 1, GroundTileY: 1)]);

        AssertArenaInvariants(firstGroundStep.Actors, "player-target-ground-face");
        AssertArenaInvariants(secondGroundStep.Actors, "player-target-ground-face");
        Assert.Equal(firstGroundStep.FacingDirection, secondGroundStep.FacingDirection);
        Assert.Equal(firstGroundStep.EffectiveTargetEntityId, secondGroundStep.EffectiveTargetEntityId);
        Assert.Equal(firstGroundStep.LockedTargetEntityId, secondGroundStep.LockedTargetEntityId);
        Assert.Equal(firstGroundStep.GroundTargetPos?.X, secondGroundStep.GroundTargetPos?.X);
        Assert.Equal(firstGroundStep.GroundTargetPos?.Y, secondGroundStep.GroundTargetPos?.Y);
        Assert.Equal(
            firstGroundStep.Events.Select(ToEventSignature).ToList(),
            secondGroundStep.Events.Select(ToEventSignature).ToList());
    }

    [Fact]
    public async Task PostBattleStep_TargetLock_PrefersLockedMobForPlayerAutoAttackWhenValid()
    {
        var playerId = "player-target-lock-preference";
        var start = await StartBattleAsync("arena-target-lock-preference", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var configured = await DisableAssistAsync(start.BattleId, start.Tick, playerId);
        var currentTick = configured.Tick;
        string? lockTargetId = null;
        for (var stepIndex = 0; stepIndex < 240; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var adjacentMobs = step.Actors
                .Where(actor =>
                    actor.Kind == "mob" &&
                    ComputeChebyshevDistance(actor.TileX, actor.TileY, PlayerTileX, PlayerTileY) <= 1)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .ToList();
            if (adjacentMobs.Count < 1)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            lockTargetId = adjacentMobs[^1].ActorId;
            break;
        }

        Assert.False(string.IsNullOrWhiteSpace(lockTargetId), "Expected to find at least two adjacent mobs to lock one deterministically.");

        var setTargetStep = await StepBattleAsync(
            start.BattleId,
            currentTick,
            [new BattleCommandDto("set_target", TargetEntityId: lockTargetId)]);
        currentTick = setTargetStep.Tick;
        AssertArenaInvariants(setTargetStep.Actors, playerId);
        Assert.True(Assert.Single(setTargetStep.CommandResults).Ok);
        Assert.Equal(lockTargetId, setTargetStep.LockedTargetEntityId);

        var sawLockedTargetInRange = false;
        for (var stepIndex = 0; stepIndex < 120; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);
            Assert.Equal(lockTargetId, step.LockedTargetEntityId);

            var lockedTargetActor = step.Actors.FirstOrDefault(actor => actor.ActorId == lockTargetId);
            var lockIsInRange = lockedTargetActor is not null &&
                                ComputeChebyshevDistance(lockedTargetActor.TileX, lockedTargetActor.TileY, PlayerTileX, PlayerTileY) <= 1;
            if (lockIsInRange)
            {
                sawLockedTargetInRange = true;
            }

            var playerAutoAttack = step.Events
                .OfType<DamageNumberEventDto>()
                .FirstOrDefault(evt => IsPlayerAutoAttackDamageEvent(step, playerId, evt));
            if (playerAutoAttack is null || !lockIsInRange)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            Assert.Equal(lockTargetId, playerAutoAttack.TargetEntityId);
            return;
        }

        Assert.True(sawLockedTargetInRange, "Expected locked target to become valid and in melee range.");
        throw new Xunit.Sdk.XunitException("Expected a player auto-attack that honors the valid locked target.");
    }

    [Fact]
    public async Task PostBattleStep_InvalidLockedTarget_ClearsLockAndFallsBackToDefaultAutoAttackSelection()
    {
        var playerId = "player-invalid-lock-fallback";
        var start = await StartBattleAsync("arena-invalid-lock-fallback", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        const string invalidTargetId = "mob.invalid.lock";
        var setInvalidLock = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_target", TargetEntityId: invalidTargetId)]);
        AssertArenaInvariants(setInvalidLock.Actors, playerId);
        Assert.True(Assert.Single(setInvalidLock.CommandResults).Ok);
        Assert.Null(setInvalidLock.LockedTargetEntityId);
        Assert.Equal(ResolveExpectedEffectiveFallbackTargetId(setInvalidLock.Actors, playerId), setInvalidLock.EffectiveTargetEntityId);

        var currentTick = setInvalidLock.Tick;
        for (var stepIndex = 0; stepIndex < 120; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);
            Assert.Null(step.LockedTargetEntityId);
            Assert.Equal(ResolveExpectedEffectiveFallbackTargetId(step.Actors, playerId), step.EffectiveTargetEntityId);

            var playerAutoAttack = step.Events
                .OfType<DamageNumberEventDto>()
                .FirstOrDefault(evt => IsPlayerAutoAttackDamageEvent(step, playerId, evt));
            if (playerAutoAttack is null)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            Assert.NotEqual(invalidTargetId, playerAutoAttack.TargetEntityId);
            Assert.StartsWith("mob.", playerAutoAttack.TargetEntityId, StringComparison.Ordinal);
            var expectedFacing = ResolveFacingDirectionTowardTile(
                sourceTileX: PlayerTileX,
                sourceTileY: PlayerTileY,
                targetTileX: playerAutoAttack.TargetTileX,
                targetTileY: playerAutoAttack.TargetTileY,
                currentFacingDirection: step.FacingDirection);
            Assert.Equal(expectedFacing, step.FacingDirection);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected player auto-attack fallback when locked target id is invalid.");
    }

    [Fact]
    public async Task PostBattleStep_LockedTargetDies_ClearsLockEntityId()
    {
        var playerId = "player-lock-death-facing-follow";
        var start = await StartBattleAsync("arena-lock-death-facing-follow", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var configured = await DisableAssistAsync(start.BattleId, start.Tick, playerId);
        var currentTick = configured.Tick;
        string? lockTargetId = null;
        for (var stepIndex = 0; stepIndex < 240; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var adjacentMobs = step.Actors
                .Where(actor =>
                    actor.Kind == "mob" &&
                    ComputeChebyshevDistance(actor.TileX, actor.TileY, PlayerTileX, PlayerTileY) <= 1)
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .ToList();
            if (adjacentMobs.Count < 1)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            lockTargetId = adjacentMobs[^1].ActorId;
            break;
        }

        Assert.False(string.IsNullOrWhiteSpace(lockTargetId), "Expected to find at least two adjacent mobs to exercise lock->fallback facing follow.");

        var setTargetStep = await StepBattleAsync(
            start.BattleId,
            currentTick,
            [new BattleCommandDto("set_target", TargetEntityId: lockTargetId)]);
        currentTick = setTargetStep.Tick;
        AssertArenaInvariants(setTargetStep.Actors, playerId);
        Assert.True(Assert.Single(setTargetStep.CommandResults).Ok);
        Assert.Equal(lockTargetId, setTargetStep.LockedTargetEntityId);

        var observedLockedTargetDeath = false;
        for (var stepIndex = 0; stepIndex < 240; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            if (!observedLockedTargetDeath && step.Actors.All(actor => actor.ActorId != lockTargetId))
            {
                observedLockedTargetDeath = true;
                Assert.Null(step.LockedTargetEntityId);
                Assert.Equal(ResolveExpectedEffectiveFallbackTargetId(step.Actors, playerId), step.EffectiveTargetEntityId);
            }

            if (!observedLockedTargetDeath)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            return;
        }

        Assert.True(observedLockedTargetDeath, "Expected the locked target to die before validating fallback-facing behavior.");
        throw new Xunit.Sdk.XunitException("Expected locked target death to clear lock deterministically.");
    }

    [Fact]
    public async Task PostBattleStep_PlayerAutoAttack_EmitsHitFxOnDamagedMobTile()
    {
        var playerId = "player-hit-fx-tile";
        var start = await StartBattleAsync("arena-hit-fx-tile", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 40; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var mobDamageEvents = step.Events
                .OfType<DamageNumberEventDto>()
                .Where(evt =>
                    IsPlayerAutoAttackDamageEvent(step, playerId, evt) &&
                    !evt.IsCrit)
                .ToList();
            if (mobDamageEvents.Count == 0)
            {
                continue;
            }

            var hitFxEvents = step.Events
                .OfType<FxSpawnEventDto>()
                .Where(evt => evt.FxId == "fx.hit.small")
                .ToList();
            Assert.NotEmpty(hitFxEvents);

            foreach (var mobDamage in mobDamageEvents)
            {
                var damagedMob = Assert.Single(step.Actors, actor => actor.ActorId == mobDamage.TargetEntityId);
                Assert.Contains(hitFxEvents, fx => fx.TileX == damagedMob.TileX && fx.TileY == damagedMob.TileY);
            }

            return;
        }

        throw new Xunit.Sdk.XunitException("Player auto-attack non-final mob damage event was not observed.");
    }

    [Fact]
    public async Task PostBattleStep_CriticalHit_EmitsHitKindAndCritTextDeterministically()
    {
        const int seed = 1337;
        const int maxSteps = 120;
        var playerId = "player-crit-hit-kind";
        var firstStart = await StartBattleAsync("arena-crit-hit-kind-a", playerId, seed);
        var secondStart = await StartBattleAsync("arena-crit-hit-kind-b", playerId, seed);

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;

        for (var stepIndex = 0; stepIndex < maxSteps; stepIndex += 1)
        {
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, []);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, []);
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;

            var firstCritSignatures = firstStep.Events
                .Where(evt => evt is CritTextEventDto ||
                              evt is DamageNumberEventDto damage &&
                              string.Equals(damage.HitKind, BattleHitKinds.Crit, StringComparison.Ordinal))
                .Select(ToEventSignature)
                .ToList();
            var secondCritSignatures = secondStep.Events
                .Where(evt => evt is CritTextEventDto ||
                              evt is DamageNumberEventDto damage &&
                              string.Equals(damage.HitKind, BattleHitKinds.Crit, StringComparison.Ordinal))
                .Select(ToEventSignature)
                .ToList();
            Assert.Equal(firstCritSignatures, secondCritSignatures);

            var critDamage = firstStep.Events
                .OfType<DamageNumberEventDto>()
                .FirstOrDefault(evt => string.Equals(evt.HitKind, BattleHitKinds.Crit, StringComparison.Ordinal));
            if (critDamage is null)
            {
                continue;
            }

            Assert.True(critDamage.IsCrit);
            var matchingCritTexts = firstStep.Events
                .OfType<CritTextEventDto>()
                .Where(evt =>
                    string.Equals(evt.Text, "CRIT!", StringComparison.Ordinal) &&
                    evt.TileX == critDamage.TargetTileX &&
                    evt.TileY == critDamage.TargetTileY)
                .ToList();
            Assert.NotEmpty(matchingCritTexts);
            Assert.All(matchingCritTexts, critText =>
            {
                Assert.Equal(800, critText.DurationMs);
                Assert.Equal(firstStep.Tick * StepDeltaMs, critText.StartAtMs);
            });
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected at least one deterministic critical hit event within the test window.");
    }

    [Fact]
    public async Task PostBattleStep_RespawnRandomly_StaysInBoundsAndNoOverlap()
    {
        var playerId = "player-respawn-random";
        var start = await StartBattleAsync("arena-respawn-random", playerId, 2027);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        var previousMobIds = start.Actors
            .Where(actor => actor.Kind == "mob")
            .Select(actor => actor.ActorId)
            .ToHashSet(StringComparer.Ordinal);
        string? deadMobId = null;

        for (var stepIndex = 0; stepIndex < 160; stepIndex += 1)
        {
            var commands = BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            currentTick = step.Tick;
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var mobIds = step.Actors
                .Where(actor => actor.Kind == "mob")
                .Select(actor => actor.ActorId)
                .ToHashSet(StringComparer.Ordinal);

            if (deadMobId is null)
            {
                deadMobId = previousMobIds.FirstOrDefault(mobId => !mobIds.Contains(mobId));
            }

            if (deadMobId is not null && mobIds.Contains(deadMobId))
            {
                var respawnedMob = Assert.Single(step.Actors, actor => actor.ActorId == deadMobId);
                Assert.Equal(respawnedMob.MaxHp, respawnedMob.Hp);
                Assert.True(respawnedMob.MaxHp > 0);
                var respawnDistance = ComputeChebyshevDistance(respawnedMob.TileX, respawnedMob.TileY, PlayerTileX, PlayerTileY);
                Assert.InRange(respawnDistance, 2, 4);
                return;
            }

            previousMobIds = mobIds;
            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected to observe a mob death followed by deterministic respawn.");
    }

    [Fact]
    public async Task PostBattleStep_RespawnFillsBackToMaxAliveMobs()
    {
        var playerId = "player-respawn-cap";
        var start = await StartBattleAsync("arena-respawn-cap", playerId, 2029);
        AssertArenaInvariants(start.Actors, playerId);
        var targetMobCap = GetExpectedMobCapForTick(start.Tick);
        Assert.Equal(targetMobCap, start.Actors.Count(actor => actor.Kind == "mob"));

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        var sawBelowCap = false;

        for (var stepIndex = 0; stepIndex < 160; stepIndex += 1)
        {
            var commands = sawBelowCap ? Array.Empty<BattleCommandDto>() : BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            currentTick = step.Tick;
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var mobCount = step.Actors.Count(actor => actor.Kind == "mob");
            if (!sawBelowCap && mobCount < targetMobCap)
            {
                sawBelowCap = true;
                continue;
            }

            if (sawBelowCap && mobCount == targetMobCap)
            {
                return;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        Assert.True(sawBelowCap, "Expected to observe mob count drop below max cap before refill.");
        throw new Xunit.Sdk.XunitException("Expected respawn to refill mob count back to max cap.");
    }

    [Fact]
    public async Task PostEffectsAoePlan_ReturnsTileSpawns()
    {
        var request = new AoePlanRequestDto(
            Center: new AoePlanCenterDto(5, 8),
            Radius: 1,
            Shape: "square",
            FxId: "fx.hit.small");

        var response = await _client.PostAsJsonAsync("/api/v1/effects/aoe-plan", request);
        var payload = await response.Content.ReadFromJsonAsync<AoePlanResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        Assert.Equal(9, payload.Spawns.Count);
        Assert.Equal(new AoePlanSpawnDto(4, 7, "fx.hit.small"), payload.Spawns[0]);
        Assert.Equal(new AoePlanSpawnDto(5, 8, "fx.hit.small"), payload.Spawns[4]);
        Assert.Equal(new AoePlanSpawnDto(6, 9, "fx.hit.small"), payload.Spawns[8]);
    }

    [Fact]
    public async Task PostEffectsAoePlan_WithInvalidFxId_ReturnsBadRequest()
    {
        var request = new AoePlanRequestDto(
            Center: new AoePlanCenterDto(2, 2),
            Radius: 1,
            Shape: "square",
            FxId: "fx/hit/small");

        var response = await _client.PostAsJsonAsync("/api/v1/effects/aoe-plan", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostBattleStep_DamageEvents_IncludeAttackerAndTargetPositions()
    {
        var playerId = "player-causality-damage";
        var start = await StartBattleAsync("arena-causality-damage", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 140; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var matchedDamage = step.Events
                .OfType<DamageNumberEventDto>()
                .FirstOrDefault(evt =>
                    !string.IsNullOrWhiteSpace(evt.AttackerEntityId)
                    && !evt.IsKill
                    && step.Actors.Any(actor => actor.ActorId == evt.AttackerEntityId)
                    && step.Actors.Any(actor => actor.ActorId == evt.TargetEntityId));
            if (matchedDamage is null)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            var attacker = Assert.Single(step.Actors, actor => actor.ActorId == matchedDamage.AttackerEntityId);
            var target = Assert.Single(step.Actors, actor => actor.ActorId == matchedDamage.TargetEntityId);

            Assert.Equal(attacker.TileX, matchedDamage.AttackerTileX);
            Assert.Equal(attacker.TileY, matchedDamage.AttackerTileY);
            Assert.Equal(target.TileX, matchedDamage.TargetTileX);
            Assert.Equal(target.TileY, matchedDamage.TargetTileY);
            Assert.True(matchedDamage.DamageAmount > 0);
            Assert.True(matchedDamage.HitId > 0);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected a non-lethal damage event with attacker and target metadata.");
    }

    [Fact]
    public async Task PostBattleStep_AutoAttacks_EmitMeleeAndRangedAttackFx()
    {
        var playerId = "player-causality-traces";
        var start = await StartBattleAsync("arena-causality-traces", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var sawPlayerMeleeSwing = false;
        var sawRangedMobProjectile = false;

        for (var stepIndex = 0; stepIndex < 220; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var attackFxEvents = step.Events.OfType<AttackFxEventDto>().ToList();
            var damageEvents = step.Events.OfType<DamageNumberEventDto>().ToList();

            if (!sawPlayerMeleeSwing)
            {
                var playerAutoAttack = damageEvents.FirstOrDefault(evt =>
                    IsPlayerAutoAttackDamageEvent(step, playerId, evt));
                if (playerAutoAttack is not null)
                {
                    Assert.Contains(
                        attackFxEvents,
                        fx =>
                            fx.FxKind == CombatFxKind.MeleeSwing &&
                            fx.FromTileX == PlayerTileX &&
                            fx.FromTileY == PlayerTileY &&
                            fx.ToTileX == playerAutoAttack.TargetTileX &&
                            fx.ToTileY == playerAutoAttack.TargetTileY);
                    sawPlayerMeleeSwing = true;
                }
            }

            if (!sawRangedMobProjectile)
            {
                var rangedMobAutoAttack = damageEvents.FirstOrDefault(evt =>
                {
                    if (evt.TargetEntityId != playerId || evt.DamageAmount <= 0 || string.IsNullOrWhiteSpace(evt.AttackerEntityId))
                    {
                        return false;
                    }

                    var attacker = step.Actors.FirstOrDefault(actor => actor.ActorId == evt.AttackerEntityId);
                    return attacker is not null &&
                           (attacker.MobType == MobArchetype.RangedArcher || attacker.MobType == MobArchetype.RangedShaman);
                });

                if (rangedMobAutoAttack is not null)
                {
                    Assert.Contains(
                        attackFxEvents,
                        fx =>
                            fx.FxKind == CombatFxKind.RangedProjectile &&
                            fx.FromTileX == rangedMobAutoAttack.AttackerTileX &&
                            fx.FromTileY == rangedMobAutoAttack.AttackerTileY &&
                            fx.ToTileX == rangedMobAutoAttack.TargetTileX &&
                            fx.ToTileY == rangedMobAutoAttack.TargetTileY);
                    sawRangedMobProjectile = true;
                }
            }

            if (sawPlayerMeleeSwing && sawRangedMobProjectile)
            {
                return;
            }

            if (step.BattleStatus == "defeat")
            {
                break;
            }
        }

        Assert.True(sawPlayerMeleeSwing, "Expected at least one player melee attack trace event.");
        Assert.True(sawRangedMobProjectile, "Expected at least one ranged mob projectile trace event.");
    }

    [Fact]
    public async Task PostBattleStep_CausalityEventOrdering_IsDeterministicAcrossRuns()
    {
        var firstStart = await StartBattleAsync("arena-causality-order-a", "player-causality-order", 1337);
        var secondStart = await StartBattleAsync("arena-causality-order-b", "player-causality-order", 1337);
        AssertArenaInvariants(firstStart.Actors, "player-causality-order");
        AssertArenaInvariants(secondStart.Actors, "player-causality-order");

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;

        for (var stepIndex = 0; stepIndex < 36; stepIndex += 1)
        {
            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, []);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, []);
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;

            AssertArenaInvariants(firstStep.Actors, "player-causality-order");
            AssertArenaInvariants(secondStep.Actors, "player-causality-order");

            var firstSignatures = firstStep.Events.Select(ToEventSignature).ToList();
            var secondSignatures = secondStep.Events.Select(ToEventSignature).ToList();
            Assert.Equal(firstSignatures, secondSignatures);

            var orderedCausalityIds = GetOrderedCausalityIds(firstStep.Events).ToList();
            if (orderedCausalityIds.Count <= 1)
            {
                continue;
            }

            for (var i = 1; i < orderedCausalityIds.Count; i += 1)
            {
                Assert.True(
                    orderedCausalityIds[i - 1] < orderedCausalityIds[i],
                    $"Causality ids are not strictly increasing within tick {firstStep.Tick}.");
            }
        }
    }

    [Fact]
    public async Task PostBattleStep_MobDeath_EmitsDeathEventExactlyOnce()
    {
        var playerId = "player-death-event-once";
        var start = await StartBattleAsync("arena-death-event-once", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        for (var stepIndex = 0; stepIndex < 180; stepIndex += 1)
        {
            var commands = BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            currentTick = step.Tick;
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var firstDeath = step.Events.OfType<DeathEventDto>().FirstOrDefault(evt => evt.EntityType == "mob");
            if (firstDeath is null)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            Assert.Equal(step.Tick, firstDeath.TickIndex);
            Assert.InRange(firstDeath.TileX, 0, ArenaWidth - 1);
            Assert.InRange(firstDeath.TileY, 0, ArenaHeight - 1);
            Assert.NotNull(firstDeath.MobType);
            Assert.False(string.IsNullOrWhiteSpace(firstDeath.KillerEntityId));

            var sameEntityDeaths = step.Events
                .OfType<DeathEventDto>()
                .Count(evt => evt.EntityId == firstDeath.EntityId);
            Assert.Equal(1, sameEntityDeaths);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected at least one mob death event.");
    }

    [Fact]
    public async Task PostBattleStep_MobDeath_CorpseDecalTicksDownAndExpiresDeterministically()
    {
        var playerId = "player-corpse-decal-expiry";
        var start = await StartBattleAsync("arena-corpse-decal-expiry", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.Empty(start.Decals);

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        BattleStepResponseDto? deathStep = null;
        DeathEventDto? deathEvent = null;
        for (var stepIndex = 0; stepIndex < 200; stepIndex += 1)
        {
            var commands = BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            currentTick = step.Tick;
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            deathEvent = step.Events.OfType<DeathEventDto>().FirstOrDefault(evt => evt.EntityType == "mob");
            if (deathEvent is null)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            deathStep = step;
            break;
        }

        Assert.NotNull(deathStep);
        Assert.NotNull(deathEvent);

        var corpseAtDeathTick = Assert.Single(
            deathStep!.Decals,
            decal => decal.EntityId == deathEvent!.EntityId && decal.DecalKind == DecalKind.Corpse);
        Assert.Equal(1200, corpseAtDeathTick.TotalMs);
        Assert.Equal(1200, corpseAtDeathTick.RemainingMs);
        Assert.Equal(deathStep.Tick, corpseAtDeathTick.CreatedTick);
        Assert.Equal(deathEvent!.TileX, corpseAtDeathTick.TileX);
        Assert.Equal(deathEvent.TileY, corpseAtDeathTick.TileY);

        var expectedRemaining = new[] { 950, 700, 450, 200 };
        var sawCorpseWithFullMobCap = false;
        var previousTick = deathStep.Tick;

        foreach (var expected in expectedRemaining)
        {
            var nextStep = await StepBattleAsync(start.BattleId, previousTick, []);
            previousTick = nextStep.Tick;
            AssertArenaInvariants(nextStep.Actors, playerId);

            var corpse = Assert.Single(
                nextStep.Decals,
                decal => decal.EntityId == deathEvent.EntityId && decal.DecalKind == DecalKind.Corpse);
            Assert.Equal(expected, corpse.RemainingMs);
            if (nextStep.Actors.Count(actor => actor.Kind == "mob") == GetExpectedMobCapForTick(nextStep.Tick))
            {
                sawCorpseWithFullMobCap = true;
            }
        }

        var expirationStep = await StepBattleAsync(start.BattleId, previousTick, []);
        AssertArenaInvariants(expirationStep.Actors, playerId);
        Assert.DoesNotContain(
            expirationStep.Decals,
            decal => decal.EntityId == deathEvent.EntityId && decal.DecalKind == DecalKind.Corpse);
        Assert.True(
            sawCorpseWithFullMobCap,
            "Expected a step where a corpse decal coexists with the full live mob count, proving decals do not block live occupancy.");
    }

    [Fact]
    public async Task PostBattleStep_MobDeath_EmitsDeathBurstCombatFx()
    {
        var playerId = "player-death-burst-fx";
        var start = await StartBattleAsync("arena-death-burst-fx", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var currentSkills = start.Skills;
        for (var stepIndex = 0; stepIndex < 180; stepIndex += 1)
        {
            var commands = BuildReadySkillCommands(currentSkills);
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            currentTick = step.Tick;
            currentSkills = step.Skills;
            AssertArenaInvariants(step.Actors, playerId);

            var deathEvent = step.Events.OfType<DeathEventDto>().FirstOrDefault(evt => evt.EntityType == "mob");
            if (deathEvent is null)
            {
                if (step.BattleStatus == "defeat")
                {
                    break;
                }

                continue;
            }

            Assert.Contains(
                step.Events.OfType<AttackFxEventDto>(),
                fx =>
                    fx.FxKind == CombatFxKind.DeathBurst &&
                    fx.FromTileX == deathEvent.TileX &&
                    fx.FromTileY == deathEvent.TileY &&
                    fx.ToTileX == deathEvent.TileX &&
                    fx.ToTileY == deathEvent.TileY &&
                    fx.CreatedAtTick == step.Tick);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected a mob death with a matching death burst combat FX event.");
    }

    [Fact]
    public async Task PostBattleStep_AssistAutoHeal_TriggersWhenBelowThreshold()
    {
        // Heal is no longer in the kit — auto-heal assist should never fire even when player HP drops below threshold.
        var playerId = "player-assist-auto-heal";
        var start = await StartBattleAsync("arena-assist-auto-heal", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "heal");

        var configured = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_assist_config", AssistConfig: BuildAssistConfig(
                enabled: true,
                autoHealEnabled: true,
                healAtHpPercent: 99,
                autoGuardEnabled: false,
                guardAtHpPercent: 60,
                autoOffenseEnabled: false,
                offenseMode: "cooldown_spam",
                maxAutoCastsPerTick: 1))]);
        var currentTick = configured.Tick;
        AssertArenaInvariants(configured.Actors, playerId);

        for (var i = 0; i < 24; i += 1)
        {
            var step = i == 0
                ? configured
                : await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            Assert.DoesNotContain(
                step.Events.OfType<AssistCastEventDto>(),
                evt => evt.SkillId == "heal");
            Assert.DoesNotContain(
                step.Events.OfType<HealNumberEventDto>(),
                evt => evt.ActorId == playerId && evt.Source == "skill_heal");

            if (step.BattleStatus == "defeat")
            {
                return;
            }
        }
    }

    [Fact]
    public async Task PostBattleStep_AssistAutoGuard_HasPriorityOverAutoHeal()
    {
        // Guard and Heal are no longer in the kit — neither auto-guard nor auto-heal should fire.
        var playerId = "player-assist-guard-priority";
        var start = await StartBattleAsync("arena-assist-guard-priority", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "guard");
        Assert.DoesNotContain(start.Skills, s => s.SkillId == "heal");

        var configured = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_assist_config", AssistConfig: BuildAssistConfig(
                enabled: true,
                autoHealEnabled: true,
                healAtHpPercent: 99,
                autoGuardEnabled: true,
                guardAtHpPercent: 99,
                autoOffenseEnabled: false,
                offenseMode: "cooldown_spam",
                maxAutoCastsPerTick: 1))]);
        var currentTick = configured.Tick;
        AssertArenaInvariants(configured.Actors, playerId);

        for (var i = 0; i < 16; i += 1)
        {
            var step = i == 0
                ? configured
                : await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            Assert.DoesNotContain(step.Events.OfType<AssistCastEventDto>(), evt => evt.SkillId == "guard");
            Assert.DoesNotContain(step.Events.OfType<AssistCastEventDto>(), evt => evt.SkillId == "heal");

            if (step.BattleStatus == "defeat")
            {
                return;
            }
        }
    }

    [Fact]
    public async Task PostBattleStep_AssistAutoOffense_CastsAtMostOneSkillPerTick()
    {
        var playerId = "player-assist-auto-offense";
        var start = await StartBattleAsync("arena-assist-auto-offense", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var currentTick = start.Tick;
        var configured = await StepBattleAsync(
            start.BattleId,
            currentTick,
            [new BattleCommandDto("set_assist_config", AssistConfig: BuildAssistConfig(
                enabled: true,
                autoHealEnabled: false,
                healAtHpPercent: 40,
                autoGuardEnabled: false,
                guardAtHpPercent: 60,
                autoOffenseEnabled: true,
                offenseMode: "cooldown_spam",
                maxAutoCastsPerTick: 1))]);
        currentTick = configured.Tick;
        AssertArenaInvariants(configured.Actors, playerId);

        for (var i = 0; i < 16; i += 1)
        {
            var step = i == 0
                ? configured
                : await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var offenseCasts = step.Events
                .OfType<AssistCastEventDto>()
                .Where(evt => evt.Reason == "auto_offense")
                .ToList();
            if (offenseCasts.Count == 0)
            {
                continue;
            }

            Assert.Single(offenseCasts);
            var offensiveSkillCooldowns = new[] { "exori_mas", "exori", "exori_min" }
                .Select(skillId => GetSkill(step, skillId))
                .Count(skill => skill.CooldownRemainingMs > 0);
            Assert.Equal(1, offensiveSkillCooldowns);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected assist auto-offense to cast a single skill.");
    }

    [Fact]
    public async Task PostBattleStep_SigilBoltFiresForRangedPrototype_ProjectileIsBeyondMeleeRange()
    {
        var playerId = ArenaConfig.CharacterIds.RangedPrototype;
        var start = await StartBattleAsync("arena-sigil-bolt-ranged-prototype", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.Contains(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.SigilBoltSkillId, StringComparison.Ordinal));
        Assert.DoesNotContain(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.ExoriMinSkillId, StringComparison.Ordinal));

        var configured = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto(
                    ArenaConfig.SetAssistConfigCommandType,
                    AssistConfig: new AssistConfigDto(
                        Enabled: true,
                        AutoHealEnabled: false,
                        HealAtHpPercent: 40,
                        AutoGuardEnabled: false,
                        GuardAtHpPercent: 60,
                        AutoOffenseEnabled: true,
                        OffenseMode: ArenaConfig.AssistOffenseModeCooldownSpam,
                        AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
                        {
                            [ArenaConfig.ExoriSkillId] = false,
                            [ArenaConfig.ExoriMasSkillId] = false,
                            [ArenaConfig.ShotgunSkillId] = false,
                            [ArenaConfig.VoidRicochetSkillId] = false,
                            [ArenaConfig.SigilBoltSkillId] = true
                        },
                        MaxAutoCastsPerTick: 1))
            ]);
        AssertArenaInvariants(configured.Actors, playerId);

        var currentTick = configured.Tick;
        for (var stepIndex = 0; stepIndex < 24; stepIndex += 1)
        {
            var step = stepIndex == 0
                ? configured
                : await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            var projectile = step.Events
                .OfType<RangedProjectileFiredEventDto>()
                .FirstOrDefault(evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.SigilBolt, StringComparison.Ordinal));
            if (projectile is null)
            {
                continue;
            }

            Assert.Contains(
                step.Events.OfType<AssistCastEventDto>(),
                evt => string.Equals(evt.SkillId, ArenaConfig.SigilBoltSkillId, StringComparison.Ordinal));
            Assert.Equal(ArenaConfig.WeaponIds.SigilBolt, projectile.WeaponId);
            Assert.False(projectile.Pierces);
            var chebyshevToTarget = ComputeChebyshevDistance(
                projectile.ToTile.X,
                projectile.ToTile.Y,
                PlayerTileX,
                PlayerTileY);
            Assert.True(chebyshevToTarget > 1);
            Assert.Equal(ArenaConfig.SigilBoltCooldownMs, GetSkill(step, ArenaConfig.SigilBoltSkillId).CooldownRemainingMs);
            Assert.Equal(GlobalCooldownMs, step.GlobalCooldownRemainingMs);
            return;
        }

        throw new Xunit.Sdk.XunitException("Expected Sigil Bolt to fire for ranged prototype and emit a projectile event.");
    }

    [Fact]
    public async Task PostBattleStep_SigilBoltDoesNotFireForKina()
    {
        var playerId = ArenaConfig.CharacterIds.Kina;
        var start = await StartBattleAsync("arena-sigil-bolt-kina", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);
        Assert.DoesNotContain(start.Skills, skill => string.Equals(skill.SkillId, ArenaConfig.SigilBoltSkillId, StringComparison.Ordinal));

        var currentTick = start.Tick;
        for (var stepIndex = 0; stepIndex < 30; stepIndex += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);

            Assert.DoesNotContain(
                step.Events.OfType<AssistCastEventDto>(),
                evt => string.Equals(evt.SkillId, ArenaConfig.SigilBoltSkillId, StringComparison.Ordinal));
            Assert.DoesNotContain(
                step.Events.OfType<RangedProjectileFiredEventDto>(),
                evt => string.Equals(evt.WeaponId, ArenaConfig.WeaponIds.SigilBolt, StringComparison.Ordinal));
        }
    }

    [Fact]
    public async Task PostBattleStep_AssistEnabledToggle_FlipsAndPersistsDeterministically()
    {
        var firstStart = await StartBattleAsync("arena-assist-toggle-a", "player-assist-toggle", 1337);
        var secondStart = await StartBattleAsync("arena-assist-toggle-b", "player-assist-toggle", 1337);
        AssertArenaInvariants(firstStart.Actors, "player-assist-toggle");
        AssertArenaInvariants(secondStart.Actors, "player-assist-toggle");
        Assert.Equal(true, firstStart.AssistConfig.Enabled);
        Assert.Equal(true, secondStart.AssistConfig.Enabled);

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;
        var toggles = new[] { true, false, true, false };
        foreach (var enabled in toggles)
        {
            var command = new BattleCommandDto(
                "set_assist_config",
                AssistConfig: BuildAssistConfig(
                    enabled: enabled,
                    autoHealEnabled: false,
                    healAtHpPercent: 40,
                    autoGuardEnabled: false,
                    guardAtHpPercent: 60,
                    autoOffenseEnabled: false,
                    offenseMode: "cooldown_spam",
                    maxAutoCastsPerTick: 1));

            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, [command]);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, [command]);
            AssertArenaInvariants(firstStep.Actors, "player-assist-toggle");
            AssertArenaInvariants(secondStep.Actors, "player-assist-toggle");
            Assert.True(Assert.Single(firstStep.CommandResults).Ok);
            Assert.True(Assert.Single(secondStep.CommandResults).Ok);
            Assert.Equal(enabled, firstStep.AssistConfig.Enabled);
            Assert.Equal(enabled, secondStep.AssistConfig.Enabled);
            Assert.Equal(
                firstStep.Actors
                    .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                    .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}")
                    .ToList(),
                secondStep.Actors
                    .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                    .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}")
                    .ToList());

            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;

            var firstPersisted = await StepBattleAsync(firstStart.BattleId, firstTick, []);
            var secondPersisted = await StepBattleAsync(secondStart.BattleId, secondTick, []);
            AssertArenaInvariants(firstPersisted.Actors, "player-assist-toggle");
            AssertArenaInvariants(secondPersisted.Actors, "player-assist-toggle");
            Assert.Equal(enabled, firstPersisted.AssistConfig.Enabled);
            Assert.Equal(enabled, secondPersisted.AssistConfig.Enabled);

            firstTick = firstPersisted.Tick;
            secondTick = secondPersisted.Tick;
        }
    }

    [Fact]
    public async Task PostBattleStep_AssistDisabled_DoesNotAutoCastHealOrOffense()
    {
        var playerId = "player-assist-disabled";
        var start = await StartBattleAsync("arena-assist-disabled", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var configured = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_assist_config", AssistConfig: BuildAssistConfig(
                enabled: false,
                autoHealEnabled: true,
                healAtHpPercent: 99,
                autoGuardEnabled: true,
                guardAtHpPercent: 99,
                autoOffenseEnabled: true,
                offenseMode: "cooldown_spam",
                maxAutoCastsPerTick: 1))]);
        AssertArenaInvariants(configured.Actors, playerId);
        Assert.Equal(false, configured.AssistConfig.Enabled);
        Assert.DoesNotContain(configured.Events.OfType<AssistCastEventDto>(), _ => true);

        var currentTick = configured.Tick;
        for (var i = 0; i < 24; i += 1)
        {
            var step = await StepBattleAsync(start.BattleId, currentTick, []);
            currentTick = step.Tick;
            AssertArenaInvariants(step.Actors, playerId);
            Assert.Equal(false, step.AssistConfig.Enabled);
            Assert.DoesNotContain(step.Events.OfType<AssistCastEventDto>(), _ => true);
        }
    }

    [Fact]
    public async Task PostBattleStep_AssistManualCastCommand_OverridesAutoCasting()
    {
        var playerId = "player-assist-manual-override";
        var start = await StartBattleAsync("arena-assist-manual-override", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var step = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [
                new BattleCommandDto("set_assist_config", AssistConfig: BuildAssistConfig(
                    enabled: true,
                    autoHealEnabled: true,
                    healAtHpPercent: 99,
                    autoGuardEnabled: true,
                    guardAtHpPercent: 99,
                    autoOffenseEnabled: true,
                    offenseMode: "cooldown_spam",
                    maxAutoCastsPerTick: 1)),
                new BattleCommandDto("cast_skill", "exori")
            ]);
        AssertArenaInvariants(step.Actors, playerId);

        var castResult = step.CommandResults.First(result => result.Type == "cast_skill");
        Assert.True(castResult.Ok);
        Assert.Equal(1200, GetSkill(step, "exori").CooldownRemainingMs);
        Assert.DoesNotContain(step.Events.OfType<AssistCastEventDto>(), _ => true);
    }

    [Fact]
    public async Task PostBattleStep_AssistBehavior_IsDeterministicForSameSeed()
    {
        var firstStart = await StartBattleAsync("arena-assist-determinism-a", "player-assist-determinism", 1337);
        var secondStart = await StartBattleAsync("arena-assist-determinism-b", "player-assist-determinism", 1337);
        AssertArenaInvariants(firstStart.Actors, "player-assist-determinism");
        AssertArenaInvariants(secondStart.Actors, "player-assist-determinism");

        var firstTick = firstStart.Tick;
        var secondTick = secondStart.Tick;
        var assistConfigCommand = new BattleCommandDto(
            "set_assist_config",
            AssistConfig: BuildAssistConfig(
                enabled: true,
                autoHealEnabled: true,
                healAtHpPercent: 45,
                autoGuardEnabled: true,
                guardAtHpPercent: 65,
                autoOffenseEnabled: true,
                offenseMode: "cooldown_spam",
                maxAutoCastsPerTick: 1));

        for (var stepIndex = 0; stepIndex < 40; stepIndex += 1)
        {
            var commands = stepIndex == 0
                ? new[] { assistConfigCommand }
                : Array.Empty<BattleCommandDto>();

            var firstStep = await StepBattleAsync(firstStart.BattleId, firstTick, commands);
            var secondStep = await StepBattleAsync(secondStart.BattleId, secondTick, commands);
            firstTick = firstStep.Tick;
            secondTick = secondStep.Tick;

            AssertArenaInvariants(firstStep.Actors, "player-assist-determinism");
            AssertArenaInvariants(secondStep.Actors, "player-assist-determinism");
            Assert.Equal(firstStep.FacingDirection, secondStep.FacingDirection);
            Assert.Equal(firstStep.EffectiveTargetEntityId, secondStep.EffectiveTargetEntityId);
            Assert.Equal(firstStep.LockedTargetEntityId, secondStep.LockedTargetEntityId);
            Assert.Equal(firstStep.AssistConfig.Enabled, secondStep.AssistConfig.Enabled);
            Assert.Equal(firstStep.AssistConfig.AutoHealEnabled, secondStep.AssistConfig.AutoHealEnabled);
            Assert.Equal(firstStep.AssistConfig.HealAtHpPercent, secondStep.AssistConfig.HealAtHpPercent);
            Assert.Equal(firstStep.AssistConfig.AutoGuardEnabled, secondStep.AssistConfig.AutoGuardEnabled);
            Assert.Equal(firstStep.AssistConfig.GuardAtHpPercent, secondStep.AssistConfig.GuardAtHpPercent);
            Assert.Equal(firstStep.AssistConfig.AutoOffenseEnabled, secondStep.AssistConfig.AutoOffenseEnabled);
            Assert.Equal(firstStep.AssistConfig.OffenseMode, secondStep.AssistConfig.OffenseMode);
            Assert.Equal(firstStep.AssistConfig.MaxAutoCastsPerTick, secondStep.AssistConfig.MaxAutoCastsPerTick);
            Assert.Equal(
                (firstStep.AssistConfig.AutoSkills ?? new Dictionary<string, bool>())
                    .OrderBy(entry => entry.Key, StringComparer.Ordinal)
                    .ToList(),
                (secondStep.AssistConfig.AutoSkills ?? new Dictionary<string, bool>())
                    .OrderBy(entry => entry.Key, StringComparer.Ordinal)
                    .ToList());

            var firstActors = firstStep.Actors
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}")
                .ToList();
            var secondActors = secondStep.Actors
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}")
                .ToList();
            Assert.Equal(firstActors, secondActors);
            Assert.Equal(
                firstStep.Events.Select(ToEventSignature).ToList(),
                secondStep.Events.Select(ToEventSignature).ToList());
        }
    }

    [Fact]
    public async Task PostBattleStep_WhenPaused_StepDoesNotAdvanceTimeOrChangePositions()
    {
        var playerId = "player-pause-freeze";
        var start = await StartBattleAsync("arena-pause-freeze", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var paused = await StepBattleAsync(
            start.BattleId,
            start.Tick,
            [new BattleCommandDto("set_paused", Paused: true)]);
        AssertArenaInvariants(paused.Actors, playerId);
        Assert.Equal(start.Tick, paused.Tick);
        Assert.True(Assert.Single(paused.CommandResults).Ok);
        var frozenActors = paused.Actors
            .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}")
            .ToList();

        for (var i = 0; i < 4; i += 1)
        {
            var step = await StepBattleAsync(start.BattleId, paused.Tick, []);
            AssertArenaInvariants(step.Actors, playerId);
            Assert.Equal(paused.Tick, step.Tick);
            Assert.Empty(step.CommandResults);
            var actors = step.Actors
                .OrderBy(actor => actor.ActorId, StringComparer.Ordinal)
                .Select(actor => $"{actor.ActorId}:{actor.TileX}:{actor.TileY}:{actor.Hp}:{actor.Shield}")
                .ToList();
            Assert.Equal(frozenActors, actors);
        }

        var resumed = await StepBattleAsync(
            start.BattleId,
            paused.Tick,
            [new BattleCommandDto("set_paused", Paused: false)]);
        AssertArenaInvariants(resumed.Actors, playerId);
        Assert.True(Assert.Single(resumed.CommandResults).Ok);
        Assert.True(resumed.Tick > paused.Tick);
    }

    [Fact]
    public async Task PostBattleChooseCard_ValidatesSelectionAndResumesSimulation()
    {
        var playerId = "player-choose-card";
        var start = await StartBattleAsync("arena-choose-card", playerId, 1337);
        AssertArenaInvariants(start.Actors, playerId);

        var pending = await WaitForCardChoiceAsync(start.BattleId, start.Tick, start.Skills);
        Assert.True(pending.IsAwaitingCardChoice);
        Assert.False(string.IsNullOrWhiteSpace(pending.PendingChoiceId));
        Assert.NotEmpty(pending.OfferedCards);

        var invalidResponse = await _client.PostAsJsonAsync(
            "/api/v1/battle/choose-card",
            new ChooseCardRequestDto(
                BattleId: start.BattleId,
                ChoiceId: pending.PendingChoiceId!,
                SelectedCardId: "invalid_card"));
        Assert.Equal(HttpStatusCode.BadRequest, invalidResponse.StatusCode);

        var selectedCardId = pending.OfferedCards[0].Id;
        var chosen = await ChooseCardAsync(start.BattleId, pending.PendingChoiceId!, selectedCardId);
        AssertArenaInvariants(chosen.Actors, playerId);
        Assert.False(chosen.IsAwaitingCardChoice);
        Assert.Contains(chosen.SelectedCards, card => card.Id == selectedCardId);
        Assert.Contains(
            chosen.Events.OfType<CardChosenEventDto>(),
            evt => evt.Card.Id == selectedCardId && evt.ChoiceId == pending.PendingChoiceId);

        var resumed = await StepBattleAsync(start.BattleId, chosen.Tick, []);
        Assert.True(resumed.Tick > chosen.Tick);
    }

    private async Task<AccountStateResponseDto> GetAccountStateAsync(string accountId = "dev_account")
    {
        var response = await _client.GetAsync($"/api/v1/account/state?accountId={accountId}");
        var payload = await response.Content.ReadFromJsonAsync<AccountStateResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    private static string FindOwnedEquipmentInstanceForSlot(
        AccountStateResponseDto state,
        CharacterStateDto character,
        string slot)
    {
        var definitionIdsForSlot = state.EquipmentCatalog
            .Where(entry => string.Equals(entry.Slot, slot, StringComparison.OrdinalIgnoreCase))
            .Select(entry => entry.ItemId)
            .ToHashSet(StringComparer.Ordinal);

        var ownedInstanceId = character.Inventory.EquipmentInstances
            .Where(entry => definitionIdsForSlot.Contains(entry.Value.DefinitionId))
            .Select(entry => entry.Key)
            .OrderBy(value => value, StringComparer.Ordinal)
            .FirstOrDefault();

        Assert.False(string.IsNullOrWhiteSpace(ownedInstanceId), $"Expected an owned item for slot '{slot}'.");
        return ownedInstanceId!;
    }

    private static List<DropSourceDto> BuildMobDropSources(string prefix, string speciesId, int count)
    {
        var sources = new List<DropSourceDto>(capacity: count);
        for (var index = 1; index <= count; index += 1)
        {
            sources.Add(new DropSourceDto(
                Tick: index,
                SourceType: "mob",
                SourceId: $"{prefix}.{index:D2}",
                Species: speciesId));
        }

        return sources;
    }

    private static bool IsAscendantItemId(string itemId)
    {
        return string.Equals(itemId, "wpn.ascendant_forged_blade", StringComparison.Ordinal) ||
            string.Equals(itemId, "arm.ascendant_forged_mail", StringComparison.Ordinal) ||
            string.Equals(itemId, "rel.ascendant_forged_emblem", StringComparison.Ordinal);
    }

    private async Task<BattleStartResponseDto> StartBattleAsync(
        string arenaId,
        string playerId,
        int? seed,
        int? seedOverride = null)
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/start",
            new BattleStartRequestDto(arenaId, playerId, seed, seedOverride));
        var payload = await response.Content.ReadFromJsonAsync<BattleStartResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    private async Task<BattleStepResponseDto> StepBattleAsync(
        string battleId,
        int clientTick,
        IReadOnlyList<BattleCommandDto> commands)
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/step",
            new BattleStepRequestDto(battleId, clientTick, Commands: commands));
        var payload = await response.Content.ReadFromJsonAsync<BattleStepResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    /// <summary>
    /// Gets the InMemoryBattleStore singleton from the DI container, cast from IBattleStore.
    /// Used for reflection-based state seeding in tests that need game mechanics not reachable organically.
    /// </summary>
    private InMemoryBattleStore GetBattleStore()
    {
        return (InMemoryBattleStore)_factory.Services.GetRequiredService<IBattleStore>();
    }

    private void CorruptCharacterSigilLoadoutWithMissingSigil(
        string accountId,
        string characterId,
        int slotIndex,
        string missingSigilInstanceId)
    {
        var accountStateStore = _factory.Services.GetRequiredService<IAccountStateStore>();
        _ = accountStateStore.GetAccountState(accountId);

        var accountsField = accountStateStore.GetType().GetField("_accounts", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(accountsField);
        var accounts = accountsField!.GetValue(accountStateStore);
        Assert.NotNull(accounts);

        var tryGetValueMethod = accounts!.GetType().GetMethod("TryGetValue");
        Assert.NotNull(tryGetValueMethod);
        var tryGetValueArgs = new object?[] { accountId, null };
        var found = (bool)tryGetValueMethod!.Invoke(accounts, tryGetValueArgs)!;
        Assert.True(found);
        var storedAccount = tryGetValueArgs[1];
        Assert.NotNull(storedAccount);

        var stateProperty = storedAccount!.GetType().GetProperty("State", BindingFlags.Instance | BindingFlags.Public);
        Assert.NotNull(stateProperty);
        var accountState = (AccountState)stateProperty!.GetValue(storedAccount)!;

        Assert.True(accountState.Characters.TryGetValue(characterId, out var character));
        var updatedCharacter = character with
        {
            SigilLoadout = character.SigilLoadout.SetSlotInstanceId(slotIndex, missingSigilInstanceId)
        };

        var updatedCharacters = new Dictionary<string, CharacterState>(accountState.Characters, StringComparer.Ordinal)
        {
            [characterId] = updatedCharacter
        };
        var updatedSigilInventory = new Dictionary<string, SigilInstance>(accountState.SigilInventory, StringComparer.Ordinal);
        updatedSigilInventory.Remove(missingSigilInstanceId);

        var updatedState = accountState with
        {
            Version = accountState.Version + 1,
            Characters = updatedCharacters,
            SigilInventory = updatedSigilInventory
        };

        stateProperty.SetValue(storedAccount, updatedState);
    }

    /// <summary>
    /// Uses reflection to set the KillsTotal for a specific mob archetype in a stored battle.
    /// Required because BestiaryFirstChestBaseKills=150 is not reachable in a single 3-minute run.
    /// </summary>
    private void SeedBestiaryKills(string battleId, MobArchetype archetype, int killsTotal)
    {
        var store = GetBattleStore();
        var battlesField = typeof(InMemoryBattleStore).GetField("_battles", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(battlesField);
        var battles = battlesField!.GetValue(store);
        Assert.NotNull(battles);
        var indexer = battles!.GetType().GetProperty("Item");
        Assert.NotNull(indexer);
        var state = indexer!.GetValue(battles, [battleId]);
        Assert.NotNull(state);
        var bestiaryProp = state!.GetType().GetProperty("Bestiary");
        Assert.NotNull(bestiaryProp);
        var bestiary = bestiaryProp!.GetValue(state) as IDictionary;
        Assert.NotNull(bestiary);
        var entry = bestiary![(object)archetype];
        Assert.NotNull(entry);
        var killsTotalProp = entry!.GetType().GetProperty("KillsTotal");
        Assert.NotNull(killsTotalProp);
        killsTotalProp!.SetValue(entry, killsTotal);
    }

    private async Task<BattleStepResponseDto> ChooseCardAsync(
        string battleId,
        string choiceId,
        string selectedCardId)
    {
        var response = await _client.PostAsJsonAsync(
            "/api/v1/battle/choose-card",
            new ChooseCardRequestDto(
                BattleId: battleId,
                ChoiceId: choiceId,
                SelectedCardId: selectedCardId));
        var payload = await response.Content.ReadFromJsonAsync<BattleStepResponseDto>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(payload);
        return payload;
    }

    private async Task<BattleStepResponseDto> ChoosePendingCardIfAwaitingAsync(
        BattleStepResponseDto step,
        string playerId)
    {
        AssertArenaInvariants(step.Actors, playerId);
        if (!step.IsAwaitingCardChoice)
        {
            return step;
        }

        Assert.False(string.IsNullOrWhiteSpace(step.PendingChoiceId));
        Assert.NotEmpty(step.OfferedCards);
        var chosen = await ChooseCardAsync(step.BattleId, step.PendingChoiceId!, step.OfferedCards[0].Id);
        AssertArenaInvariants(chosen.Actors, playerId);
        Assert.False(chosen.IsAwaitingCardChoice);
        return chosen;
    }

    private async Task<BattleStepResponseDto> DisableAssistAsync(string battleId, int tick, string playerId)
    {
        var step = await StepBattleAsync(
            battleId,
            tick,
            [new BattleCommandDto(
                "set_assist_config",
                AssistConfig: BuildAssistConfig(
                    enabled: false,
                    autoHealEnabled: false,
                    healAtHpPercent: 40,
                    autoGuardEnabled: false,
                    guardAtHpPercent: 60,
                    autoOffenseEnabled: false,
                    offenseMode: "smart",
                    maxAutoCastsPerTick: 1))]);
        AssertArenaInvariants(step.Actors, playerId);
        Assert.True(Assert.Single(step.CommandResults).Ok);
        return step;
    }

    private async Task<BattleStepResponseDto> WaitForCardChoiceAsync(
        string battleId,
        int initialTick,
        IReadOnlyList<SkillStateDto> initialSkills,
        int maxSteps = 2200)
    {
        var currentTick = initialTick;
        var currentSkills = initialSkills;
        BattleStepResponseDto? latest = null;

        for (var stepIndex = 0; stepIndex < maxSteps; stepIndex += 1)
        {
            latest = await StepBattleAsync(
                battleId,
                currentTick,
                BuildReadySkillCommands(currentSkills));
            currentTick = latest.Tick;
            currentSkills = latest.Skills;

            if (latest.IsAwaitingCardChoice)
            {
                return latest;
            }
        }

        throw new Xunit.Sdk.XunitException("Expected a pending card choice but none was offered.");
    }

    private async Task<BattleStepResponseDto> WaitUntilSkillReadyAsync(
        string battleId,
        int tick,
        string skillId,
        string playerId)
    {
        var currentTick = tick;
        BattleStepResponseDto? latest = null;
        for (var i = 0; i < 20; i += 1)
        {
            latest = await StepBattleAsync(battleId, currentTick, []);
            latest = await ChoosePendingCardIfAwaitingAsync(latest, playerId);
            currentTick = latest.Tick;
            AssertArenaInvariants(latest.Actors, playerId);
            if (GetSkill(latest, skillId).CooldownRemainingMs == 0)
            {
                return latest;
            }
        }

        throw new Xunit.Sdk.XunitException($"Skill '{skillId}' did not become ready within expected steps.");
    }

    private async Task<BattleStepResponseDto> WaitForMobCountAsync(
        string battleId,
        int tick,
        string playerId,
        int targetMobCount,
        string? skillIdWhenReady,
        int maxSteps)
    {
        var currentTick = tick;
        BattleStepResponseDto? latest = null;

        for (var i = 0; i < maxSteps; i += 1)
        {
            var commands = Array.Empty<BattleCommandDto>();
            if (skillIdWhenReady is not null && latest is not null && GetSkill(latest, skillIdWhenReady).CooldownRemainingMs == 0)
            {
                commands = [new BattleCommandDto("cast_skill", skillIdWhenReady)];
            }

            latest = await StepBattleAsync(battleId, currentTick, commands);
            currentTick = latest.Tick;
            AssertArenaInvariants(latest.Actors, playerId);
            if (latest.Actors.Count(actor => actor.Kind == "mob") == targetMobCount)
            {
                return latest;
            }
        }

        throw new Xunit.Sdk.XunitException($"Expected mob count {targetMobCount} not reached within {maxSteps} steps.");
    }

    private async Task<int> FindSeedAsync(Func<BattleStartResponseDto, bool> predicate, int maxSeed = 500)
    {
        for (var seed = 1; seed <= maxSeed; seed += 1)
        {
            var payload = await StartBattleAsync(
                arenaId: $"seed-scan-arena-{seed}",
                playerId: $"seed-scan-player-{seed}",
                seed: seed);
            if (predicate(payload))
            {
                return seed;
            }
        }

        throw new Xunit.Sdk.XunitException($"No suitable seed found in range 1..{maxSeed}.");
    }

    private async Task<AltarActivationResult> ActivateFirstAvailableAltarAsync(
        BattleStartResponseDto start,
        string playerId,
        int maxSteps)
    {
        var currentTick = start.Tick;
        IReadOnlyList<ActorStateDto> currentActors = start.Actors;
        IReadOnlyList<SkillStateDto> currentSkills = start.Skills;
        IReadOnlyList<BattlePoiDto> currentPois = start.ActivePois;

        for (var stepIndex = 0; stepIndex < maxSteps; stepIndex += 1)
        {
            var commands = new List<BattleCommandDto>();
            string? attemptedPoiId = null;
            var altar = currentPois
                .Where(poi => poi.Type == "altar")
                .OrderBy(poi => poi.PoiId, StringComparer.Ordinal)
                .FirstOrDefault();
            if (altar is null)
            {
                commands.AddRange(BuildSustainCommands(currentSkills));
            }
            else
            {
                var player = GetActor(currentActors, playerId);
                var distance = ComputeChebyshevDistance(player.TileX, player.TileY, altar.Pos.X, altar.Pos.Y);
                if (distance > 1)
                {
                    commands.Add(BuildMoveCommand(ResolveMoveDirectionToward(player.TileX, player.TileY, altar.Pos.X, altar.Pos.Y)));
                }

                if (distance <= 2)
                {
                    attemptedPoiId = altar.PoiId;
                    commands.Add(BuildInteractPoiCommand(altar.PoiId));
                }
            }

            var actorsBeforeStep = currentActors;
            var step = await StepBattleAsync(start.BattleId, currentTick, commands);
            AssertArenaInvariants(step.Actors, playerId);
            step = await ChoosePendingCardIfAwaitingAsync(step, playerId);
            currentTick = step.Tick;
            currentActors = step.Actors;
            currentSkills = step.Skills;
            currentPois = step.ActivePois;

            if (attemptedPoiId is not null &&
                step.CommandResults.Any(result =>
                    result.Type == "interact_poi" &&
                    result.Ok &&
                    result.Reason is null))
            {
                return new AltarActivationResult(step, actorsBeforeStep, attemptedPoiId);
            }
        }

        throw new Xunit.Sdk.XunitException("Failed to activate an altar within expected steps.");
    }

    private static int ComputeChebyshevDistance(int sourceTileX, int sourceTileY, int targetTileX, int targetTileY)
    {
        return Math.Max(Math.Abs(sourceTileX - targetTileX), Math.Abs(sourceTileY - targetTileY));
    }

    private static string? ResolveExpectedEffectiveFallbackTargetId(IReadOnlyList<ActorStateDto> actors, string playerId)
    {
        var player = GetActor(actors, playerId);
        return actors
            .Where(actor => actor.Kind == "mob")
            .OrderBy(actor => ComputeChebyshevDistance(actor.TileX, actor.TileY, player.TileX, player.TileY))
            .ThenBy(actor => actor.ActorId, StringComparer.Ordinal)
            .Select(actor => actor.ActorId)
            .FirstOrDefault();
    }

    private static string ResolveFacingDirectionTowardTile(
        int sourceTileX,
        int sourceTileY,
        int targetTileX,
        int targetTileY,
        string currentFacingDirection)
    {
        var deltaX = targetTileX - sourceTileX;
        var deltaY = targetTileY - sourceTileY;
        if (deltaX == 0 && deltaY == 0)
        {
            return currentFacingDirection;
        }

        if (Math.Abs(deltaX) >= Math.Abs(deltaY))
        {
            if (deltaX > 0)
            {
                return "right";
            }

            if (deltaX < 0)
            {
                return "left";
            }
        }
        else
        {
            if (deltaY > 0)
            {
                return "down";
            }

            if (deltaY < 0)
            {
                return "up";
            }
        }

        return currentFacingDirection;
    }

    private static BattleCommandDto[] BuildSustainCommands(IReadOnlyList<SkillStateDto> skills)
    {
        // Heal and Guard are no longer in the kit; use ready kit skills for sustain.
        return BuildReadySkillCommands(skills);
    }

    private static string ResolveMoveDirectionToward(int sourceTileX, int sourceTileY, int targetTileX, int targetTileY)
    {
        var stepX = Math.Sign(targetTileX - sourceTileX);
        var stepY = Math.Sign(targetTileY - sourceTileY);
        if (stepX == 0 && stepY < 0)
        {
            return "up";
        }

        if (stepX == 0 && stepY > 0)
        {
            return "down";
        }

        if (stepX < 0 && stepY == 0)
        {
            return "left";
        }

        if (stepX > 0 && stepY == 0)
        {
            return "right";
        }

        if (stepX > 0 && stepY < 0)
        {
            return "ne";
        }

        if (stepX > 0 && stepY > 0)
        {
            return "se";
        }

        if (stepX < 0 && stepY < 0)
        {
            return "nw";
        }

        if (stepX < 0 && stepY > 0)
        {
            return "sw";
        }

        return "up";
    }

    private static string ResolveMoveDirectionAway(int sourceTileX, int sourceTileY, int avoidTileX, int avoidTileY)
    {
        var stepX = Math.Sign(sourceTileX - avoidTileX);
        var stepY = Math.Sign(sourceTileY - avoidTileY);
        if (stepX == 0 && stepY < 0)
        {
            return "up";
        }

        if (stepX == 0 && stepY > 0)
        {
            return "down";
        }

        if (stepX < 0 && stepY == 0)
        {
            return "left";
        }

        if (stepX > 0 && stepY == 0)
        {
            return "right";
        }

        if (stepX > 0 && stepY < 0)
        {
            return "ne";
        }

        if (stepX > 0 && stepY > 0)
        {
            return "se";
        }

        if (stepX < 0 && stepY < 0)
        {
            return "nw";
        }

        if (stepX < 0 && stepY > 0)
        {
            return "sw";
        }

        return "up";
    }

    private static int GetExpectedMobCapForTick(int tick)
    {
        var elapsedMs = tick * StepDeltaMs;
        return elapsedMs < EarlyMobConcurrentCapDurationMs
            ? EarlyMobConcurrentCap
            : MaxAliveMobs;
    }

    private static bool IsPlayerAutoAttackDamageEvent(
        BattleStepResponseDto step,
        string playerId,
        DamageNumberEventDto damage)
    {
        if (!string.Equals(damage.AttackerEntityId, playerId, StringComparison.Ordinal) ||
            !damage.TargetEntityId.StartsWith("mob.", StringComparison.Ordinal) ||
            damage.DamageAmount <= 0 ||
            damage.ElementType != ElementType.Physical)
        {
            return false;
        }

        return step.Events
            .OfType<AttackFxEventDto>()
            .Any(attackFx =>
                attackFx.FxKind == CombatFxKind.MeleeSwing &&
                attackFx.FromTileX == damage.AttackerTileX &&
                attackFx.FromTileY == damage.AttackerTileY &&
                attackFx.ToTileX == damage.TargetTileX &&
                attackFx.ToTileY == damage.TargetTileY);
    }

    private static bool IsRangedMob(ActorStateDto actor)
    {
        return actor.MobType is MobArchetype.RangedArcher or MobArchetype.RangedShaman;
    }

    private static bool IsMeleeMob(ActorStateDto actor)
    {
        return actor.MobType is MobArchetype.MeleeBrute or MobArchetype.MeleeDemon;
    }

    private static bool IsChestPoi(BattlePoiDto poi)
    {
        return poi.Type is "chest" or "species_chest";
    }

    private static IReadOnlyDictionary<string, BestiaryEntryDto> ToBestiaryMap(IReadOnlyList<BestiaryEntryDto> entries)
    {
        return entries.ToDictionary(entry => entry.Species, entry => entry, StringComparer.Ordinal);
    }

    private static string ToBestiarySignature(IReadOnlyList<BestiaryEntryDto> entries)
    {
        return string.Join(
            "|",
            entries
                .OrderBy(entry => entry.Species, StringComparer.Ordinal)
                .Select(entry => $"{entry.Species}:{entry.KillsTotal}:{entry.NextChestAtKills}:{entry.Rank}"));
    }

    private static void AssertBestiaryRanksMatchKills(IReadOnlyList<BestiaryEntryDto> entries)
    {
        foreach (var entry in entries)
        {
            Assert.Equal(ResolveExpectedBestiaryRank(entry.KillsTotal), entry.Rank);
        }
    }

    private static int ResolveBestiaryRankKillThreshold(int rank)
    {
        if (rank < 1)
        {
            throw new Xunit.Sdk.XunitException($"Rank must be >= 1 but was {rank}.");
        }

        var clampedIndex = Math.Min(rank - 1, BestiaryRankKillThresholds.Length - 1);
        return BestiaryRankKillThresholds[clampedIndex];
    }

    private static int ResolveExpectedBestiaryRank(int killsTotal)
    {
        var clampedKills = Math.Max(0, killsTotal);
        for (var index = BestiaryRankKillThresholds.Length - 1; index >= 0; index -= 1)
        {
            if (clampedKills < BestiaryRankKillThresholds[index])
            {
                continue;
            }

            return index + 1;
        }

        return 1;
    }

    private static int ComputeXpToNextLevel(int runLevel)
    {
        var clampedLevel = Math.Max(RunInitialLevel, runLevel);
        return RunLevelXpBase + ((clampedLevel - RunInitialLevel) * RunLevelXpIncrementPerLevel);
    }

    private static RunProgressSnapshot ComputeExpectedRunProgress(int totalRunXp)
    {
        var runLevel = RunInitialLevel;
        var remainingXp = Math.Max(0, totalRunXp);
        var xpToNextLevel = ComputeXpToNextLevel(runLevel);
        while (remainingXp >= xpToNextLevel)
        {
            remainingXp -= xpToNextLevel;
            runLevel += 1;
            xpToNextLevel = ComputeXpToNextLevel(runLevel);
        }

        return new RunProgressSnapshot(runLevel, remainingXp, xpToNextLevel);
    }

    private static string MapMobArchetypeToSpeciesId(MobArchetype archetype)
    {
        return archetype switch
        {
            MobArchetype.MeleeBrute => "melee_brute",
            MobArchetype.RangedArcher => "ranged_archer",
            MobArchetype.MeleeDemon => "melee_demon",
            MobArchetype.RangedShaman => "ranged_shaman",
            _ => archetype.ToString()
        };
    }

    private static IEnumerable<int> GetOrderedCausalityIds(IReadOnlyList<BattleEventDto> events)
    {
        foreach (var battleEvent in events)
        {
            if (battleEvent is AttackFxEventDto attackFx)
            {
                yield return attackFx.EventId;
                continue;
            }

            if (battleEvent is DamageNumberEventDto damageEvent)
            {
                yield return damageEvent.HitId;
            }
        }
    }

    private static string ToEventSignature(BattleEventDto battleEvent)
    {
        return battleEvent switch
        {
            FxSpawnEventDto fx =>
                $"fx:{fx.FxId}:{fx.TileX}:{fx.TileY}:{fx.Layer}:{fx.DurationMs}:{(int)fx.Element}",
            AttackFxEventDto attackFx =>
                $"attack:{(int)attackFx.FxKind}:{attackFx.FromTileX}:{attackFx.FromTileY}:{attackFx.ToTileX}:{attackFx.ToTileY}:{(int)attackFx.ElementType}:{attackFx.DurationMs}:{attackFx.CreatedAtTick}:{attackFx.EventId}",
            DamageNumberEventDto damage =>
                $"damage:{damage.AttackerEntityId}:{damage.AttackerTileX}:{damage.AttackerTileY}:{damage.TargetEntityId}:{damage.TargetTileX}:{damage.TargetTileY}:{damage.DamageAmount}:{(int)damage.ElementType}:{damage.IsKill}:{damage.IsCrit}:{damage.HitId}:{damage.HitKind}",
            DeathEventDto death =>
                $"death:{death.EntityId}:{death.EntityType}:{(int?)death.MobType}:{death.TileX}:{death.TileY}:{(int?)death.ElementType}:{death.KillerEntityId}:{death.TickIndex}",
            HealNumberEventDto heal =>
                $"heal:{heal.ActorId}:{heal.Amount}:{heal.Source}",
            ReflectEventDto reflect =>
                $"reflect:{reflect.SourceEntityId}:{reflect.SourceTileX}:{reflect.SourceTileY}:{reflect.TargetEntityId}:{reflect.TargetTileX}:{reflect.TargetTileY}:{reflect.Amount}:{(int)reflect.ElementType}:{(int?)reflect.TargetMobType}",
            AssistCastEventDto assistCast =>
                $"assist:{assistCast.SkillId}:{assistCast.Reason}",
            PoiInteractedEventDto poiInteracted =>
                $"poi_interacted:{poiInteracted.PoiId}:{poiInteracted.PoiType}:{poiInteracted.TileX}:{poiInteracted.TileY}",
            InteractFailedEventDto interactFailed =>
                $"interact_failed:{interactFailed.PoiId}:{interactFailed.Reason}",
            BuffAppliedEventDto buffApplied =>
                $"buff_applied:{buffApplied.BuffId}:{buffApplied.DurationMs}",
            AltarActivatedEventDto altarActivated =>
                $"altar_activated:{altarActivated.RequestedCount}:{altarActivated.SpawnedCount}",
            SpeciesChestSpawnedEventDto speciesChestSpawned =>
                $"species_chest_spawned:{speciesChestSpawned.Species}:{speciesChestSpawned.PoiId}:{speciesChestSpawned.TileX}:{speciesChestSpawned.TileY}",
            SpeciesChestOpenedEventDto speciesChestOpened =>
                $"species_chest_opened:{speciesChestOpened.Species}:{speciesChestOpened.BuffId}:{speciesChestOpened.DurationMs}",
            CritTextEventDto critText =>
                $"crit_text:{critText.Text}:{critText.TileX}:{critText.TileY}:{critText.StartAtMs}:{critText.DurationMs}",
            LevelUpEventDto levelUp =>
                $"level_up:{levelUp.PreviousLevel}:{levelUp.NewLevel}:{levelUp.RunXp}:{levelUp.XpToNextLevel}",
            XpGainedEventDto xpGained =>
                $"xp_gained:{xpGained.Amount}:{xpGained.SourceSpeciesId}:{xpGained.IsElite}",
            CardChoiceOfferedEventDto offered =>
                $"card_choice_offered:{offered.ChoiceId}:{string.Join(",", offered.OfferedCards.Select(card => card.Id))}",
            CardChosenEventDto chosen =>
                $"card_chosen:{chosen.ChoiceId}:{chosen.Card.Id}",
            EliteSpawnedEventDto eliteSpawned =>
                $"elite_spawned:{eliteSpawned.EliteEntityId}:{(int)eliteSpawned.MobType}",
            EliteBuffAppliedEventDto eliteBuffApplied =>
                $"elite_buff_applied:{eliteBuffApplied.EliteEntityId}:{eliteBuffApplied.TargetEntityId}",
            EliteBuffRemovedEventDto eliteBuffRemoved =>
                $"elite_buff_removed:{eliteBuffRemoved.EliteEntityId}:{eliteBuffRemoved.TargetEntityId}",
            EliteDiedEventDto eliteDied =>
                $"elite_died:{eliteDied.EliteEntityId}:{(int)eliteDied.MobType}",
            RunEndedEventDto runEnded =>
                $"run_ended:{runEnded.Reason}:{runEnded.TimestampMs}",
            _ => battleEvent.GetType().Name
        };
    }

    private static void AssertNoMobOnPoiTile(BattleStepResponseDto step)
    {
        var activePoiTiles = step.ActivePois
            .Select(poi => (poi.Pos.X, poi.Pos.Y))
            .ToHashSet();
        Assert.DoesNotContain(
            step.Actors.Where(actor => actor.Kind == "mob"),
            mob => activePoiTiles.Contains((mob.TileX, mob.TileY)));
    }

    private static void AssertArenaInvariants(IReadOnlyList<ActorStateDto> actors, string playerId)
    {
        Assert.NotEmpty(actors);
        Assert.All(actors, actor =>
        {
            Assert.InRange(actor.TileX, 0, ArenaWidth - 1);
            Assert.InRange(actor.TileY, 0, ArenaHeight - 1);
            Assert.True(actor.MaxShield >= 0);
            Assert.InRange(actor.Shield, 0, actor.MaxShield);
            if (actor.Kind == "mob")
            {
                Assert.NotNull(actor.MobType);
            }
        });

        var uniqueTiles = new HashSet<(int TileX, int TileY)>();
        foreach (var actor in actors)
        {
            Assert.True(
                uniqueTiles.Add((actor.TileX, actor.TileY)),
                $"Duplicate occupancy at ({actor.TileX},{actor.TileY}).");
        }

        var player = GetActor(actors, playerId);
        Assert.Equal((int)Math.Floor(player.MaxHp * 0.45d), player.MaxShield);
    }

    private static ActorStateDto GetActor(IReadOnlyList<ActorStateDto> actors, string actorId)
    {
        return Assert.Single(actors, actor => actor.ActorId == actorId);
    }

    private static SkillStateDto GetSkill(BattleStepResponseDto payload, string skillId)
    {
        return Assert.Single(payload.Skills, skill => skill.SkillId == skillId);
    }

    private static int GetCooldownRemainingMs(IReadOnlyList<SkillStateDto> skills, string skillId)
    {
        return Assert.Single(skills, skill => skill.SkillId == skillId).CooldownRemainingMs;
    }

    private static int GetBuffRemainingMs(IReadOnlyList<BattleBuffDto> buffs, string buffId)
    {
        return buffs
            .Where(buff => buff.BuffId == buffId)
            .Select(buff => buff.RemainingMs)
            .DefaultIfEmpty(0)
            .Max();
    }

    private static BattleCommandDto BuildMoveCommand(string direction)
    {
        return new BattleCommandDto("move_player", Dir: direction);
    }

    private static BattleCommandDto BuildInteractPoiCommand(string poiId)
    {
        return new BattleCommandDto("interact_poi", PoiId: poiId);
    }

    private static BattleCommandDto[] BuildReadySkillCommands(IReadOnlyList<SkillStateDto> skills)
    {
        var commands = new List<BattleCommandDto>(capacity: 3);
        if (GetCooldownRemainingMs(skills, "exori_mas") == 0)
        {
            commands.Add(new BattleCommandDto("cast_skill", "exori_mas"));
        }

        if (GetCooldownRemainingMs(skills, "exori") == 0)
        {
            commands.Add(new BattleCommandDto("cast_skill", "exori"));
        }

        if (GetCooldownRemainingMs(skills, "exori_min") == 0)
        {
            commands.Add(new BattleCommandDto("cast_skill", "exori_min"));
        }

        return [.. commands];
    }

    private static AssistConfigDto BuildAssistConfig(
        bool enabled,
        bool autoHealEnabled,
        int healAtHpPercent,
        bool autoGuardEnabled,
        int guardAtHpPercent,
        bool autoOffenseEnabled,
        string offenseMode,
        int maxAutoCastsPerTick)
    {
        return new AssistConfigDto(
            Enabled: enabled,
            AutoHealEnabled: autoHealEnabled,
            HealAtHpPercent: healAtHpPercent,
            AutoGuardEnabled: autoGuardEnabled,
            GuardAtHpPercent: guardAtHpPercent,
            AutoOffenseEnabled: autoOffenseEnabled,
            OffenseMode: offenseMode,
            AutoSkills: new Dictionary<string, bool>(StringComparer.Ordinal)
            {
                ["exori"] = true,
                ["exori_min"] = true,
                ["exori_mas"] = true,
                ["avalanche"] = true
            },
            MaxAutoCastsPerTick: maxAutoCastsPerTick);
    }

    private sealed record AltarActivationResult(
        BattleStepResponseDto ActivatedStep,
        IReadOnlyList<ActorStateDto> ActorsBeforeActivation,
        string ConsumedPoiId);

    private sealed record RunProgressSnapshot(
        int RunLevel,
        int RunXp,
        int XpToNextLevel);
}
