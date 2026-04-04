namespace KaezanArena.Api.Contracts.Account;

public sealed record ItemRefineRequestDto(
    string ItemInstanceId,
    string? CharacterId = null);

public sealed record ItemRefineResponseDto(
    long EchoFragmentsBalance,
    CharacterStateDto Character,
    OwnedEquipmentInstanceDto RefinedItem);
