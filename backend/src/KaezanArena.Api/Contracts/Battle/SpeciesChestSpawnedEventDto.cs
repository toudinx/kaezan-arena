namespace KaezanArena.Api.Contracts.Battle;

public sealed record SpeciesChestSpawnedEventDto(
    string Species,
    string PoiId,
    int TileX,
    int TileY) : BattleEventDto;
