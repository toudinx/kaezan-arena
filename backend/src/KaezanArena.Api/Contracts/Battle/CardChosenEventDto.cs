namespace KaezanArena.Api.Contracts.Battle;

public sealed record CardChosenEventDto(
    string ChoiceId,
    BattleCardOfferDto Card) : BattleEventDto;
