namespace KaezanArena.Api.Contracts.Battle;

public sealed record XpGainedEventDto(
    int Amount,
    string? SourceSpeciesId,
    bool IsElite) : BattleEventDto;
