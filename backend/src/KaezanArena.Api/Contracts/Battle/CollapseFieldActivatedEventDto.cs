namespace KaezanArena.Api.Contracts.Battle;

public sealed record CollapseFieldActivatedEventDto(
    TilePos PlayerPosition,
    IReadOnlyList<CollapseFieldPulledMobDto> PulledMobs,
    int ReflectDurationMs) : BattleEventDto;
