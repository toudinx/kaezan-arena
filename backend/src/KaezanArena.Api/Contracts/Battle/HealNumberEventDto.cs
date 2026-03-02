namespace KaezanArena.Api.Contracts.Battle;

public sealed record HealNumberEventDto(
    string ActorId,
    int Amount,
    string Source) : BattleEventDto;
