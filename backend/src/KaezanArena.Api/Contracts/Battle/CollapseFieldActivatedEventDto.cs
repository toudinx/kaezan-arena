namespace KaezanArena.Api.Contracts.Battle;

public sealed record CollapseFieldActivatedEventDto(
    TilePos PlayerPosition,
    IReadOnlyList<CollapseFieldMobPositionDto> Mobs) : BattleEventDto;
