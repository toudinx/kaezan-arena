namespace KaezanArena.Api.Contracts.Battle;

public sealed record BestiaryEntryDto(
    string Species,
    int KillsTotal,
    int NextChestAtKills,
    int Rank = 1);
