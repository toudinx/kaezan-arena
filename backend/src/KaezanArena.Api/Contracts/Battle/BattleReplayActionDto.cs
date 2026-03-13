namespace KaezanArena.Api.Contracts.Battle;

public sealed record BattleReplayActionDto(
    string Type,
    int? ClientTick = null,
    IReadOnlyList<BattleCommandDto>? Commands = null,
    string? ChoiceId = null,
    string? SelectedCardId = null);
