namespace KaezanArena.Api.Contracts.Battle;

public sealed record AltarActivatedEventDto(
    int RequestedCount,
    int SpawnedCount) : BattleEventDto;
