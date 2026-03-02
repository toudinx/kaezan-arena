namespace KaezanArena.Application.Effects;

public sealed record AoePlanRequest(
    int CenterX,
    int CenterY,
    int Radius,
    string Shape,
    string FxId);
