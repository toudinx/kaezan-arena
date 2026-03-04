namespace KaezanArena.Api.Contracts.Battle;

public sealed record CardChoiceOfferedEventDto(
    string ChoiceId,
    IReadOnlyList<BattleCardOfferDto> OfferedCards) : BattleEventDto;
