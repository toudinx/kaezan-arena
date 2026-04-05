namespace KaezanArena.Api.Contracts.Account;

public sealed record SigilInventoryResponseDto(
    string AccountId,
    IReadOnlyList<SigilInstanceDto> Sigils);

public sealed record CharacterSigilLoadoutStateDto(
    string AccountId,
    string CharacterId,
    CharacterSigilLoadoutDto Loadout,
    IReadOnlyList<SigilSlotStateDto> Slots);

public sealed record SigilSlotStateDto(
    int SlotIndex,
    string TierId,
    string TierName,
    bool IsUnlockedByMastery,
    bool IsPrerequisiteSatisfied,
    bool IsAscendantUnlocked,
    bool CanEquipNow,
    string? LockReasonCode,
    string? LockReason,
    SigilInstanceDto? EquippedSigil);

public sealed record EquipSigilToSlotRequestDto(
    string CharacterId,
    int SlotIndex,
    string SigilInstanceId);

public sealed record UnequipSigilFromSlotRequestDto(
    string CharacterId,
    int SlotIndex);

public sealed record SigilLoadoutMutationResponseDto(
    SigilInventoryResponseDto Inventory,
    CharacterSigilLoadoutStateDto CharacterLoadout);
