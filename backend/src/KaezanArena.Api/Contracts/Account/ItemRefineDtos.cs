namespace KaezanArena.Api.Contracts.Account;

public sealed record ItemRefineRequestDto(
    string ItemInstanceId);

public sealed record ItemRefineResponseDto(
    long EchoFragmentsBalance,
    CharacterStateDto Character,
    OwnedEquipmentInstanceDto RefinedItem);
