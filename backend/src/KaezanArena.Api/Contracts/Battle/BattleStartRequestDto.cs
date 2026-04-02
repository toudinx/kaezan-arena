namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleStartRequestDto(
    string ArenaId,
    string PlayerId,
    int? Seed = null,
    int? SeedOverride = null,
    int? ZoneIndex = null);
