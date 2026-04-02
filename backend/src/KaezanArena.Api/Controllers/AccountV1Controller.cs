using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Account;
using KaezanArena.Api.Contracts.Common;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/account")]
public sealed class AccountV1Controller : ControllerBase
{
    private const int MaxAwardSourcesPerRequest = 50;
    private readonly IAccountStateStore _accountStateStore;
    private readonly IBattleStore _battleStore;

    public AccountV1Controller(IAccountStateStore accountStateStore, IBattleStore battleStore)
    {
        _accountStateStore = accountStateStore;
        _battleStore = battleStore;
    }

    [HttpGet("state")]
    public ActionResult<AccountStateResponseDto> GetState([FromQuery] string? accountId)
    {
        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var account = _accountStateStore.GetAccountState(normalizedAccountId);

        return Ok(new AccountStateResponseDto(
            Account: ToAccountDto(account),
            CharacterCatalog: AccountCatalog.CharacterDefinitions
                .OrderBy(definition => definition.CharacterId, StringComparer.Ordinal)
                .Select(ToCharacterCatalogDefinitionDto)
                .ToList(),
            ItemCatalog: AccountCatalog.ItemDefinitions
                .OrderBy(definition => definition.ItemId, StringComparer.Ordinal)
                .Select(ToItemDefinitionDto)
                .ToList(),
            EquipmentCatalog: AccountCatalog.EquipmentDefinitions
                .OrderBy(definition => definition.ItemId, StringComparer.Ordinal)
                .Select(ToEquipmentDefinitionDto)
                .ToList()));
    }

    [HttpGet("bestiary")]
    public ActionResult<BestiaryOverviewResponseDto> GetBestiary([FromQuery] string? accountId)
    {
        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var account = _accountStateStore.GetAccountState(normalizedAccountId);
        if (!account.Characters.TryGetValue(account.ActiveCharacterId, out var character))
        {
            return BadRequest(BuildValidationError($"activeCharacterId '{account.ActiveCharacterId}' not found for account"));
        }

        return Ok(new BestiaryOverviewResponseDto(
            SpeciesCatalog: AccountCatalog.SpeciesDefinitions
                .Select(definition => new BestiarySpeciesDto(
                    SpeciesId: definition.SpeciesId,
                    DisplayName: definition.DisplayName))
                .ToList(),
            Character: new CharacterBestiaryStateDto(
                CharacterId: character.CharacterId,
                Name: character.Name,
                BestiaryKillsBySpecies: ToSortedSpeciesCount(character.BestiaryKillsBySpecies),
                PrimalCoreBySpecies: ToSortedSpeciesCount(character.PrimalCoreBySpecies))));
    }

