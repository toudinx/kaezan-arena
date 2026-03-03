namespace KaezanArena.Api.Contracts.Battle;

public sealed record SpeciesChestOpenedEventDto(
    string Species,
    string BuffId,
    int DurationMs) : BattleEventDto;
