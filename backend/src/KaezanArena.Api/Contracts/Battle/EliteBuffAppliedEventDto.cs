namespace KaezanArena.Api.Contracts.Battle;

public sealed record EliteBuffAppliedEventDto(
    string EliteEntityId,
    string TargetEntityId) : BattleEventDto;
