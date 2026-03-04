namespace KaezanArena.Api.Contracts.Battle;

public sealed record ChooseCardRequestDto(
    string BattleId,
    string ChoiceId,
    string SelectedCardId);
