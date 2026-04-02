namespace KaezanArena.Api.Contracts.Account;

public sealed record AccountStateResponseDto(
    AccountStateDto Account,
    IReadOnlyList<CharacterCatalogDefinitionDto> CharacterCatalog,
    IReadOnlyList<ItemDefinitionDto> ItemCatalog,
    IReadOnlyList<EquipmentDefinitionDto> EquipmentCatalog);

public sealed record SetActiveCharacterRequestDto(
    string AccountId,
    string CharacterId);

public sealed record EquipWeaponRequestDto(
    string AccountId,
    string CharacterId,
    string WeaponInstanceId);

public sealed record EquipItemRequestDto(
    string AccountId,
    string CharacterId,
    string Slot,
    string EquipmentInstanceId);

public sealed record AwardDropsRequestDto(
    string AccountId,
    string CharacterId,
    string BattleId,
    IReadOnlyList<DropSourceDto> Sources,
    string? RunId = null);

public sealed record AwardDropsResponseDto(
    IReadOnlyList<DropEventDto> Awarded,
    CharacterStateDto Character);

public sealed record SpendHollowEssenceBarrierRequestDto(
    string CharacterId);

public sealed record EquipSigilRequestDto(
    string CharacterId,
    string SigilInstanceId);

public sealed record UnequipSigilRequestDto(
    string CharacterId,
    int SlotIndex);
