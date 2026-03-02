namespace KaezanArena.Api.Contracts.Battle;

public sealed record CommandResultDto(
    int Index,
    string Type,
    bool Ok,
    string? Reason);
