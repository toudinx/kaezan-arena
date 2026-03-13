namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleReplayDto(
    string ArenaId,
    string PlayerId,
    int Seed,
    IReadOnlyList<BattleReplayActionDto> Actions);
