namespace KaezanArena.Api.Contracts.Battle;

public sealed record BloodFangExecutionEventDto(
    string ExecutedMobId,
    TilePos ExecutedMobPosition,
    IReadOnlyList<BloodFangExecutionSpreadTargetDto> SpreadTargets);
