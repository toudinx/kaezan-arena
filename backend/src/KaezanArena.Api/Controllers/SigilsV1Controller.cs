using KaezanArena.Api.Account;
using KaezanArena.Api.Battle;
using KaezanArena.Api.Contracts.Account;
using KaezanArena.Api.Contracts.Common;
using Microsoft.AspNetCore.Mvc;

namespace KaezanArena.Api.Controllers;

[ApiController]
[Route("api/v1/sigils")]
public sealed class SigilsV1Controller : ControllerBase
{
    private const string LockReasonMasteryLocked = "mastery_locked";
    private const string LockReasonPrerequisiteUnmet = "prerequisite_unmet";
    private readonly IAccountStateStore _accountStateStore;

    public SigilsV1Controller(IAccountStateStore accountStateStore)
    {
        _accountStateStore = accountStateStore;
    }

    [HttpGet("inventory")]
    public ActionResult<SigilInventoryResponseDto> GetInventory([FromQuery] string? accountId)
    {
        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var account = _accountStateStore.GetAccountState(normalizedAccountId);
        return Ok(ToSigilInventoryDto(account));
    }

    [HttpGet("loadout")]
    public ActionResult<CharacterSigilLoadoutStateDto> GetLoadout(
        [FromQuery] string? accountId,
        [FromQuery] string? characterId)
    {
        if (string.IsNullOrWhiteSpace(characterId))
        {
            return BadRequest(BuildValidationError("characterId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var normalizedCharacterId = characterId.Trim();
        var account = _accountStateStore.GetAccountState(normalizedAccountId);
        if (!account.Characters.TryGetValue(normalizedCharacterId, out var character))
        {
            return BadRequest(BuildValidationError($"Character '{normalizedCharacterId}' was not found."));
        }

        return Ok(ToCharacterSigilLoadoutStateDto(account, character));
    }

    [HttpPost("equip")]
    public ActionResult<SigilLoadoutMutationResponseDto> Equip(
        [FromBody] EquipSigilToSlotRequestDto request,
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

        if (request.SlotIndex <= 0)
        {
            return BadRequest(BuildValidationError("slotIndex must be >= 1"));
        }

        if (string.IsNullOrWhiteSpace(request.SigilInstanceId))
        {
            return BadRequest(BuildValidationError("sigilInstanceId is required"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var normalizedCharacterId = request.CharacterId.Trim();
        try
        {
            var account = _accountStateStore.EquipSigil(
                accountId: normalizedAccountId,
                characterId: normalizedCharacterId,
                slotIndex: request.SlotIndex,
                sigilInstanceId: request.SigilInstanceId.Trim());
            if (!account.Characters.TryGetValue(normalizedCharacterId, out var character))
            {
                return BadRequest(BuildValidationError($"Character '{normalizedCharacterId}' was not found."));
            }

            return Ok(new SigilLoadoutMutationResponseDto(
                Inventory: ToSigilInventoryDto(account),
                CharacterLoadout: ToCharacterSigilLoadoutStateDto(account, character)));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(BuildValidationError(ex.Message));
        }
    }

    [HttpPost("unequip")]
    public ActionResult<SigilLoadoutMutationResponseDto> Unequip(
        [FromBody] UnequipSigilFromSlotRequestDto request,
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

        if (request.SlotIndex <= 0)
        {
            return BadRequest(BuildValidationError("slotIndex must be >= 1"));
        }

        var normalizedAccountId = string.IsNullOrWhiteSpace(accountId) ? "dev_account" : accountId.Trim();
        var normalizedCharacterId = request.CharacterId.Trim();
        try
        {
            var account = _accountStateStore.UnequipSigil(
                accountId: normalizedAccountId,
                characterId: normalizedCharacterId,
                slotIndex: request.SlotIndex);
            if (!account.Characters.TryGetValue(normalizedCharacterId, out var character))
            {
                return BadRequest(BuildValidationError($"Character '{normalizedCharacterId}' was not found."));
            }

            return Ok(new SigilLoadoutMutationResponseDto(
                Inventory: ToSigilInventoryDto(account),
                CharacterLoadout: ToCharacterSigilLoadoutStateDto(account, character)));
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

    private static SigilInventoryResponseDto ToSigilInventoryDto(AccountState account)
    {
        return new SigilInventoryResponseDto(
            AccountId: account.AccountId,
            Sigils: account.SigilInventory.Values
                .OrderBy(sigil => sigil.SlotIndex)
                .ThenBy(sigil => sigil.SigilLevel)
                .ThenBy(sigil => sigil.InstanceId, StringComparer.Ordinal)
                .Select(ToSigilInstanceDto)
                .ToList());
    }

    private static CharacterSigilLoadoutStateDto ToCharacterSigilLoadoutStateDto(AccountState account, CharacterState character)
    {
        return new CharacterSigilLoadoutStateDto(
            AccountId: account.AccountId,
            CharacterId: character.CharacterId,
            Loadout: ToCharacterSigilLoadoutDto(character.SigilLoadout, account.SigilInventory),
            Slots: BuildSlotStates(character, account.SigilInventory));
    }

    private static IReadOnlyList<SigilSlotStateDto> BuildSlotStates(
        CharacterState character,
        IReadOnlyDictionary<string, SigilInstance> sigilInventory)
    {
        var slots = new List<SigilSlotStateDto>(ArenaConfig.SigilConfig.SlotLevelRanges.Length);
        for (var slotIndex = 1; slotIndex <= ArenaConfig.SigilConfig.SlotLevelRanges.Length; slotIndex += 1)
        {
            var equipped = ResolveEquippedSigilDto(character.SigilLoadout.GetSlotInstanceId(slotIndex), sigilInventory);
            var isUnlockedByMastery = slotIndex <= character.UnlockedSigilSlots;
            var isPrerequisiteSatisfied = true;
            for (var requiredSlot = 1; requiredSlot < slotIndex; requiredSlot += 1)
            {
                if (!string.IsNullOrWhiteSpace(character.SigilLoadout.GetSlotInstanceId(requiredSlot)))
                {
                    continue;
                }

                isPrerequisiteSatisfied = false;
                break;
            }

            var isAscendantUnlocked = character.AscendantSigilSlotsUnlocked.TryGetValue(slotIndex - 1, out var unlocked) && unlocked;
            var canEquipNow = isUnlockedByMastery && isPrerequisiteSatisfied;
            var lockReasonCode = ResolveLockReasonCode(isUnlockedByMastery, isPrerequisiteSatisfied);
            var lockReason = ResolveLockReason(lockReasonCode);

            slots.Add(new SigilSlotStateDto(
                SlotIndex: slotIndex,
                TierId: ArenaConfig.SigilConfig.ResolveTierIdForSlotIndex(slotIndex),
                TierName: ArenaConfig.SigilConfig.ResolveTierNameForSlotIndex(slotIndex),
                IsUnlockedByMastery: isUnlockedByMastery,
                IsPrerequisiteSatisfied: isPrerequisiteSatisfied,
                IsAscendantUnlocked: isAscendantUnlocked,
                CanEquipNow: canEquipNow,
                LockReasonCode: lockReasonCode,
                LockReason: lockReason,
                EquippedSigil: equipped));
        }

        return slots;
    }

    private static string? ResolveLockReasonCode(bool isUnlockedByMastery, bool isPrerequisiteSatisfied)
    {
        if (!isUnlockedByMastery)
        {
            return LockReasonMasteryLocked;
        }

        if (!isPrerequisiteSatisfied)
        {
            return LockReasonPrerequisiteUnmet;
        }

        return null;
    }

    private static string? ResolveLockReason(string? lockReasonCode)
    {
        return lockReasonCode switch
        {
            LockReasonMasteryLocked => "Slot is locked by mastery progression.",
            LockReasonPrerequisiteUnmet => "Equip previous slots first.",
            _ => null
        };
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
}
