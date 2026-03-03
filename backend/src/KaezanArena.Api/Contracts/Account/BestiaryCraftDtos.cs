namespace KaezanArena.Api.Contracts.Account;

public sealed record BestiaryCraftRequestDto(
    string SpeciesId,
    string Slot);

public sealed record BestiaryCraftResponseDto(
    long EchoFragmentsBalance,
    CharacterStateDto Character,
    OwnedEquipmentInstanceDto CraftedItem);
