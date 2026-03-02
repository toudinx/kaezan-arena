namespace KaezanArena.Api.Contracts.Effects;

public sealed record AoePlanRequestDto(
    AoePlanCenterDto Center,
    int Radius,
    string Shape,
    string FxId);
