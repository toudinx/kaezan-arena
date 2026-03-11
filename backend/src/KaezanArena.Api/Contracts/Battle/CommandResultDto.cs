namespace KaezanArena.Api.Contracts.Battle;

public sealed record CommandResultDto(
    int Index,
    string Type,
    bool Ok,
    string? Reason,
    string? Status = null,
    string? MovementReason = null,
    int? BlockedTileX = null,
    int? BlockedTileY = null,
    string? BlockedByActorId = null);
