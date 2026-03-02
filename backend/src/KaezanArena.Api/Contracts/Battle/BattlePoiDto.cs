namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattlePoiDto(
    string PoiId,
    string Type,
    BattleTilePosDto Pos,
    int RemainingMs,
    string? Species = null,
    IReadOnlyDictionary<string, string>? Metadata = null);

