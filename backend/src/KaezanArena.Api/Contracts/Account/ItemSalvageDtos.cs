namespace KaezanArena.Api.Contracts.Account;

public sealed record ItemSalvageRequestDto(
    string ItemInstanceId);

public sealed record ItemSalvageResponseDto(
    long EchoFragmentsBalance,
    CharacterStateDto Character,
    string SalvagedItemInstanceId,
    string SpeciesId,
    int PrimalCoreAwarded);
