namespace KaezanArena.Api.Contracts.Account;

public sealed record DropEventDto(
    string DropEventId,
    string AccountId,
    string CharacterId,
    string BattleId,
    int Tick,
    string SourceType,
    string SourceId,
    string ItemId,
    int Quantity,
    string? EquipmentInstanceId,
    string RewardKind,
    string? Species,
    DateTimeOffset AwardedAtUtc);

public sealed record DropSourceDto(
    int Tick,
    string SourceType,
    string SourceId,
    string? Species = null);