    [HttpPost("active-character")]
    public ActionResult<AccountStateDto> SetActiveCharacter([FromBody] SetActiveCharacterRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.AccountId))
        {
            return BadRequest(BuildValidationError("accountId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        try
        {
            var account = _accountStateStore.SetActiveCharacter(request.AccountId.Trim(), request.CharacterId.Trim());
            return Ok(ToAccountDto(account));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("equip-weapon")]
    public ActionResult<CharacterStateDto> EquipWeapon([FromBody] EquipWeaponRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.AccountId))
        {
            return BadRequest(BuildValidationError("accountId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.WeaponInstanceId))
        {
            return BadRequest(BuildValidationError("weaponInstanceId is required"));
        }

        try
        {
            var normalizedAccountId = request.AccountId.Trim();
            var character = _accountStateStore.EquipWeapon(
                accountId: normalizedAccountId,
                characterId: request.CharacterId.Trim(),
                weaponInstanceId: request.WeaponInstanceId.Trim());
            var account = _accountStateStore.GetAccountState(normalizedAccountId);
            return Ok(ToCharacterDto(character, account.SigilInventory));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("equip-item")]
    public ActionResult<CharacterStateDto> EquipItem([FromBody] EquipItemRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.AccountId))
        {
            return BadRequest(BuildValidationError("accountId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.Slot))
        {
            return BadRequest(BuildValidationError("slot is required"));
        }

        if (!EquipmentSlotMapper.TryFromCatalogSlot(request.Slot, out var slot))
        {
            return BadRequest(BuildValidationError("slot must be: weapon"));
        }

        if (string.IsNullOrWhiteSpace(request.EquipmentInstanceId))
        {
            return BadRequest(BuildValidationError("equipmentInstanceId is required"));
        }

        try
        {
            var normalizedAccountId = request.AccountId.Trim();
            var character = _accountStateStore.EquipItem(
                accountId: normalizedAccountId,
                characterId: request.CharacterId.Trim(),
                slot: slot,
                equipmentInstanceId: request.EquipmentInstanceId.Trim());
            var account = _accountStateStore.GetAccountState(normalizedAccountId);
            return Ok(ToCharacterDto(character, account.SigilInventory));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("award-drops")]
    public ActionResult<AwardDropsResponseDto> AwardDrops([FromBody] AwardDropsRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.AccountId))
        {
            return BadRequest(BuildValidationError("accountId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.BattleId))
        {
            return BadRequest(BuildValidationError("battleId is required"));
        }

        if (request.Sources is null)
        {
            return BadRequest(BuildValidationError("sources is required"));
        }

        if (request.Sources.Count > MaxAwardSourcesPerRequest)
        {
            return BadRequest(BuildValidationError($"sources count must be <= {MaxAwardSourcesPerRequest}"));
        }

        var parsedSources = new List<DropSource>(request.Sources.Count);
        foreach (var source in request.Sources)
        {
            if (source.Tick < 0)
            {
                return BadRequest(BuildValidationError("source tick must be >= 0"));
            }

            if (string.IsNullOrWhiteSpace(source.SourceType))
            {
                return BadRequest(BuildValidationError("sourceType is required"));
            }

            if (!string.Equals(source.SourceType, "mob", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(source.SourceType, "chest", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(BuildValidationError("sourceType must be 'mob' or 'chest'"));
            }

            if (string.IsNullOrWhiteSpace(source.SourceId))
            {
                return BadRequest(BuildValidationError("sourceId is required"));
            }

            parsedSources.Add(new DropSource(
                Tick: source.Tick,
                SourceType: source.SourceType.Trim(),
                SourceId: source.SourceId.Trim(),
                Species: string.IsNullOrWhiteSpace(source.Species) ? null : source.Species.Trim()));
        }

        try
        {
            var normalizedBattleId = request.BattleId.Trim();
            var normalizedRunId = string.IsNullOrWhiteSpace(request.RunId)
                ? normalizedBattleId
                : request.RunId.Trim();
            int? battleSeed = null;
            if (_battleStore.TryGetBattleSeed(normalizedBattleId, out var resolvedBattleSeed))
            {
                battleSeed = resolvedBattleSeed;
            }

            var result = _accountStateStore.AwardDrops(
                accountId: request.AccountId.Trim(),
                characterId: request.CharacterId.Trim(),
                battleId: normalizedBattleId,
                sources: parsedSources,
                runId: normalizedRunId,
                battleSeed: battleSeed);
            var account = _accountStateStore.GetAccountState(request.AccountId.Trim());

            return Ok(new AwardDropsResponseDto(
                Awarded: result.Awarded
                    .Select(ToDropEventDto)
                    .ToList(),
                Character: ToCharacterDto(result.Character, account.SigilInventory)));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("spend-hollow-essence-barrier")]
    public ActionResult<AccountStateDto> SpendHollowEssenceBarrier(
        [FromBody] SpendHollowEssenceBarrierRequestDto request,
        [FromQuery] string? accountId)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var result = _accountStateStore.SpendHollowEssenceForMilestoneBarrier(
            accountId: normalizedAccountId,
            characterId: request.CharacterId.Trim());
        if (!result.Success)
        {
            return BadRequest(BuildValidationError(result.FailureReason ?? "Unable to spend Hollow Essence barrier."));
        }

        return Ok(ToAccountDto(result.Account));
    }

    [HttpPost("equip-sigil")]
    public ActionResult<AccountStateDto> EquipSigil(
        [FromBody] EquipSigilRequestDto request,
        [FromQuery] string? accountId)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.SigilInstanceId))
        {
            return BadRequest(BuildValidationError("sigilInstanceId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        try
        {
            var account = _accountStateStore.EquipSigil(
                accountId: normalizedAccountId,
                characterId: request.CharacterId.Trim(),
                sigilInstanceId: request.SigilInstanceId.Trim());
            return Ok(ToAccountDto(account));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("unequip-sigil")]
    public ActionResult<AccountStateDto> UnequipSigil(
        [FromBody] UnequipSigilRequestDto request,
        [FromQuery] string? accountId)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.CharacterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        try
        {
            var account = _accountStateStore.UnequipSigil(
                accountId: normalizedAccountId,
                characterId: request.CharacterId.Trim(),
                slotIndex: request.SlotIndex);
            return Ok(ToAccountDto(account));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    private ApiErrorDto BuildValidationError(string message)
    {
        return new ApiErrorDto(
            Code: "validation_error",
            Message: message,
            TraceId: HttpContext.TraceIdentifier);
    }

    private static AccountStateDto ToAccountDto(AccountState account)
    {
        var sigilInventory = account.SigilInventory
            .Values
            .OrderBy(sigil => sigil.SlotIndex)
            .ThenBy(sigil => sigil.SigilLevel)
            .ThenBy(sigil => sigil.InstanceId, StringComparer.Ordinal)
            .Select(ToSigilInstanceDto)
            .ToList();

        var characters = new SortedDictionary<string, CharacterStateDto>(StringComparer.Ordinal);
        foreach (var (characterId, character) in account.Characters.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            characters[characterId] = ToCharacterDto(character, account.SigilInventory);
        }

        return new AccountStateDto(
            AccountId: account.AccountId,
            ActiveCharacterId: account.ActiveCharacterId,
            Version: account.Version,
            EchoFragmentsBalance: account.EchoFragmentsBalance,
            KaerosBalance: account.KaerosBalance,
            AccountLevel: account.AccountLevel,
            AccountXp: account.AccountXp,
            AccountXpForCurrentLevel: ResolveAccountXpForCurrentLevel(account),
            AccountXpRequiredForNextLevel: ResolveAccountXpRequiredForNextLevel(account),
            UnlockedZoneCount: ResolveUnlockedZoneCount(account.AccountLevel),
            DailyContracts: ToDailyContractsDto(account),
            SigilInventory: sigilInventory,
            Characters: characters);
    }

    private static DailyContractsDto ToDailyContractsDto(AccountState account)
    {
        var todayUtc = DateOnly.FromDateTime(DateTime.UtcNow);
        var dailyContracts = account.DailyContracts ?? new DailyContractsState(
            AssignedDate: todayUtc,
            Contracts: []);
        var contractDtos = new List<ContractDto>(dailyContracts.Contracts.Count);
        foreach (var contractState in dailyContracts.Contracts)
        {
            if (!DailyContractCatalog.ContractById.TryGetValue(contractState.ContractId, out var definition))
            {
                continue;
            }

            contractDtos.Add(new ContractDto(
                ContractId: definition.ContractId,
                Description: definition.Description,
                IsCompleted: contractState.IsCompleted,
                CurrentProgress: Math.Max(0, contractState.CurrentProgress),
                TargetValue: Math.Max(1, definition.TargetValue),
                KaerosReward: Math.Max(0, definition.KaerosReward),
                Type: definition.Type));
        }

        return new DailyContractsDto(
            AssignedDate: dailyContracts.AssignedDate,
            Contracts: contractDtos);
    }

    private static CharacterStateDto ToCharacterDto(
        CharacterState character,
        IReadOnlyDictionary<string, SigilInstance> sigilInventory)
    {
        var materialStacks = new SortedDictionary<string, long>(StringComparer.Ordinal);
        foreach (var (itemId, quantity) in character.Inventory.MaterialStacks.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            materialStacks[itemId] = quantity;
        }

        var equipmentInstances = new SortedDictionary<string, OwnedEquipmentInstanceDto>(StringComparer.Ordinal);
        foreach (var (instanceId, instance) in character.Inventory.EquipmentInstances.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            equipmentInstances[instanceId] = ToOwnedEquipmentInstanceDto(instance);
        }

        return new CharacterStateDto(
            CharacterId: character.CharacterId,
            Name: character.Name,
            MasteryLevel: character.MasteryLevel,
            MasteryXp: character.MasteryXp,
            MasteryXpForCurrentLevel: ResolveMasteryXpForCurrentLevel(character),
            MasteryXpRequiredForNextLevel: ResolveMasteryXpRequiredForNextLevel(character),
            UnlockedSigilSlots: character.UnlockedSigilSlots,
            SigilLoadout: ToCharacterSigilLoadoutDto(character.SigilLoadout, sigilInventory),
            Inventory: new CharacterInventoryDto(
                MaterialStacks: materialStacks,
                EquipmentInstances: equipmentInstances),
            Equipment: new CharacterEquipmentDto(
                WeaponInstanceId: character.Equipment.WeaponInstanceId),
            BestiaryKillsBySpecies: ToSortedSpeciesCount(character.BestiaryKillsBySpecies),
            PrimalCoreBySpecies: ToSortedSpeciesCount(character.PrimalCoreBySpecies));
    }

    private static CharacterSigilLoadoutDto ToCharacterSigilLoadoutDto(
        CharacterSigilLoadout loadout,
        IReadOnlyDictionary<string, SigilInstance> sigilInventory)
    {
        return new CharacterSigilLoadoutDto(
            Slot1: ResolveEquippedSigilDto(loadout.Slot1SigilInstanceId, sigilInventory),
            Slot2: ResolveEquippedSigilDto(loadout.Slot2SigilInstanceId, sigilInventory),
            Slot3: ResolveEquippedSigilDto(loadout.Slot3SigilInstanceId, sigilInventory),
            Slot4: ResolveEquippedSigilDto(loadout.Slot4SigilInstanceId, sigilInventory),
            Slot5: ResolveEquippedSigilDto(loadout.Slot5SigilInstanceId, sigilInventory));
    }

    private static SigilInstanceDto? ResolveEquippedSigilDto(
        string? sigilInstanceId,
        IReadOnlyDictionary<string, SigilInstance> sigilInventory)
    {
        if (string.IsNullOrWhiteSpace(sigilInstanceId))
        {
            return null;
        }

        return sigilInventory.TryGetValue(sigilInstanceId, out var sigil)
            ? ToSigilInstanceDto(sigil)
            : null;
    }

    private static SigilInstanceDto ToSigilInstanceDto(SigilInstance sigil)
    {
        var safeLevel = Math.Max(1, sigil.SigilLevel);
        return new SigilInstanceDto(
            InstanceId: sigil.InstanceId,
            SpeciesId: sigil.SpeciesId,
            SpeciesDisplayName: ResolveSpeciesDisplayName(sigil.SpeciesId),
            SigilLevel: safeLevel,
            SlotIndex: sigil.SlotIndex,
            TierName: ResolveSigilTierName(sigil.SlotIndex),
            HpBonus: safeLevel * ArenaConfig.SigilConfig.HpBonusPerSigilLevel);
    }

    private static string ResolveSpeciesDisplayName(string speciesId)
    {
        return ArenaConfig.DisplayNames.TryGetValue(speciesId, out var displayName)
            ? displayName
            : speciesId;
    }

    private static string ResolveSigilTierName(int slotIndex)
    {
        var safeIndex = Math.Clamp(slotIndex, 1, ArenaConfig.SigilConfig.SlotTierNames.Length);
        return ArenaConfig.SigilConfig.SlotTierNames[safeIndex - 1];
    }

    private static int ResolveMasteryXpForCurrentLevel(CharacterState character)
    {
        var masteryLevel = Math.Clamp(character.MasteryLevel, 1, ArenaConfig.MasteryConfig.MasteryLevelCap);
        if (masteryLevel >= ArenaConfig.MasteryConfig.MasteryLevelCap)
        {
            return 0;
        }

        var levelStartXp = ResolveTotalXpRequiredToReachLevel(masteryLevel);
        var xpInLevel = Math.Max(0L, character.MasteryXp - levelStartXp);
        var requiredForNextLevel = ResolveMasteryXpRequiredForNextLevel(character);
        if (requiredForNextLevel <= 0)
        {
            return 0;
        }

        return (int)Math.Min(requiredForNextLevel, xpInLevel);
    }

    private static int ResolveMasteryXpRequiredForNextLevel(CharacterState character)
    {
        var masteryLevel = Math.Clamp(character.MasteryLevel, 1, ArenaConfig.MasteryConfig.MasteryLevelCap);
        if (masteryLevel >= ArenaConfig.MasteryConfig.MasteryLevelCap)
        {
            return 0;
        }

        return ResolveMasteryXpRequiredForLevel(masteryLevel);
    }

    private static long ResolveTotalXpRequiredToReachLevel(int targetLevelInclusive)
    {
        var cappedTargetLevel = Math.Clamp(targetLevelInclusive, 1, ArenaConfig.MasteryConfig.MasteryLevelCap);
        long total = 0;
        for (var level = 1; level < cappedTargetLevel; level += 1)
        {
            total += ResolveMasteryXpRequiredForLevel(level);
        }

        return total;
    }

    private static int ResolveMasteryXpRequiredForLevel(int level)
    {
        var safeLevel = Math.Max(1, level);
        return (safeLevel * ArenaConfig.MasteryConfig.XpRequiredPerLevelMultiplier) +
               ArenaConfig.MasteryConfig.XpRequiredPerLevelBase;
    }

    private static int ResolveAccountXpForCurrentLevel(AccountState account)
    {
        var accountLevel = Math.Clamp(account.AccountLevel, 1, ArenaConfig.ZoneConfig.AccountLevelCap);
        if (accountLevel >= ArenaConfig.ZoneConfig.AccountLevelCap)
        {
            return 0;
        }

        var levelStartXp = ResolveTotalAccountXpRequiredToReachLevel(accountLevel);
        var xpInLevel = Math.Max(0L, account.AccountXp - levelStartXp);
        var requiredForNextLevel = ResolveAccountXpRequiredForNextLevel(account);
        if (requiredForNextLevel <= 0)
        {
            return 0;
        }

        return (int)Math.Min(requiredForNextLevel, xpInLevel);
    }

    private static int ResolveAccountXpRequiredForNextLevel(AccountState account)
    {
        var accountLevel = Math.Clamp(account.AccountLevel, 1, ArenaConfig.ZoneConfig.AccountLevelCap);
        if (accountLevel >= ArenaConfig.ZoneConfig.AccountLevelCap)
        {
            return 0;
        }

        return ArenaConfig.ZoneConfig.XpRequiredForLevel(accountLevel);
    }

    private static long ResolveTotalAccountXpRequiredToReachLevel(int targetLevelInclusive)
    {
        var cappedTargetLevel = Math.Clamp(targetLevelInclusive, 1, ArenaConfig.ZoneConfig.AccountLevelCap);
        long total = 0;
        for (var level = 1; level < cappedTargetLevel; level += 1)
        {
            total += ArenaConfig.ZoneConfig.XpRequiredForLevel(level);
        }

        return total;
    }

    private static int ResolveUnlockedZoneCount(int accountLevel)
    {
        var safeLevel = Math.Max(1, accountLevel);
        var unlocked = 1;
        for (var index = 0; index < ArenaConfig.ZoneConfig.AccountLevelToUnlockZone.Length; index += 1)
        {
            if (safeLevel < ArenaConfig.ZoneConfig.AccountLevelToUnlockZone[index])
            {
                break;
            }

            unlocked = index + 1;
        }

        return Math.Clamp(unlocked, 1, ArenaConfig.ZoneConfig.ZoneCount);
    }

    private static IReadOnlyDictionary<string, int> ToSortedSpeciesCount(IReadOnlyDictionary<string, int> source)
    {
        var sorted = new SortedDictionary<string, int>(StringComparer.Ordinal);
        foreach (var (species, value) in source.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            sorted[species] = value;
        }

        return sorted;
    }

    private static ItemDefinitionDto ToItemDefinitionDto(ItemDefinition definition)
    {
        return new ItemDefinitionDto(
            ItemId: definition.ItemId,
            DisplayName: definition.DisplayName,
            Kind: definition.Kind,
            Stackable: definition.Stackable,
            Rarity: definition.Rarity);
    }

    private static EquipmentDefinitionDto ToEquipmentDefinitionDto(EquipmentDefinition definition)
    {
        var modifiers = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, value) in definition.GameplayModifiers.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            modifiers[key] = value;
        }

        return new EquipmentDefinitionDto(
            ItemId: definition.ItemId,
            Slot: definition.Slot,
            WeaponClass: definition.WeaponClass,
            WeaponElement: definition.WeaponElement,
            GameplayModifiers: modifiers);
    }

    private static CharacterCatalogDefinitionDto ToCharacterCatalogDefinitionDto(CharacterCatalogDefinition definition)
    {
        return new CharacterCatalogDefinitionDto(
            CharacterId: definition.CharacterId,
            DisplayName: definition.DisplayName,
            Subtitle: definition.Subtitle,
            IsProvisional: definition.IsProvisional,
            FixedWeaponIds: definition.FixedWeaponIds.ToList(),
            FixedWeaponNames: definition.FixedWeaponNames.ToList());
    }

    private static DropEventDto ToDropEventDto(DropEvent dropEvent)
    {
        return new DropEventDto(
            DropEventId: dropEvent.DropEventId,
            AccountId: dropEvent.AccountId,
            CharacterId: dropEvent.CharacterId,
            BattleId: dropEvent.BattleId,
            Tick: dropEvent.Tick,
            SourceType: dropEvent.SourceType,
            SourceId: dropEvent.SourceId,
            ItemId: dropEvent.ItemId,
            Quantity: dropEvent.Quantity,
            EquipmentInstanceId: dropEvent.EquipmentInstanceId,
            RewardKind: dropEvent.RewardKind,
            Species: dropEvent.Species,
            AwardedAtUtc: dropEvent.AwardedAtUtc,
            SigilLevel: dropEvent.SigilLevel,
            SlotIndex: dropEvent.SlotIndex);
    }

    private static OwnedEquipmentInstanceDto ToOwnedEquipmentInstanceDto(OwnedEquipmentInstance instance)
    {
        return new OwnedEquipmentInstanceDto(
            InstanceId: instance.InstanceId,
            DefinitionId: instance.DefinitionId,
            IsLocked: instance.IsLocked,
            OriginSpeciesId: instance.OriginSpeciesId,
            Slot: instance.Slot,
            Rarity: instance.Rarity);
    }
}
