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
                slot: slot);

            return Ok(new BestiaryCraftResponseDto(
                EchoFragmentsBalance: result.Account.EchoFragmentsBalance,
                Character: ToCharacterDto(result.Character),
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

    private static CharacterStateDto ToCharacterDto(CharacterState character)
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
            Inventory: new CharacterInventoryDto(
                MaterialStacks: materialStacks,
                EquipmentInstances: equipmentInstances),
            Equipment: new CharacterEquipmentDto(
                WeaponInstanceId: character.Equipment.WeaponInstanceId),
            BestiaryKillsBySpecies: ToSortedSpeciesCount(character.BestiaryKillsBySpecies),
            PrimalCoreBySpecies: ToSortedSpeciesCount(character.PrimalCoreBySpecies));
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
            Rarity: instance.Rarity);
    }
}
