namespace KaezanArena.Api.Contracts.Battle;

public sealed record BloodFangDetonatedEventDto(
    TilePos TargetPosition,
    IReadOnlyList<TilePos> AffectedTiles,
    int UltimateLevel,
    IReadOnlyList<BloodFangDetonationHitDto> Hits,
    IReadOnlyList<BloodFangExecutionEventDto> Executions) : BattleEventDto;
