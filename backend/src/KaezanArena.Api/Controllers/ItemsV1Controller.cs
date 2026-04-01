using KaezanArena.Api.Account;
using KaezanArena.Api.Contracts.Account;
using KaezanArena.Api.Contracts.Common;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/items")]
public sealed class ItemsV1Controller : ControllerBase
{
    private readonly IAccountStateStore _accountStateStore;

    public ItemsV1Controller(IAccountStateStore accountStateStore)
    {
        _accountStateStore = accountStateStore;
    }

    [HttpPost("refine")]
    public ActionResult<ItemRefineResponseDto> Refine(
        [FromBody] ItemRefineRequestDto request,
        [FromQuery] string? accountId)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.ItemInstanceId))
        {
            return BadRequest(BuildValidationError("itemInstanceId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        try
        {
            var result = _accountStateStore.RefineItem(
                accountId: normalizedAccountId,
                itemInstanceId: request.ItemInstanceId.Trim());

            return Ok(new ItemRefineResponseDto(
                EchoFragmentsBalance: result.Account.EchoFragmentsBalance,
                Character: ToCharacterDto(result.Character),
                RefinedItem: ToOwnedEquipmentInstanceDto(result.RefinedItem)));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("salvage")]
    public ActionResult<ItemSalvageResponseDto> Salvage(
        [FromBody] ItemSalvageRequestDto request,
        [FromQuery] string? accountId)
    {
        if (request is null)
        {
            return BadRequest(BuildValidationError("request body is required"));
        }

        if (string.IsNullOrWhiteSpace(request.ItemInstanceId))
        {
            return BadRequest(BuildValidationError("itemInstanceId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        try
        {
            var result = _accountStateStore.SalvageItem(
                accountId: normalizedAccountId,
                itemInstanceId: request.ItemInstanceId.Trim());

            return Ok(new ItemSalvageResponseDto(
                EchoFragmentsBalance: result.Account.EchoFragmentsBalance,
                Character: ToCharacterDto(result.Character),
                SalvagedItemInstanceId: result.SalvagedItemInstanceId,
                SpeciesId: result.SpeciesId,
                PrimalCoreAwarded: result.PrimalCoreAwarded));
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
                WeaponInstanceId: character.Equipment.WeaponInstanceId),
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
