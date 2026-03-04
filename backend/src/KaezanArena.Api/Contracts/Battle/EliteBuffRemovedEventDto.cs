namespace KaezanArena.Api.Contracts.Battle;

public sealed record EliteBuffRemovedEventDto(
    string EliteEntityId,
    string TargetEntityId) : BattleEventDto;
