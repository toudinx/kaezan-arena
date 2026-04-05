using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Account;
using KaezanArena.Api.Contracts.Common;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/bestiary")]
public sealed class BestiaryV1Controller : ControllerBase
{
    private readonly IAccountStateStore _accountStateStore;

    public BestiaryV1Controller(IAccountStateStore accountStateStore)
    {
        _accountStateStore = accountStateStore;
    }

    [HttpPost("craft")]
    public ActionResult<BestiaryCraftResponseDto> Craft(
        [FromBody] BestiaryCraftRequestDto request,
        [FromQuery] string? accountId)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.SpeciesId))
        {
            return BadRequest(BuildValidationError("speciesId is required"));
        }

        if (string.IsNullOrWhiteSpace(request.Slot))
        {
            return BadRequest(BuildValidationError("slot is required"));
        }

        if (!Enum.TryParse<EquipmentSlot>(request.Slot.Trim(), ignoreCase: true, out var slot))
        {
            return BadRequest(BuildValidationError("slot must be: Weapon"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        try
        {
            var result = _accountStateStore.CraftBestiaryItem(
                accountId: normalizedAccountId,
                speciesId: request.SpeciesId.Trim(),
                slot: slot,
                characterId: string.IsNullOrWhiteSpace(request.CharacterId) ? null : request.CharacterId.Trim());

            return Ok(new BestiaryCraftResponseDto(
                EchoFragmentsBalance: result.Account.EchoFragmentsBalance,
                Character: ToCharacterDto(result.Character, result.Account.SigilInventory),
                CraftedItem: ToOwnedEquipmentInstanceDto(result.CraftedItem)));
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
            PrimalCoreBySpecies: ToSortedSpeciesCount(character.PrimalCoreBySpecies),
            AscendantProgress: BuildAscendantProgress(character));
    }

    private static IReadOnlyList<AscendantTierProgressDto> BuildAscendantProgress(CharacterState character)
    {
        var maxRankThreshold = ArenaConfig.BestiaryConfig.RankKillThresholds[ArenaConfig.BestiaryConfig.MaxRank - 1];
        var result = new List<AscendantTierProgressDto>();
        for (var tierIndex = 0; tierIndex < ArenaConfig.BestiaryConfig.TierSpecies.Length; tierIndex++)
        {
            var tierSpecies = ArenaConfig.BestiaryConfig.TierSpecies[tierIndex];
            if (tierSpecies.Length == 0) continue;
            var isUnlocked = character.AscendantSigilSlotsUnlocked.TryGetValue(tierIndex, out var unlocked) && unlocked;
            var speciesAtMaxRank = 0;
            var missingSpecies = new List<string>();
            foreach (var speciesId in tierSpecies)
            {
                var kills = character.BestiaryKillsBySpecies.TryGetValue(speciesId, out var k) ? k : 0;
                if (kills >= maxRankThreshold) speciesAtMaxRank++;
                else missingSpecies.Add(ArenaConfig.DisplayNames.TryGetValue(speciesId, out var name) ? name : speciesId);
            }
            var tierName = ArenaConfig.SigilConfig.ResolveTierNameForSlotIndex(tierIndex + 1);
            result.Add(new AscendantTierProgressDto(TierIndex: tierIndex, TierName: tierName, IsUnlocked: isUnlocked, SpeciesAtMaxRank: speciesAtMaxRank, SpeciesRequired: tierSpecies.Length, MissingSpecies: missingSpecies));
        }
        return result;
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
        var safeSlotIndex = Math.Clamp(sigil.SlotIndex, 1, ArenaConfig.SigilConfig.SlotTierNames.Length);
        return new SigilInstanceDto(
            InstanceId: sigil.InstanceId,
            DefinitionId: ResolveSigilDefinitionId(sigil),
            SpeciesId: sigil.SpeciesId,
            SpeciesDisplayName: ArenaConfig.DisplayNames.TryGetValue(sigil.SpeciesId, out var speciesDisplayName)
                ? speciesDisplayName
                : sigil.SpeciesId,
            SigilLevel: safeLevel,
            SlotIndex: safeSlotIndex,
            TierId: ArenaConfig.SigilConfig.ResolveTierIdForSlotIndex(safeSlotIndex),
            TierName: ArenaConfig.SigilConfig.ResolveTierNameForSlotIndex(safeSlotIndex),
            HpBonus: safeLevel * ArenaConfig.SigilConfig.HpBonusPerSigilLevel,
            IsLocked: sigil.IsLocked,
            RequiresAscendantUnlock: sigil.RequiresAscendantUnlock);
    }

    private static string ResolveSigilDefinitionId(SigilInstance sigil)
    {
        return string.IsNullOrWhiteSpace(sigil.DefinitionId)
            ? ArenaConfig.SigilConfig.ResolveDefinitionIdForSpeciesId(sigil.SpeciesId)
            : sigil.DefinitionId;
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

    private static IReadOnlyDictionary<string, int> ToSortedSpeciesCount(IReadOnlyDictionary<string, int> source)
    {
        var sorted = new SortedDictionary<string, int>(StringComparer.Ordinal);
        foreach (var (species, value) in source.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            sorted[species] = value;
        }

        return sorted;
    }

    private static OwnedEquipmentInstanceDto ToOwnedEquipmentInstanceDto(OwnedEquipmentInstance instance)
    {
        return new OwnedEquipmentInstanceDto(
            InstanceId: instance.InstanceId,
            DefinitionId: instance.DefinitionId,
            IsLocked: instance.IsLocked,
            OriginSpeciesId: instance.OriginSpeciesId,
            Slot: instance.Slot,
            Rarity: instance.Rarity,
            CraftedByCharacterId: instance.CraftedByCharacterId,
            CraftedByCharacterName: instance.CraftedByCharacterName);
    }
}
