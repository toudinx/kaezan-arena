using KaezanArena.Api.Account;
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
            return BadRequest(BuildValidationError("slot must be one of: Weapon, Armor, Relic"));
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
            Level: character.Level,
            Xp: character.Xp,
            Inventory: new CharacterInventoryDto(
                MaterialStacks: materialStacks,
                EquipmentInstances: equipmentInstances),
            Equipment: new CharacterEquipmentDto(
                WeaponInstanceId: character.Equipment.WeaponInstanceId,
                ArmorInstanceId: character.Equipment.ArmorInstanceId,
                RelicInstanceId: character.Equipment.RelicInstanceId),
            BestiaryKillsBySpecies: ToSortedSpeciesCount(character.BestiaryKillsBySpecies),
            PrimalCoreBySpecies: ToSortedSpeciesCount(character.PrimalCoreBySpecies));
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
