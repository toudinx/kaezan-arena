namespace KaezanArena.Api.Contracts.Effects;

public sealed record AoePlanResponseDto(
    IReadOnlyList<AoePlanSpawnDto> Spawns);
